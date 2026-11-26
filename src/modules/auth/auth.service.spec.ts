import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { User } from '../../generated/prisma/client';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification/email-verification.service';
import type { LoginThrottleService } from './login-throttle/login-throttle.service';
import type { SessionsService } from './sessions/sessions.service';

const dto = {
  fullName: 'Ahmed Ali',
  username: 'Ahmed_A',
  email: 'ahmed@mail.com',
  password: 's3cretPass',
  deviceName: 'Pixel 9',
  deviceOs: 'Android 16',
};

const storedUser: User = {
  id: 'u1',
  fullName: 'Ahmed Ali',
  username: 'Ahmed_A',
  email: 'ahmed@mail.com',
  emailVerifiedAt: null,
  phone: null,
  passwordHash: 'argon-hash',
  createdAt: new Date('2026-11-25T10:00:00.000Z'),
  updatedAt: new Date('2026-11-25T10:00:00.000Z'),
};

const tokens = {
  tokenType: 'Bearer' as const,
  accessToken: 'a',
  accessTokenExpiresAt: '2026-11-25T10:15:00.000Z',
  refreshToken: 'r',
  refreshTokenExpiresAt: '2026-12-25T10:00:00.000Z',
};

describe('AuthService', () => {
  const users = { createUser: jest.fn(), findByIdentifier: jest.fn() };
  const passwords = { hash: jest.fn(), verify: jest.fn(), verifyDummy: jest.fn() };
  const loginThrottle = {
    keyFor: jest.fn(),
    assertNotLocked: jest.fn(),
    registerFailure: jest.fn(),
    reset: jest.fn(),
  };
  const sessions = { createSession: jest.fn() };
  const emailVerification = { sendVerificationEmail: jest.fn() };
  const service = new AuthService(
    users as unknown as UsersService,
    passwords,
    sessions as unknown as SessionsService,
    emailVerification as unknown as EmailVerificationService,
    loginThrottle as unknown as LoginThrottleService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    passwords.hash.mockResolvedValue('argon-hash');
    users.createUser.mockResolvedValue(storedUser);
    sessions.createSession.mockResolvedValue(tokens);
    emailVerification.sendVerificationEmail.mockResolvedValue(undefined);
    loginThrottle.keyFor.mockImplementation((id: string | null, identifier: string) =>
      id ? `user:${id}` : `ident:${identifier}`,
    );
    loginThrottle.assertNotLocked.mockResolvedValue(undefined);
  });

  describe('register', () => {
    it('should hash the password, create the user, sign the device in and send the email', async () => {
      const result = await service.register(dto);

      expect(users.createUser).toHaveBeenCalledWith({
        fullName: 'Ahmed Ali',
        username: 'Ahmed_A',
        email: 'ahmed@mail.com',
        phone: null,
        passwordHash: 'argon-hash',
      });
      expect(sessions.createSession).toHaveBeenCalledWith('u1', {
        deviceName: 'Pixel 9',
        deviceOs: 'Android 16',
      });
      expect(emailVerification.sendVerificationEmail).toHaveBeenCalledWith(storedUser);
      expect(result.tokens).toBe(tokens);
      expect(result.user).toMatchObject({ id: 'u1', isEmailVerified: false, phone: null });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should pass the phone through when given', async () => {
      await service.register({ ...dto, phone: '+201001234567' });

      expect(users.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+201001234567' }),
      );
    });

    it('should not create a session or send email when the identity is taken', async () => {
      users.createUser.mockRejectedValue(new AppException(ErrorCode.USER_IDENTITY_TAKEN));

      await expect(service.register(dto)).rejects.toMatchObject({
        code: ErrorCode.USER_IDENTITY_TAKEN,
      });
      expect(sessions.createSession).not.toHaveBeenCalled();
      expect(emailVerification.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const credentials = { identifier: 'ahmed@mail.com', password: 's3cretPass', deviceName: 'P9' };

    it('should sign the device in and reset the counter for valid credentials', async () => {
      users.findByIdentifier.mockResolvedValue(storedUser);
      passwords.verify.mockResolvedValue(true);

      const result = await service.login(credentials);

      expect(loginThrottle.assertNotLocked).toHaveBeenCalledWith('user:u1');
      expect(passwords.verify).toHaveBeenCalledWith('argon-hash', 's3cretPass');
      expect(loginThrottle.reset).toHaveBeenCalledWith('user:u1');
      expect(sessions.createSession).toHaveBeenCalledWith('u1', {
        deviceName: 'P9',
        deviceOs: undefined,
      });
      expect(result).toEqual({ user: expect.objectContaining({ id: 'u1' }), tokens });
    });

    it('should count a failure and reject a wrong password', async () => {
      users.findByIdentifier.mockResolvedValue(storedUser);
      passwords.verify.mockResolvedValue(false);

      await expect(service.login(credentials)).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
      expect(loginThrottle.registerFailure).toHaveBeenCalledWith('user:u1');
      expect(sessions.createSession).not.toHaveBeenCalled();
    });

    it('should verify against a dummy hash and fail identically for an unknown identifier', async () => {
      users.findByIdentifier.mockResolvedValue(null);
      passwords.verifyDummy.mockResolvedValue(false);

      await expect(service.login(credentials)).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
      expect(passwords.verifyDummy).toHaveBeenCalledWith('s3cretPass');
      expect(loginThrottle.registerFailure).toHaveBeenCalledWith('ident:ahmed@mail.com');
    });

    it('should treat an account without a password as invalid credentials', async () => {
      users.findByIdentifier.mockResolvedValue({ ...storedUser, passwordHash: null });
      passwords.verifyDummy.mockResolvedValue(false);

      await expect(service.login(credentials)).rejects.toMatchObject({
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      });
      expect(passwords.verify).not.toHaveBeenCalled();
    });

    it('should refuse a locked key before checking the password', async () => {
      users.findByIdentifier.mockResolvedValue(storedUser);
      loginThrottle.assertNotLocked.mockRejectedValue(
        new AppException(ErrorCode.AUTH_TOO_MANY_ATTEMPTS),
      );

      await expect(service.login(credentials)).rejects.toMatchObject({
        code: ErrorCode.AUTH_TOO_MANY_ATTEMPTS,
      });
      expect(passwords.verify).not.toHaveBeenCalled();
      expect(loginThrottle.registerFailure).not.toHaveBeenCalled();
    });
  });
});
