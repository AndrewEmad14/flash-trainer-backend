import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import type { User } from '../../generated/prisma/client';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { EmailVerificationService } from './email-verification/email-verification.service';
import type { PasswordHasherService } from './passwords/password-hasher.service';
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
  const users = { createUser: jest.fn() };
  const passwords = { hash: jest.fn() };
  const sessions = { createSession: jest.fn() };
  const emailVerification = { sendVerificationEmail: jest.fn() };
  const service = new AuthService(
    users as unknown as UsersService,
    passwords as unknown as PasswordHasherService,
    sessions as unknown as SessionsService,
    emailVerification as unknown as EmailVerificationService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    passwords.hash.mockResolvedValue('argon-hash');
    users.createUser.mockResolvedValue(storedUser);
    sessions.createSession.mockResolvedValue(tokens);
    emailVerification.sendVerificationEmail.mockResolvedValue(undefined);
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
});
