import { Logger } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { sha256Hex } from '../../../common/utils/hash.util';
import type { AppConfigService } from '../../../config/app-config.service';
import type { UsersService } from '../../users/users.service';
import type { EmailDispatchService } from '../email-dispatch/email-dispatch.service';
import type { LoginThrottleService } from '../login-throttle/login-throttle.service';
import type { PasswordHasherService } from '../passwords/password-hasher.service';
import type { SessionsService } from '../sessions/sessions.service';
import type { PasswordResetsRepository } from './password-resets.repository';
import { PasswordResetService } from './password-reset.service';

const NOW = new Date('2026-11-25T10:00:00.000Z');
const user = { id: 'u1', email: 'ahmed@mail.com', fullName: 'Ahmed' };

describe('PasswordResetService', () => {
  const resets = {
    create: jest.fn(),
    deleteUnusedForUser: jest.fn(),
    findByTokenHash: jest.fn(),
    markUsed: jest.fn(),
  };
  const users = { findByEmail: jest.fn(), updatePasswordHash: jest.fn() };
  const passwords = { hash: jest.fn() };
  const sessions = { revokeAll: jest.fn() };
  const dispatches = { canSend: jest.fn(), record: jest.fn() };
  const loginThrottle = { keyFor: jest.fn(), reset: jest.fn() };
  const mail = { send: jest.fn() };
  const config = { links: { baseUrl: 'http://x/api/v1/links' } } as AppConfigService;
  const service = new PasswordResetService(
    resets as unknown as PasswordResetsRepository,
    users as unknown as UsersService,
    passwords as unknown as PasswordHasherService,
    sessions as unknown as SessionsService,
    dispatches as unknown as EmailDispatchService,
    loginThrottle as unknown as LoginThrottleService,
    mail,
    config,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    loginThrottle.keyFor.mockImplementation((id: string) => `user:${id}`);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('processRequest', () => {
    it('should replace earlier links, store a 1-hour hashed token, email it and record the dispatch', async () => {
      users.findByEmail.mockResolvedValue(user);
      dispatches.canSend.mockResolvedValue({ allowed: true });

      await service.processRequest('ahmed@mail.com');

      expect(resets.deleteUnusedForUser).toHaveBeenCalledWith('u1');
      const created = resets.create.mock.calls[0]?.[0] as { tokenHash: string; expiresAt: Date };
      expect(created.expiresAt).toEqual(new Date('2026-11-25T11:00:00.000Z'));
      const sent = mail.send.mock.calls[0]?.[0] as { to: string; text: string };
      expect(sent.to).toBe('ahmed@mail.com');
      const token = decodeURIComponent(/token=([^\s]+)/.exec(sent.text)?.[1] ?? '');
      expect(sha256Hex(token)).toBe(created.tokenHash);
      expect(dispatches.record).toHaveBeenCalledWith('u1', 'RESET_PASSWORD');
    });

    it('should do nothing for an unknown email', async () => {
      users.findByEmail.mockResolvedValue(null);

      await service.processRequest('nobody@mail.com');

      expect(dispatches.canSend).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('should do nothing (silently) when rate limited', async () => {
      users.findByEmail.mockResolvedValue(user);
      dispatches.canSend.mockResolvedValue({ allowed: false, retryAfterSeconds: 30 });

      await service.processRequest('ahmed@mail.com');

      expect(resets.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe('request', () => {
    it('should return immediately and finish the work in the background', async () => {
      users.findByEmail.mockResolvedValue(null);

      service.request('ahmed@mail.com');
      await service.onApplicationShutdown();

      expect(users.findByEmail).toHaveBeenCalledWith('ahmed@mail.com');
    });

    it('should log background failures instead of throwing', async () => {
      const errors: string[] = [];
      jest.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
        errors.push(String(m));
      });
      users.findByEmail.mockRejectedValue(new Error('db down'));

      service.request('ahmed@mail.com');
      await service.onApplicationShutdown();

      expect(errors.join()).toContain('Password reset request failed');
    });

    it('should also log non-Error failures', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      users.findByEmail.mockRejectedValue('boom');

      service.request('x@y.z');

      await expect(service.onApplicationShutdown()).resolves.toBeUndefined();
    });
  });

  describe('confirm', () => {
    const pending = {
      id: 'r1',
      userId: 'u1',
      usedAt: null,
      expiresAt: new Date('2026-11-25T10:30:00.000Z'),
    };

    it('should claim the link, revoke all sessions, set the password and lift the lockout, in that order', async () => {
      resets.findByTokenHash.mockResolvedValue(pending);
      passwords.hash.mockResolvedValue('new-hash');
      resets.markUsed.mockResolvedValue(true);
      const order: string[] = [];
      resets.markUsed.mockImplementation(() => {
        order.push('claim');
        return Promise.resolve(true);
      });
      sessions.revokeAll.mockImplementation(() => {
        order.push('revoke');
        return Promise.resolve(2);
      });
      users.updatePasswordHash.mockImplementation(
        () => (order.push('password'), Promise.resolve()),
      );

      await service.confirm('plain', 'n3wSecretPass');

      expect(resets.findByTokenHash).toHaveBeenCalledWith(sha256Hex('plain'));
      expect(order).toEqual(['claim', 'revoke', 'password']);
      expect(users.updatePasswordHash).toHaveBeenCalledWith('u1', 'new-hash');
      expect(loginThrottle.reset).toHaveBeenCalledWith('user:u1');
    });

    it.each([
      ['unknown', null, ErrorCode.AUTH_LINK_INVALID],
      ['used', { ...pending, usedAt: NOW }, ErrorCode.AUTH_LINK_USED],
      ['expired', { ...pending, expiresAt: NOW }, ErrorCode.AUTH_LINK_EXPIRED],
    ])('should reject an %s link', async (_state, reset, code) => {
      resets.findByTokenHash.mockResolvedValue(reset);

      await expect(service.confirm('t', 'n3wSecretPass')).rejects.toMatchObject({ code });
      expect(sessions.revokeAll).not.toHaveBeenCalled();
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });

    it('should reject with AUTH_LINK_USED when a simultaneous confirmation claimed it first', async () => {
      resets.findByTokenHash.mockResolvedValue(pending);
      passwords.hash.mockResolvedValue('h');
      resets.markUsed.mockResolvedValue(false);

      await expect(service.confirm('t', 'n3wSecretPass')).rejects.toMatchObject({
        code: ErrorCode.AUTH_LINK_USED,
      });
      expect(users.updatePasswordHash).not.toHaveBeenCalled();
    });
  });
});
