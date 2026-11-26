import type { PrismaService } from '../../../prisma/prisma.service';
import { LoginAttemptsRepository } from './login-attempts.repository';

const policy = { windowMs: 15 * 60_000, maxFailures: 5, lockMs: 15 * 60_000 };
const now = new Date('2026-11-25T10:00:00.000Z');

describe('LoginAttemptsRepository', () => {
  const loginAttempt = { findUnique: jest.fn(), deleteMany: jest.fn() };
  const $queryRaw = jest.fn();
  const repository = new LoginAttemptsRepository({
    loginAttempt,
    $queryRaw,
  } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('should find a record by throttle key', async () => {
    loginAttempt.findUnique.mockResolvedValue(null);

    await expect(repository.find('user:u1')).resolves.toBeNull();
    expect(loginAttempt.findUnique).toHaveBeenCalledWith({ where: { throttleKey: 'user:u1' } });
  });

  it('should upsert a failure atomically and map the returned row', async () => {
    $queryRaw.mockResolvedValue([
      {
        throttle_key: 'user:u1',
        failed_count: 5,
        window_started_at: now,
        locked_until: new Date('2026-11-25T10:15:00.000Z'),
      },
    ]);

    const result = await repository.upsertFailure('user:u1', now, policy);

    expect(result).toEqual({
      throttleKey: 'user:u1',
      failedCount: 5,
      windowStartedAt: now,
      lockedUntil: new Date('2026-11-25T10:15:00.000Z'),
    });
    const [sql, ...values] = $queryRaw.mock.calls[0] as [string[], ...unknown[]];
    expect(sql.join('?')).toContain('ON CONFLICT (throttle_key) DO UPDATE');
    expect(values).toContain('user:u1');
    expect(values).toContainEqual(new Date('2026-11-25T09:45:00.000Z'));
  });

  it('should lock on the first failure when the policy allows only one', async () => {
    $queryRaw.mockResolvedValue([
      { throttle_key: 'k', failed_count: 1, window_started_at: now, locked_until: now },
    ]);

    await repository.upsertFailure('k', now, { ...policy, maxFailures: 1 });

    const values = ($queryRaw.mock.calls[0] as unknown[]).slice(1);
    // VALUES (throttle_key, 1, now, locked_until): the 3rd parameter is the initial lock.
    expect(values[2]).toEqual(new Date('2026-11-25T10:15:00.000Z'));
  });

  it('should fail loudly if the upsert returns nothing', async () => {
    $queryRaw.mockResolvedValue([]);

    await expect(repository.upsertFailure('k', now, policy)).rejects.toThrow(/no row/);
  });

  it('should delete by key without failing when nothing exists', async () => {
    loginAttempt.deleteMany.mockResolvedValue({ count: 0 });

    await repository.delete('ident:ghost');

    expect(loginAttempt.deleteMany).toHaveBeenCalledWith({ where: { throttleKey: 'ident:ghost' } });
  });
});
