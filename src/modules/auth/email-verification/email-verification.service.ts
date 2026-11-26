import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { EmailDispatchType } from '../../../generated/prisma/client';
import { MailService } from '../../mail/mail.service';
import { verifyEmailTemplate } from '../../mail/templates/verify-email.template';
import { EmailDispatchService } from '../email-dispatch/email-dispatch.service';
import { TokenService } from '../tokens/token.service';

export interface VerificationRecipient {
  id: string;
  email: string;
  fullName: string;
}

/** Email verification (US7). This slice only sends the email; confirming comes in US7. */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly dispatches: EmailDispatchService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Sends the verification link (valid 24h) and records the dispatch for rate limiting.
   * A delivery failure is logged and swallowed, so registration still succeeds; the user can
   * ask for a new link (research R12). The token is never logged.
   *
   * @param user - The account to verify.
   */
  async sendVerificationEmail(user: VerificationRecipient): Promise<void> {
    try {
      const token = await this.tokens.signEmailVerificationToken(user);
      const link = `${this.config.links.baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
      await this.mail.send({ to: user.email, ...verifyEmailTemplate(link, user.fullName) });
      await this.dispatches.record(user.id, EmailDispatchType.VERIFY_EMAIL);
    } catch (error) {
      this.logger.error(
        `Failed to send the verification email to user ${user.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
