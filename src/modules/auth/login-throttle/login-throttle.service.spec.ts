import { AppException } from '../../../common/errors/app.exception';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { LoginAttemptsRepository } from './login-attempts.repository';
import { LOGIN_FAILURE_POLICY, LoginThrottleService } from './login-throttle.service';

const NOW = new Date('2026-11-25T10:00:00.000Z');

describe('LoginThrottleService', () => {
  const attempts = { find: jest.fn(), upsertFailure: jest.fn(), delete: jest.fn() };
  const service = new LoginThrottleService(attempts as unknown as LoginAttemptsRepository);

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: NOW });
  });

  afterEach(() => jest.useRealTimers());

  describe('keyFor', () => {
    it('should key by account when the identifier matches a user', () => {
      expect(service.keyFor('u1', 'Ahmed_A')).toBe('user:u1');
    });

    it('should key by normalised identifier when no account matches', () => {
      expect(service.keyFor(null, ' Ghost@Mail.com ')).toBe('ident:ghost@mail.com');
    });
  });

  describe('assertNotLocked', () => {
    it('should pass when there is no record', async () => {
      attempts.find.mockResolvedValue(null);

      await expect(service.assertNotLocked('user:u1')).resolves.toBeUndefined();
    });

    it('should pass when the lock has expired', async () => {
      attempts.find.mockResolvedValue({ lockedUntil: new Date(NOW.getTime() - 1) });

      await expect(service.assertNotLocked('user:u1')).resolves.toBeUndefined();
    });

    it('should pass when failures exist but no lock is set', async () => {
      attempts.find.mockResolvedValue({ failedCount: 3, lockedUntil: null });

      await expect(service.assertNotLocked('user:u1')).resolves.toBeUndefined();
    });

    it('should throw AUTH_TOO_MANY_ATTEMPTS with Retry-After while locked', async () => {
      const lockedUntil = new Date(NOW.getTime() + 10 * 60_000 + 500);
      attempts.find.mockResolvedValue({ lockedUntil });

      const error = await service.assertNotLocked('user:u1').catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect(error).toMatchObject({
        code: ErrorCode.AUTH_TOO_MANY_ATTEMPTS,
        headers: { 'Retry-After': '601' },
      });
      expect((error as AppException).message).toContain(lockedUntil.toISOString());
    });
  });

  describe('registerFailure', () => {
    it('should record a failure with the FR-010 policy at the current time', async () => {
      await service.registerFailure('ident:ghost');

      expect(attempts.upsertFailure).toHaveBeenCalledWith('ident:ghost', NOW, LOGIN_FAILURE_POLICY);
      expect(LOGIN_FAILURE_POLICY).toEqual({ windowMs: 900_000, maxFailures: 5, lockMs: 900_000 });
    });
  });

  describe('reset', () => {
    it('should delete the record', async () => {
      await service.reset('user:u1');

      expect(attempts.delete).toHaveBeenCalledWith('user:u1');
    });
  });
});
