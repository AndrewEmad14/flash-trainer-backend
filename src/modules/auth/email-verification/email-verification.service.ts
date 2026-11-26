import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { AppConfigService } from '../../../config/app-config.service';
import { EmailDispatchType } from '../../../generated/prisma/client';
import { MailService } from '../../mail/mail.service';
import { UsersService } from '../../users/users.service';
import type { EmailVerificationResultDto } from '../dto/email-verification-result.dto';
import { verifyEmailTemplate } from '../../mail/templates/verify-email.template';
import { EmailDispatchService } from '../email-dispatch/email-dispatch.service';
import { TokenService } from '../tokens/token.service';

export interface VerificationRecipient {
  id: string;
  email: string;
  fullName: string;
}

/** Email verification (US7): send, resend and confirm. */
@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly dispatches: EmailDispatchService,
    private readonly config: AppConfigService,
    private readonly users: UsersService,
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

  /**
   * Confirms an email from a verification link (FR-019, FR-020). Opening the link again
   * after verification is harmless and reports `alreadyVerified: true`.
   *
   * @throws AppException AUTH_LINK_EXPIRED when the link is older than 24 hours.
   * @throws AppException AUTH_LINK_INVALID for a bad token, a deleted account, or an email
   *   that changed after the link was sent.
   */
  async confirm(token: string): Promise<EmailVerificationResultDto> {
    const claims = await this.tokens.verifyEmailVerificationToken(token);
    const user = await this.users.findById(claims.userId);
    if (!user || user.email !== claims.email) {
      throw new AppException(ErrorCode.AUTH_LINK_INVALID);
    }
    if (user.emailVerifiedAt) {
      return { isEmailVerified: true, alreadyVerified: true };
    }
    const verifiedNow = await this.users.markEmailVerified(user.id);
    return { isEmailVerified: true, alreadyVerified: !verifiedNow };
  }

  /**
   * Re-sends the verification link to a signed-in, unverified user (FR-021).
   *
   * @throws AppException AUTH_TOKEN_INVALID when the account no longer exists.
   * @throws AppException AUTH_EMAIL_ALREADY_VERIFIED when there's nothing to verify.
   * @throws AppException RATE_LIMIT_EXCEEDED (with `Retry-After`) at more than one email per
   *   minute or 5 per 24 hours.
   */
  async resend(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new AppException(ErrorCode.AUTH_TOKEN_INVALID);
    if (user.emailVerifiedAt) throw new AppException(ErrorCode.AUTH_EMAIL_ALREADY_VERIFIED);

    const decision = await this.dispatches.canSend(user.id, EmailDispatchType.VERIFY_EMAIL);
    if (!decision.allowed) {
      throw new AppException(ErrorCode.RATE_LIMIT_EXCEEDED, {
        headers: { 'Retry-After': String(decision.retryAfterSeconds) },
      });
    }
    await this.sendVerificationEmail(user);
  }
}
