import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { LoginAttemptsRepository, type FailurePolicy } from './login-attempts.repository';

/** FR-010: 5 failures within 15 minutes lock sign-in for 15 minutes after the 5th failure. */
export const LOGIN_FAILURE_POLICY: FailurePolicy = {
  windowMs: 15 * 60_000,
  maxFailures: 5,
  lockMs: 15 * 60_000,
};

/**
 * Per-account (or per unknown identifier) brute-force protection (research R5). Unknown
 * identifiers lock exactly like real accounts, so the lockout can't reveal whether an
 * account exists (SC-004).
 */
@Injectable()
export class LoginThrottleService {
  constructor(private readonly attempts: LoginAttemptsRepository) {}

  /**
   * The throttle key for a sign-in attempt: one key per account, so attempts by email and
   * by username count together, or one per normalised identifier when no account matches.
   *
   * @param userId - The matched account's id, if any.
   * @param identifier - The identifier as entered.
   */
  keyFor(userId: string | null, identifier: string): string {
    return userId ? `user:${userId}` : `ident:${identifier.trim().toLowerCase()}`;
  }

  /**
   * @throws AppException AUTH_TOO_MANY_ATTEMPTS (with a `Retry-After` header and the retry
   *   time in the message) while the key is locked.
   */
  async assertNotLocked(key: string): Promise<void> {
    const record = await this.attempts.find(key);
    const now = Date.now();
    if (record?.lockedUntil && record.lockedUntil.getTime() > now) {
      const retryAfterSeconds = Math.ceil((record.lockedUntil.getTime() - now) / 1000);
      throw new AppException(ErrorCode.AUTH_TOO_MANY_ATTEMPTS, {
        messageParams: { time: record.lockedUntil.toISOString() },
        headers: { 'Retry-After': String(retryAfterSeconds) },
      });
    }
  }

  /** Counts one failed attempt, locking the key once the limit is reached. */
  async registerFailure(key: string): Promise<void> {
    await this.attempts.upsertFailure(key, new Date(), LOGIN_FAILURE_POLICY);
  }

  /** Clears the counter after a successful sign-in. */
  async reset(key: string): Promise<void> {
    await this.attempts.delete(key);
  }
}
