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

  /**
   * Revokes one session: sets `revokedAt` and clears its push token (research R13).
   * Only active rows are touched, so revoking twice keeps the original revocation time.
   */
  async revoke(id: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), fcmToken: null },
    });
  }

  /**
   * Revokes every active session of a user, optionally keeping one (e.g. the current device
   * on password change).
   *
   * @returns How many sessions were revoked.
   */
  async revokeAllForUser(
    userId: string,
    options: { exceptSessionId?: string } = {},
  ): Promise<number> {
    const { count } = await this.prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(options.exceptSessionId ? { id: { not: options.exceptSessionId } } : {}),
      },
      data: { revokedAt: new Date(), fcmToken: null },
    });
    return count;
  }

  /**
   * A user's active sessions (data-model.md: `revoked_at IS NULL AND expires_at > now`),
   * most recently used first.
   */
  listActive(userId: string): Promise<AuthSession[]> {
    return this.prisma.authSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * An active session only if it belongs to `userId`, so callers can't learn about other
   * users' sessions (FR-031).
   */
  findActiveByIdForUser(id: string, userId: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findFirst({
      where: { id, userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
  }

  /**
   * Attaches a push token to an **active** session (research R13). In one transaction, the
   * same token is cleared from every other session, because a token identifies one app
   * install, so it belongs to exactly one session.
   *
   * @returns `false` if the session is no longer active (nothing changed).
   */
  async setPushToken(sessionId: string, fcmToken: string): Promise<boolean> {
    const [, assigned] = await this.prisma.$transaction([
      this.prisma.authSession.updateMany({
        where: { fcmToken, id: { not: sessionId } },
        data: { fcmToken: null },
      }),
      this.prisma.authSession.updateMany({
        where: { id: sessionId, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { fcmToken },
      }),
    ]);
    return assigned.count === 1;
  }

  /**
   * Cleanup (R16): deletes sessions that expired, or were revoked, before `cutoff`.
   *
   * @returns How many rows were deleted.
   */
  async deleteStale(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.authSession.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
    return count;
  }
}
