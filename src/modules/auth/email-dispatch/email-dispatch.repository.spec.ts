import { EmailDispatchType } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../prisma/prisma.service';
import { EmailDispatchRepository } from './email-dispatch.repository';

describe('EmailDispatchRepository', () => {
  it('should insert a dispatch row for the user and type', async () => {
    const emailDispatch = { create: jest.fn().mockResolvedValue({ id: 'd1' }) };
    const repository = new EmailDispatchRepository({ emailDispatch } as unknown as PrismaService);

    await repository.create('u1', EmailDispatchType.VERIFY_EMAIL);

    expect(emailDispatch.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'VERIFY_EMAIL' },
    });
  });

  it('should fetch recent send times for the user and type, newest first', async () => {
    const findMany = jest.fn().mockResolvedValue([{ createdAt: new Date('2026-11-25T09:59:00Z') }]);
    const repository = new EmailDispatchRepository({
      emailDispatch: { findMany },
    } as unknown as PrismaService);
    const since = new Date('2026-11-24T10:00:00Z');

    await expect(
      repository.recentSendTimes('u1', EmailDispatchType.VERIFY_EMAIL, since, 5),
    ).resolves.toEqual([new Date('2026-11-25T09:59:00Z')]);
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', type: 'VERIFY_EMAIL', createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { createdAt: true },
    });
  });
});
