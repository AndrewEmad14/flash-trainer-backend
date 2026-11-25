import { Injectable } from '@nestjs/common';
import type { AuthTokensDto } from '../dto/auth-tokens.dto';
import { TokenService } from '../tokens/token.service';
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
    return {
      tokenType: 'Bearer',
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken: refresh.token,
      refreshTokenExpiresAt: refresh.expiresAt.toISOString(),
    };
  }
}
