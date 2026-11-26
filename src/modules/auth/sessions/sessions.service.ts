import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import { sha256Hex } from '../../../common/utils/hash.util';
import type { AuthTokensDto } from '../dto/auth-tokens.dto';
import type { SessionResponseDto } from '../dto/session-response.dto';
import type { IssuedRefreshToken, SignedToken } from '../tokens/token.service';
import { TokenService } from '../tokens/token.service';
import { toSessionResponse } from './session.mapper';
import { SessionsRepository } from './sessions.repository';

export interface DeviceInfo {
  deviceName?: string | null;
  deviceOs?: string | null;
}

/** Device sessions: one per signed-in device (FR-011). */
@Injectable()
export class SessionsService {
  constructor(
    private readonly sessions: SessionsRepository,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Signs a device in: stores a session holding only the refresh token's hash, then issues
   * an access token bound to that session (`sid`).
   *
   * @param userId - The account signing in.
   * @param device - Optional device name and OS, shown in the device list.
   * @returns The tokens for this device.
   */
  async createSession(userId: string, device: DeviceInfo = {}): Promise<AuthTokensDto> {
    const refresh = this.tokens.issueRefreshToken();
    const session = await this.sessions.create({
      userId,
      refreshTokenHash: refresh.hash,
      deviceName: device.deviceName ?? null,
      deviceOs: device.deviceOs ?? null,
      expiresAt: refresh.expiresAt,
    });
    const access = await this.tokens.signAccessToken({ sub: userId, sid: session.id });
    return toAuthTokens(access, refresh);
  }

  /**
   * Silently renews a device session (US3, FR-012 to FR-014): the presented refresh token is
   * replaced by a new one, and the session's 30-day expiry slides forward from now.
   * A deleted account has no sessions left (cascade), so its tokens are simply unknown.
   *
   * @param refreshToken - The token from the last sign-in or refresh.
   * @returns New tokens for the same session.
   * @throws AppException AUTH_SESSION_INVALID for an unknown, already-used (rotated) or
   *   revoked token, or when a simultaneous refresh with the same token won the race.
   * @throws AppException AUTH_SESSION_EXPIRED when the session wasn't used for 30 days.
   */
  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const currentHash = sha256Hex(refreshToken);
    const session = await this.sessions.findByRefreshTokenHash(currentHash);
    if (!session || session.revokedAt) {
      throw new AppException(ErrorCode.AUTH_SESSION_INVALID);
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new AppException(ErrorCode.AUTH_SESSION_EXPIRED);
    }

    const next = this.tokens.issueRefreshToken();
    const rotated = await this.sessions.rotate(session.id, currentHash, {
      refreshTokenHash: next.hash,
      expiresAt: next.expiresAt,
      lastUsedAt: new Date(),
    });
    if (!rotated) {
      throw new AppException(ErrorCode.AUTH_SESSION_INVALID);
    }
    const access = await this.tokens.signAccessToken({ sub: session.userId, sid: session.id });
    return toAuthTokens(access, next);
  }

  /**
   * Signs out the device that owns `refreshToken` (US5, FR-016). Idempotent: unknown, used
   * or already-revoked tokens are silently accepted, so the app can always finish signing
   * out. Its access token keeps working until it expires (at most 15 min, FR-014).
   */
  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    const session = await this.sessions.findByRefreshTokenHash(sha256Hex(refreshToken));
    if (session && !session.revokedAt) {
      await this.sessions.revoke(session.id);
    }
  }

  /**
   * Revokes every active session of a user (logout-all), optionally keeping one.
   *
   * @returns How many sessions were revoked.
   */
  revokeAll(userId: string, exceptSessionId?: string): Promise<number> {
    return this.sessions.revokeAllForUser(userId, exceptSessionId ? { exceptSessionId } : {});
  }

  /**
   * The user's active devices, with the requesting device marked (US6, FR-017).
   *
   * @param userId - The signed-in user.
   * @param currentSessionId - `sid` of the access token making the request.
   */
  async listForUser(userId: string, currentSessionId: string): Promise<SessionResponseDto[]> {
    const sessions = await this.sessions.listActive(userId);
    return sessions.map((session) => toSessionResponse(session, currentSessionId));
  }

  /**
   * Signs out one of the user's own devices remotely (US6). Revoking the current device is
   * allowed and works like signing out.
   *
   * @throws AppException SESSION_NOT_FOUND when the session doesn't exist, isn't active, or
   *   belongs to someone else. All three look the same, so nothing leaks (FR-031).
   */
  async revokeOwnSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.sessions.findActiveByIdForUser(sessionId, userId);
    if (!session) throw new AppException(ErrorCode.SESSION_NOT_FOUND);
    await this.sessions.revoke(session.id);
  }

  /**
   * Saves this device's push token on its session (US10, FR-018).
   *
   * @throws AppException AUTH_SESSION_INVALID when the session was signed out or expired.
   *   Its access token may still be valid, but it must not reattach for notifications.
   */
  async updatePushToken(sessionId: string, pushToken: string): Promise<void> {
    if (!(await this.sessions.setPushToken(sessionId, pushToken))) {
      throw new AppException(ErrorCode.AUTH_SESSION_INVALID);
    }
  }
}

function toAuthTokens(access: SignedToken, refresh: IssuedRefreshToken): AuthTokensDto {
  return {
    tokenType: 'Bearer',
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
  };
}
