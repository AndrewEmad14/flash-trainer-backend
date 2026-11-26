import { EmailDispatchType } from '../../../generated/prisma/client';
import type { EmailDispatchRepository } from './email-dispatch.repository';
import { EmailDispatchService } from './email-dispatch.service';

describe('EmailDispatchService', () => {
  const repository = { create: jest.fn(), recentSendTimes: jest.fn() };
  const service = new EmailDispatchService(repository as unknown as EmailDispatchRepository);
  const NOW = new Date('2026-11-25T10:00:00.000Z');
  const ago = (ms: number): Date => new Date(NOW.getTime() - ms);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => jest.useRealTimers());

  it('should record a dispatch through the repository', async () => {
    repository.create.mockResolvedValue({});

    await service.record('u1', EmailDispatchType.RESET_PASSWORD);

    expect(repository.create).toHaveBeenCalledWith('u1', 'RESET_PASSWORD');
  });

  describe('canSend', () => {
    it('should allow sending when nothing was sent in the last 24 hours', async () => {
      repository.recentSendTimes.mockResolvedValue([]);

      await expect(service.canSend('u1', EmailDispatchType.VERIFY_EMAIL)).resolves.toEqual({
        allowed: true,
      });
      expect(repository.recentSendTimes).toHaveBeenCalledWith(
        'u1',
        'VERIFY_EMAIL',
        ago(24 * 60 * 60_000),
        5,
      );
    });

    it('should allow sending once a minute has passed and fewer than 5 were sent', async () => {
      repository.recentSendTimes.mockResolvedValue([ago(61_000), ago(3_600_000)]);

      await expect(service.canSend('u1', EmailDispatchType.VERIFY_EMAIL)).resolves.toEqual({
        allowed: true,
      });
    });

    it('should refuse within a minute and say how long to wait', async () => {
      repository.recentSendTimes.mockResolvedValue([ago(20_000)]);

      await expect(service.canSend('u1', EmailDispatchType.VERIFY_EMAIL)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 40,
      });
    });

    it('should refuse the 6th email in 24 hours until the oldest one ages out', async () => {
      const hour = 3_600_000;
      repository.recentSendTimes.mockResolvedValue([
        ago(2 * hour),
        ago(4 * hour),
        ago(6 * hour),
        ago(8 * hour),
        ago(23 * hour),
      ]);

      await expect(service.canSend('u1', EmailDispatchType.RESET_PASSWORD)).resolves.toEqual({
        allowed: false,
        retryAfterSeconds: 3600,
      });
    });
  });
});
