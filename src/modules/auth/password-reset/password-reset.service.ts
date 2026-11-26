import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { generateOpaqueToken, sha256Hex } from '../../../common/utils/hash.util';
import { AppConfigService } from '../../../config/app-config.service';
import { EmailDispatchType } from '../../../generated/prisma/client';
import { MailService } from '../../mail/mail.service';
import { resetPasswordTemplate } from '../../mail/templates/reset-password.template';
import { UsersService } from '../../users/users.service';
import { EmailDispatchService } from '../email-dispatch/email-dispatch.service';
import { LoginThrottleService } from '../login-throttle/login-throttle.service';
import { PasswordHasherService } from '../passwords/password-hasher.service';
import { SessionsService } from '../sessions/sessions.service';
import { PasswordResetsRepository } from './password-resets.repository';

/** Reset links are valid for 1 hour (FR-024). */
export const PASSWORD_RESET_TTL_MS = 60 * 60_000;

/** Forgot / reset password (US8, research R4). */
@Injectable()
export class PasswordResetService implements OnApplicationShutdown {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly resets: PasswordResetsRepository,
    private readonly users: UsersService,
    private readonly passwords: PasswordHasherService,
    private readonly sessions: SessionsService,
    private readonly dispatches: EmailDispatchService,
    private readonly loginThrottle: LoginThrottleService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Starts a reset for `email` and returns **immediately**, the same way whether or not the
   * account exists (FR-023, SC-004). The lookup, rate check (FR-025) and email happen in the
   * background, so response timing doesn't reveal registered emails either.
   */
  request(email: string): void {
    const job = this.processRequest(email)
      .catch((error: unknown) => {
        this.logger.error(
          'Password reset request failed',
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => this.inFlight.delete(job));
    this.inFlight.add(job);
  }

  /** Lets queued reset emails finish before the app (and its DB pool) shuts down. */
  async onApplicationShutdown(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  /** The background part of {@link request}. Exposed for unit tests. */
  async processRequest(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    const decision = await this.dispatches.canSend(user.id, EmailDispatchType.RESET_PASSWORD);
    if (!decision.allowed) return;

    const token = generateOpaqueToken();
    await this.resets.deleteUnusedForUser(user.id);
    await this.resets.create({
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    });
    const link = `${this.config.links.baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({ to: user.email, ...resetPasswordTemplate(link, user.fullName) });
    await this.dispatches.record(user.id, EmailDispatchType.RESET_PASSWORD);
  }

  /**
   * Sets a new password from a reset link (FR-024, FR-026). In a fail-safe order:
   * 1. claim the link (compare-and-swap: single use, even under races),
   * 2. revoke every session,
   * 3. store the new password.
   * A failure part-way can only leave the user signed out with their old password. It can
   * never leave the new password set while old sessions stay alive.
   *
   * @throws AppException AUTH_LINK_INVALID for an unknown or superseded link.
   * @throws AppException AUTH_LINK_USED when the link was already used.
   * @throws AppException AUTH_LINK_EXPIRED when older than 1 hour.
   */
  async confirm(token: string, newPassword: string): Promise<void> {
    const reset = await this.resets.findByTokenHash(sha256Hex(token));
    if (!reset) throw new AppException(ErrorCode.AUTH_LINK_INVALID);
    if (reset.usedAt) throw new AppException(ErrorCode.AUTH_LINK_USED);
    if (reset.expiresAt.getTime() <= Date.now())
      throw new AppException(ErrorCode.AUTH_LINK_EXPIRED);

    const passwordHash = await this.passwords.hash(newPassword);
    if (!(await this.resets.markUsed(reset.id))) throw new AppException(ErrorCode.AUTH_LINK_USED);
    await this.sessions.revokeAll(reset.userId);
    await this.users.updatePasswordHash(reset.userId, passwordHash);
    // A lockout from earlier failed attempts must not block the new password.
    await this.loginThrottle.reset(this.loginThrottle.keyFor(reset.userId, ''));
  }
}
