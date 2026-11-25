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
});
