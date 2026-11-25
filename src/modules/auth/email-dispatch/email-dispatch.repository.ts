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
}
