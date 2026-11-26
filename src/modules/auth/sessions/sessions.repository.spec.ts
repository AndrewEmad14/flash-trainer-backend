import type { PrismaService } from '../../../prisma/prisma.service';
import { SessionsRepository } from './sessions.repository';

describe('SessionsRepository', () => {
  const authSession = { create: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() };
  const repository = new SessionsRepository({ authSession } as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());
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

  it('should find a session by refresh-token hash', async () => {
    authSession.findUnique.mockResolvedValue(null);

    await expect(repository.findByRefreshTokenHash('h1')).resolves.toBeNull();
    expect(authSession.findUnique).toHaveBeenCalledWith({ where: { refreshTokenHash: 'h1' } });
  });

  it('should rotate only if the session still holds the current hash and is not revoked', async () => {
    const data = {
      refreshTokenHash: 'h2',
      expiresAt: new Date('2026-12-25T10:00:00Z'),
      lastUsedAt: new Date('2026-11-25T10:00:00Z'),
    };
    authSession.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(repository.rotate('s1', 'h1', data)).resolves.toBe(true);
    await expect(repository.rotate('s1', 'h1', data)).resolves.toBe(false);
    expect(authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', refreshTokenHash: 'h1', revokedAt: null },
      data,
    });
  });

  it('should revoke one active session and clear its push token', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T10:00:00Z') });
    authSession.updateMany.mockResolvedValue({ count: 1 });

    await repository.revoke('s1');

    expect(authSession.updateMany).toHaveBeenCalledWith({
      where: { id: 's1', revokedAt: null },
      data: { revokedAt: new Date('2026-11-25T10:00:00Z'), fcmToken: null },
    });
  });

  it('should revoke all active sessions of a user, optionally except one', async () => {
    authSession.updateMany.mockResolvedValue({ count: 2 });

    await expect(repository.revokeAllForUser('u1')).resolves.toBe(2);
    await repository.revokeAllForUser('u1', { exceptSessionId: 's9' });

    expect(authSession.updateMany).toHaveBeenNthCalledWith(1, {
      where: { userId: 'u1', revokedAt: null },
      data: { revokedAt: expect.any(Date), fcmToken: null },
    });
    expect(authSession.updateMany).toHaveBeenNthCalledWith(2, {
      where: { userId: 'u1', revokedAt: null, id: { not: 's9' } },
      data: { revokedAt: expect.any(Date), fcmToken: null },
    });
  });

  it('should list only active sessions of the user, newest use first', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T10:00:00Z') });
    const findMany = jest.fn().mockResolvedValue([]);
    const repo = new SessionsRepository({ authSession: { findMany } } as unknown as PrismaService);

    await repo.listActive('u1');

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, expiresAt: { gt: new Date('2026-11-25T10:00:00Z') } },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });
  });

  it("should find an active session only within the user's own sessions", async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T10:00:00Z') });
    const findFirst = jest.fn().mockResolvedValue(null);
    const repo = new SessionsRepository({ authSession: { findFirst } } as unknown as PrismaService);

    await expect(repo.findActiveByIdForUser('s1', 'u1')).resolves.toBeNull();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: 's1',
        userId: 'u1',
        revokedAt: null,
        expiresAt: { gt: new Date('2026-11-25T10:00:00Z') },
      },
    });
  });

  it('should move the push token to this session in one transaction', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-25T10:00:00Z') });
    const updateMany = jest.fn((args: unknown) => args);
    const $transaction = jest
      .fn()
      .mockResolvedValueOnce([{ count: 1 }, { count: 1 }])
      .mockResolvedValueOnce([{ count: 0 }, { count: 0 }]);
    const repo = new SessionsRepository({
      authSession: { updateMany },
      $transaction,
    } as unknown as PrismaService);

    await expect(repo.setPushToken('s1', 'fcm')).resolves.toBe(true);
    await expect(repo.setPushToken('s1', 'fcm')).resolves.toBe(false);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { fcmToken: 'fcm', id: { not: 's1' } },
      data: { fcmToken: null },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 's1', revokedAt: null, expiresAt: { gt: new Date('2026-11-25T10:00:00Z') } },
      data: { fcmToken: 'fcm' },
    });
  });

  it('should delete sessions that expired or were revoked before the cutoff', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 4 });
    const repo = new SessionsRepository({
      authSession: { deleteMany },
    } as unknown as PrismaService);
    const cutoff = new Date('2026-10-27T03:00:00Z');

    await expect(repo.deleteStale(cutoff)).resolves.toBe(4);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
    });
  });
});
