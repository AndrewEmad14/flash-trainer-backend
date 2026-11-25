import { EmailDispatchType } from '../../../generated/prisma/client';
import type { EmailDispatchRepository } from './email-dispatch.repository';
import { EmailDispatchService } from './email-dispatch.service';

describe('EmailDispatchService', () => {
  it('should record a dispatch through the repository', async () => {
    const repository = { create: jest.fn().mockResolvedValue({}) };
    const service = new EmailDispatchService(repository as unknown as EmailDispatchRepository);

    await service.record('u1', EmailDispatchType.RESET_PASSWORD);

    expect(repository.create).toHaveBeenCalledWith('u1', 'RESET_PASSWORD');
  });
});
