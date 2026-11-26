import { Injectable } from '@nestjs/common';
import type { EmailDispatchType } from '../../../generated/prisma/client';
import { EmailDispatchRepository } from './email-dispatch.repository';

/** FR-021 / FR-025: at most one email per minute and 5 per 24 hours, per user and type. */
export const EMAIL_DISPATCH_LIMITS = {
  minIntervalMs: 60_000,
  windowMs: 24 * 60 * 60_000,
  maxPerWindow: 5,
} as const;

export type SendDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Tracks auth emails sent, for the resend/reset rate limits (FR-021, FR-025, research R6). */
@Injectable()
export class EmailDispatchService {
  constructor(private readonly dispatches: EmailDispatchRepository) {}

  /**
   * Records that an email was sent.
   *
   * @param userId - Recipient account.
   * @param type - `VERIFY_EMAIL` or `RESET_PASSWORD`.
   */
  async record(userId: string, type: EmailDispatchType): Promise<void> {
    await this.dispatches.create(userId, type);
  }

  /**
   * Whether another email of `type` may be sent now (data-model.md EmailDispatch rule).
   *
   * @returns `allowed`, or how many seconds until it will be.
   */
  async canSend(userId: string, type: EmailDispatchType): Promise<SendDecision> {
    const now = Date.now();
    const { minIntervalMs, windowMs, maxPerWindow } = EMAIL_DISPATCH_LIMITS;
    const recent = await this.dispatches.recentSendTimes(
      userId,
      type,
      new Date(now - windowMs),
      maxPerWindow,
    );
    const waits: number[] = [];
    const newest = recent[0];
    if (newest && now - newest.getTime() < minIntervalMs) {
      waits.push(newest.getTime() + minIntervalMs - now);
    }
    const oldestCounted = recent[maxPerWindow - 1];
    if (oldestCounted) {
      waits.push(oldestCounted.getTime() + windowMs - now);
    }
    if (waits.length === 0) return { allowed: true };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(Math.max(...waits) / 1000)) };
  }
}
