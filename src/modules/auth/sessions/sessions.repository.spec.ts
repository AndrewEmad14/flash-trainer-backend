import type { PrismaService } from '../../../prisma/prisma.service';
import { SessionsRepository } from './sessions.repository';

describe('SessionsRepository', () => {
  const authSession = { create: jest.fn() };
  const repository = new SessionsRepository({ authSession } as unknown as PrismaService);

  afterEach(() => jest.useRealTimers());

  it('should create a session with lastUsedAt set to now', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T10:00:00Z') });
    authSession.create.mockResolvedValue({ id: 's1' });
    const data = {
      userId: 'u1',
      refreshTokenHash: 'h'.repeat(64),
      deviceName: 'Pixel 9',
      deviceOs: null,
      expiresAt: new Date('2026-12-25T10:00:00Z'),
    };

    await expect(repository.create(data)).resolves.toEqual({ id: 's1' });
    expect(authSession.create).toHaveBeenCalledWith({
      data: { ...data, lastUsedAt: new Date('2026-11-25T10:00:00Z') },
    });
  });
});
