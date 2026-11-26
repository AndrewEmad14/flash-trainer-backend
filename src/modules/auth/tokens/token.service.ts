import { Injectable } from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { generateOpaqueToken, sha256Hex } from '../../../common/utils/hash.util';
import { AppConfigService } from '../../../config/app-config.service';

/** Verification links stay valid for 24 hours (FR-019). */
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
export const EMAIL_VERIFICATION_PURPOSE = 'verify_email';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SignedToken {
  token: string;
  expiresAt: Date;
}

export interface EmailVerificationClaims {
  userId: string;
  email: string;
}

export interface IssuedRefreshToken extends SignedToken {
  /** SHA-256 of `token`. Only this is stored (FR-032). */
  hash: string;
}

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Creates every token the auth feature uses (research R1, R3). */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Signs a short-lived access token, verified statelessly by the JWT guard.
   *
   * @param claims - `sub` is the user id; `sid` is the device session id.
   * @returns The JWT and its exact expiry.
   */
  async signAccessToken(claims: { sub: string; sid: string }): Promise<SignedToken> {
    const exp = nowSeconds() + this.config.jwt.accessTtlSeconds;
    const token = await this.jwt.signAsync(
      { sub: claims.sub, sid: claims.sid, exp },
      { secret: this.config.jwt.accessSecret, algorithm: 'HS256' },
    );
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /**
   * Creates a new opaque refresh token with a sliding 30-day expiry (FR-012).
   *
   * @returns The token (returned to the client once), its hash (stored) and its expiry.
   */
  issueRefreshToken(): IssuedRefreshToken {
    const token = generateOpaqueToken();
    return {
      token,
      hash: sha256Hex(token),
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * DAY_MS),
    };
  }

  /**
   * Signs a stateless email-verification token (research R3). It embeds the email, so it
   * stops working if the email ever changes.
   *
   * @param user - The account to verify.
   * @returns A JWT valid for 24 hours, signed with the separate email secret.
   */
  signEmailVerificationToken(user: { id: string; email: string }): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        purpose: EMAIL_VERIFICATION_PURPOSE,
        exp: nowSeconds() + EMAIL_VERIFICATION_TTL_SECONDS,
      },
      { secret: this.config.jwt.emailSecret, algorithm: 'HS256' },
    );
  }

  /**
   * Checks an email-verification token: signature (email secret), expiry and purpose.
   * The caller still has to check that the user exists and the email is unchanged.
   *
   * @returns The user id and the email the link was issued for.
   * @throws AppException AUTH_LINK_EXPIRED when older than 24 hours.
   * @throws AppException AUTH_LINK_INVALID for a bad signature, garbage or the wrong purpose.
   */
  async verifyEmailVerificationToken(token: string): Promise<EmailVerificationClaims> {
    let payload: Record<string, unknown>;
    try {
      payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.jwt.emailSecret,
        algorithms: ['HS256'],
      });
    } catch (error) {
      if (error instanceof TokenExpiredError) throw new AppException(ErrorCode.AUTH_LINK_EXPIRED);
      throw new AppException(ErrorCode.AUTH_LINK_INVALID);
    }
    const { sub, email, purpose } = payload;
    if (
      purpose !== EMAIL_VERIFICATION_PURPOSE ||
      typeof sub !== 'string' ||
      typeof email !== 'string'
    ) {
      throw new AppException(ErrorCode.AUTH_LINK_INVALID);
    }
    return { userId: sub, email };
  }
}
