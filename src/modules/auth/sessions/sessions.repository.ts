import { Injectable } from '@nestjs/common';
import type { AuthSession } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface RotateSessionData {
  refreshTokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
}

export interface CreateSessionData {
  userId: string;
  refreshTokenHash: string;
  deviceName: string | null;
  deviceOs: string | null;
  expiresAt: Date;
}

/** The only place that touches `auth_sessions` (constitution §I). */
@Injectable()
export class SessionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Stores a new device session (data-model.md AuthSession). `lastUsedAt` starts now.
   *
   * @returns The created session.
   */
  create(data: CreateSessionData): Promise<AuthSession> {
    return this.prisma.authSession.create({ data: { ...data, lastUsedAt: new Date() } });
  }

  /** The session holding this refresh-token hash (any state), or `null`. */
  findByRefreshTokenHash(refreshTokenHash: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findUnique({ where: { refreshTokenHash } });
  }

  /**
   * Rotates a session's refresh token as a compare-and-swap: the update only applies if the
   * session still holds `currentHash` and isn't revoked. If two refreshes race with the same
   * token, exactly one wins (FR-013).
   *
   * @returns `true` if this call performed the rotation.
   */
  async rotate(id: string, currentHash: string, data: RotateSessionData): Promise<boolean> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { id, refreshTokenHash: currentHash, revokedAt: null },
      data,
    });
    return count === 1;
  }
}
