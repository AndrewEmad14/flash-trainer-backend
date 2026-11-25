import { Injectable } from '@nestjs/common';
import type { AuthSession } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

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
}
