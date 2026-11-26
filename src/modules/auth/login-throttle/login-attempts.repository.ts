import { Injectable } from '@nestjs/common';
import type { LoginAttempt } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface FailurePolicy {
  /** Failures within this window count together. */
  windowMs: number;
  /** Failures within the window that trigger a lock. */
  maxFailures: number;
  /** How long the lock lasts, counted from the failure that triggered it. */
  lockMs: number;
}

interface LoginAttemptRow {
  throttle_key: string;
  failed_count: number;
  window_started_at: Date;
  locked_until: Date | null;
}

/** The only place that touches `login_attempts` (research R5). */
@Injectable()
export class LoginAttemptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The attempt record for `throttleKey`, or `null`. */
  find(throttleKey: string): Promise<LoginAttempt | null> {
    return this.prisma.loginAttempt.findUnique({ where: { throttleKey } });
  }

  /**
   * Records one failed attempt atomically, in a single upsert, so parallel failures can't
   * slip past the limit (data-model.md LoginAttempt algorithm):
   * - if there's no row, or the window is older than `windowMs`: count = 1, window = now, no lock
   * - otherwise count += 1
   * - once count reaches `maxFailures`, lockedUntil = now + `lockMs`
   *
   * @returns The updated record.
   */
  async upsertFailure(
    throttleKey: string,
    now: Date,
    policy: FailurePolicy,
  ): Promise<LoginAttempt> {
    const windowStart = new Date(now.getTime() - policy.windowMs);
    const lockUntil = new Date(now.getTime() + policy.lockMs);
    const rows = await this.prisma.$queryRaw<LoginAttemptRow[]>`
      INSERT INTO login_attempts (throttle_key, failed_count, window_started_at, locked_until)
      VALUES (${throttleKey}, 1, ${now}, ${policy.maxFailures <= 1 ? lockUntil : null})
      ON CONFLICT (throttle_key) DO UPDATE SET
        failed_count = CASE
          WHEN login_attempts.window_started_at <= ${windowStart} THEN 1
          ELSE login_attempts.failed_count + 1 END,
        window_started_at = CASE
          WHEN login_attempts.window_started_at <= ${windowStart} THEN ${now}
          ELSE login_attempts.window_started_at END,
        locked_until = CASE
          WHEN login_attempts.window_started_at <= ${windowStart}
            THEN CASE WHEN 1 >= ${policy.maxFailures} THEN ${lockUntil}::timestamptz ELSE NULL END
          WHEN login_attempts.failed_count + 1 >= ${policy.maxFailures} THEN ${lockUntil}::timestamptz
          ELSE login_attempts.locked_until END
      RETURNING throttle_key, failed_count, window_started_at, locked_until`;
    const row = rows[0];
    if (!row) throw new Error('login_attempts upsert returned no row');
    return {
      throttleKey: row.throttle_key,
      failedCount: row.failed_count,
      windowStartedAt: row.window_started_at,
      lockedUntil: row.locked_until,
    };
  }

  /** Removes the record (after a successful sign-in or account deletion). Missing is fine. */
  async delete(throttleKey: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({ where: { throttleKey } });
  }

  /**
   * Cleanup (R16): deletes counters whose window started before `windowCutoff` and that hold
   * no lock still in force at `now`. An active lock is never removed.
   *
   * @returns How many rows were deleted.
   */
  async deleteStale(windowCutoff: Date, now: Date): Promise<number> {
    const { count } = await this.prisma.loginAttempt.deleteMany({
      where: {
        windowStartedAt: { lt: windowCutoff },
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
    });
    return count;
  }
}
