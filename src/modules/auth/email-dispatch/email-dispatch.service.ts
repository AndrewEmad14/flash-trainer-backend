import { Injectable } from '@nestjs/common';
import type { EmailDispatchType } from '../../../generated/prisma/client';
import { EmailDispatchRepository } from './email-dispatch.repository';

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
}
