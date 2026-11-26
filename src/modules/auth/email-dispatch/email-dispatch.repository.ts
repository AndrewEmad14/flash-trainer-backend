import { Injectable } from '@nestjs/common';
import type { EmailDispatch, EmailDispatchType } from '../../../generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** The only place that touches `email_dispatches` (research R6). */
@Injectable()
export class EmailDispatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Logs that an auth email of `type` was sent to `userId` (data-model.md EmailDispatch). */
  create(userId: string, type: EmailDispatchType): Promise<EmailDispatch> {
    return this.prisma.emailDispatch.create({ data: { userId, type } });
  }

  /**
   * When emails of `type` were sent to `userId` since `since`, newest first, capped at
   * `limit` (only the most recent few matter for the rate limit).
   */
  async recentSendTimes(
    userId: string,
    type: EmailDispatchType,
    since: Date,
    limit: number,
  ): Promise<Date[]> {
    const rows = await this.prisma.emailDispatch.findMany({
      where: { userId, type, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { createdAt: true },
    });
    return rows.map((row) => row.createdAt);
  }
}
