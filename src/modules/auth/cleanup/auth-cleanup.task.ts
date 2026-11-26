import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EMAIL_DISPATCH_LIMITS } from '../email-dispatch/email-dispatch.service';
import { EmailDispatchRepository } from '../email-dispatch/email-dispatch.repository';
import { LoginAttemptsRepository } from '../login-throttle/login-attempts.repository';
import { LOGIN_FAILURE_POLICY } from '../login-throttle/login-throttle.service';
import { PasswordResetsRepository } from '../password-reset/password-resets.repository';
import { SessionsRepository } from '../sessions/sessions.repository';

const DAY_MS = 24 * 60 * 60_000;

/** How long dead rows are kept before cleanup (research R16). */
export const RETENTION = {
  /** Expired or revoked sessions: kept 30 days for a short security history. */
  sessionsMs: 30 * DAY_MS,
  /** Reset links work for 1 hour; anything older than a day is certainly dead. */
  passwordResetsMs: DAY_MS,
  /** The email rate limit looks back at most 24 hours. */
  emailDispatchesMs: EMAIL_DISPATCH_LIMITS.windowMs,
  /** Failure counters only matter inside their window. */
  loginAttemptsMs: LOGIN_FAILURE_POLICY.windowMs,
} as const;

export type CleanupCounts = Record<
  'sessions' | 'passwordResets' | 'emailDispatches' | 'loginAttempts',
  number | 'failed'
>;

/**
 * Daily removal of rows that can never be used again (research R16): dead sessions, old reset
 * links, old email-dispatch logs and expired login counters. Keeps the tables bounded and
 * holds no more personal data than needed. Each table is cleaned on its own, so one failure
 * doesn't stop the rest, and the next run catches up.
 */
@Injectable()
export class AuthCleanupTask {
  private readonly logger = new Logger(AuthCleanupTask.name);

  constructor(
    private readonly sessions: SessionsRepository,
    private readonly resets: PasswordResetsRepository,
    private readonly dispatches: EmailDispatchRepository,
    private readonly loginAttempts: LoginAttemptsRepository,
  ) {}

  /** Runs every day at 03:00 server time. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'auth-cleanup' })
  async handleCron(): Promise<void> {
    await this.run();
  }

  /**
   * One cleanup pass. Exposed for tests and manual runs.
   *
   * @returns How many rows each table lost, or `'failed'` for a table whose delete threw.
   */
  async run(now: Date = new Date()): Promise<CleanupCounts> {
    const before = (ms: number): Date => new Date(now.getTime() - ms);
    const counts: CleanupCounts = {
      sessions: await this.safely('sessions', () =>
        this.sessions.deleteStale(before(RETENTION.sessionsMs)),
      ),
      passwordResets: await this.safely('password resets', () =>
        this.resets.deleteCreatedBefore(before(RETENTION.passwordResetsMs)),
      ),
      emailDispatches: await this.safely('email dispatches', () =>
        this.dispatches.deleteCreatedBefore(before(RETENTION.emailDispatchesMs)),
      ),
      loginAttempts: await this.safely('login attempts', () =>
        this.loginAttempts.deleteStale(before(RETENTION.loginAttemptsMs), now),
      ),
    };
    this.logger.log(
      `Cleanup removed ${String(counts.sessions)} sessions, ${String(counts.passwordResets)} password resets, ` +
        `${String(counts.emailDispatches)} email dispatches, ${String(counts.loginAttempts)} login attempts`,
    );
    return counts;
  }

  private async safely(label: string, work: () => Promise<number>): Promise<number | 'failed'> {
    try {
      return await work();
    } catch (error) {
      this.logger.error(
        `Cleanup of ${label} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      return 'failed';
    }
  }
}
