import { Logger } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import type { AppConfigService } from '../../../config/app-config.service';
import type { UsersService } from '../../users/users.service';
import type { EmailDispatchService } from '../email-dispatch/email-dispatch.service';
import type { TokenService } from '../tokens/token.service';
import { EmailVerificationService } from './email-verification.service';

const user = { id: 'u1', email: 'ahmed@mail.com', fullName: 'Ahmed Ali' };

describe('EmailVerificationService', () => {
  const tokens = { signEmailVerificationToken: jest.fn(), verifyEmailVerificationToken: jest.fn() };
  const mail = { send: jest.fn() };
  const dispatches = { record: jest.fn(), canSend: jest.fn() };
  const users = { findById: jest.fn(), markEmailVerified: jest.fn() };
  const config = { links: { baseUrl: 'http://10.0.2.2:3000/api/v1/links' } } as AppConfigService;
  const service = new EmailVerificationService(
    tokens as unknown as TokenService,
    mail,
    dispatches as unknown as EmailDispatchService,
    config,
    users as unknown as UsersService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    tokens.signEmailVerificationToken.mockResolvedValue('tok+en/=');
    mail.send.mockResolvedValue(undefined);
    dispatches.record.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('sendVerificationEmail', () => {
    it('should email a URL-encoded verification link and record the dispatch', async () => {
      await service.sendVerificationEmail(user);

      expect(tokens.signEmailVerificationToken).toHaveBeenCalledWith(user);
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ahmed@mail.com',
          text: expect.stringContaining(
            'http://10.0.2.2:3000/api/v1/links/verify-email?token=tok%2Ben%2F%3D',
          ),
        }),
      );
      expect(dispatches.record).toHaveBeenCalledWith('u1', 'VERIFY_EMAIL');
    });

    it('should log and swallow delivery failures without recording a dispatch', async () => {
      const logged: string[] = [];
      jest.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
      mail.send.mockRejectedValue(new Error('SMTP down'));

      await expect(service.sendVerificationEmail(user)).resolves.toBeUndefined();

      expect(dispatches.record).not.toHaveBeenCalled();
      expect(logged.join()).toContain('u1');
      expect(logged.join()).not.toContain('tok+en');
    });

    it('should also handle non-Error failures', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mail.send.mockRejectedValue('boom');

      await expect(service.sendVerificationEmail(user)).resolves.toBeUndefined();
    });
  });

  describe('confirm', () => {
    const stored = { id: 'u1', email: 'ahmed@mail.com', fullName: 'A', emailVerifiedAt: null };

    beforeEach(() => {
      tokens.verifyEmailVerificationToken.mockResolvedValue({
        userId: 'u1',
        email: 'ahmed@mail.com',
      });
    });

    it('should verify an unverified email', async () => {
      users.findById.mockResolvedValue(stored);
      users.markEmailVerified.mockResolvedValue(true);

      await expect(service.confirm('t')).resolves.toEqual({
        isEmailVerified: true,
        alreadyVerified: false,
      });
      expect(users.markEmailVerified).toHaveBeenCalledWith('u1');
    });

    it('should report alreadyVerified without changing anything', async () => {
      users.findById.mockResolvedValue({ ...stored, emailVerifiedAt: new Date() });

      await expect(service.confirm('t')).resolves.toEqual({
        isEmailVerified: true,
        alreadyVerified: true,
      });
      expect(users.markEmailVerified).not.toHaveBeenCalled();
    });

    it('should report alreadyVerified when a concurrent confirm won the race', async () => {
      users.findById.mockResolvedValue(stored);
      users.markEmailVerified.mockResolvedValue(false);

      await expect(service.confirm('t')).resolves.toMatchObject({ alreadyVerified: true });
    });

    it.each([
      ['the account was deleted', null],
      ['the email changed after the link was sent', { ...stored, email: 'new@mail.com' }],
    ])('should reject with AUTH_LINK_INVALID when %s', async (_case, user) => {
      users.findById.mockResolvedValue(user);

      await expect(service.confirm('t')).rejects.toMatchObject({
        code: ErrorCode.AUTH_LINK_INVALID,
      });
    });
  });

  describe('resend', () => {
    const unverified = { id: 'u1', email: 'ahmed@mail.com', fullName: 'A', emailVerifiedAt: null };

    it('should send a new link when allowed', async () => {
      users.findById.mockResolvedValue(unverified);
      dispatches.canSend.mockResolvedValue({ allowed: true });

      await service.resend('u1');

      expect(dispatches.canSend).toHaveBeenCalledWith('u1', 'VERIFY_EMAIL');
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it('should refuse with RATE_LIMIT_EXCEEDED and Retry-After when limited', async () => {
      users.findById.mockResolvedValue(unverified);
      dispatches.canSend.mockResolvedValue({ allowed: false, retryAfterSeconds: 42 });

      await expect(service.resend('u1')).rejects.toMatchObject({
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
        headers: { 'Retry-After': '42' },
      });
      expect(mail.send).not.toHaveBeenCalled();
    });

    it('should refuse with AUTH_EMAIL_ALREADY_VERIFIED for a verified user', async () => {
      users.findById.mockResolvedValue({ ...unverified, emailVerifiedAt: new Date() });

      await expect(service.resend('u1')).rejects.toMatchObject({
        code: ErrorCode.AUTH_EMAIL_ALREADY_VERIFIED,
      });
    });

    it('should refuse with AUTH_TOKEN_INVALID when the account no longer exists', async () => {
      users.findById.mockResolvedValue(null);

      await expect(service.resend('gone')).rejects.toMatchObject({
        code: ErrorCode.AUTH_TOKEN_INVALID,
      });
    });
  });
});
