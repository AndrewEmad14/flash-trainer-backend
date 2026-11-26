import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../../common/errors/error-codes';
import { sha256Hex } from '../../../common/utils/hash.util';
import type { AppConfigService } from '../../../config/app-config.service';
import { TokenService } from './token.service';

const ACCESS_SECRET = 'a'.repeat(40);
const EMAIL_SECRET = 'b'.repeat(40);
const NOW = new Date('2026-11-25T10:00:00.000Z');

const config = {
  jwt: { accessSecret: ACCESS_SECRET, emailSecret: EMAIL_SECRET, accessTtlSeconds: 900 },
  refreshTokenTtlDays: 30,
} as AppConfigService;

describe('TokenService', () => {
  const jwt = new JwtService();
  const tokens = new TokenService(jwt, config);

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });

  afterEach(() => jest.useRealTimers());

  describe('signAccessToken', () => {
    it('should sign sub and sid with a 15-minute expiry', async () => {
      const { token, expiresAt } = await tokens.signAccessToken({ sub: 'u1', sid: 's1' });

      expect(expiresAt.toISOString()).toBe('2026-11-25T10:15:00.000Z');
      const payload = jwt.verify<{ sub: string; sid: string; exp: number }>(token, {
        secret: ACCESS_SECRET,
      });
      expect(payload).toMatchObject({ sub: 'u1', sid: 's1', exp: expiresAt.getTime() / 1000 });
    });

    it('should not be verifiable with the email secret', async () => {
      const { token } = await tokens.signAccessToken({ sub: 'u1', sid: 's1' });

      expect(() => {
        jwt.verify(token, { secret: EMAIL_SECRET });
      }).toThrow();
    });
  });

  describe('issueRefreshToken', () => {
    it('should return a random token, its SHA-256 hash and a 30-day expiry', () => {
      const issued = tokens.issueRefreshToken();

      expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(issued.hash).toBe(sha256Hex(issued.token));
      expect(issued.expiresAt.toISOString()).toBe('2026-12-25T10:00:00.000Z');
      expect(tokens.issueRefreshToken().token).not.toBe(issued.token);
    });
  });

  describe('signEmailVerificationToken', () => {
    it('should embed the user, email and purpose with a 24-hour expiry', async () => {
      const token = await tokens.signEmailVerificationToken({ id: 'u1', email: 'a@b.c' });

      const payload = jwt.verify<Record<string, unknown>>(token, { secret: EMAIL_SECRET });
      expect(payload).toMatchObject({
        sub: 'u1',
        email: 'a@b.c',
        purpose: 'verify_email',
        exp: NOW.getTime() / 1000 + 86_400,
      });
      expect(() => {
        jwt.verify(token, { secret: ACCESS_SECRET });
      }).toThrow();
    });
  });

  describe('verifyEmailVerificationToken', () => {
    it('should return the claims of a valid token', async () => {
      const token = await tokens.signEmailVerificationToken({ id: 'u1', email: 'a@b.c' });

      await expect(tokens.verifyEmailVerificationToken(token)).resolves.toEqual({
        userId: 'u1',
        email: 'a@b.c',
      });
    });

    it('should reject an expired token with AUTH_LINK_EXPIRED', async () => {
      const token = await tokens.signEmailVerificationToken({ id: 'u1', email: 'a@b.c' });
      jest.setSystemTime(new Date(NOW.getTime() + 86_401_000));

      await expect(tokens.verifyEmailVerificationToken(token)).rejects.toMatchObject({
        code: ErrorCode.AUTH_LINK_EXPIRED,
      });
    });

    it.each([
      ['garbage', async () => Promise.resolve('not-a-jwt')],
      [
        'signed with the access secret',
        async () =>
          jwt.signAsync(
            { sub: 'u1', email: 'a@b.c', purpose: 'verify_email' },
            { secret: ACCESS_SECRET },
          ),
      ],
      [
        'with the wrong purpose',
        async () =>
          jwt.signAsync({ sub: 'u1', email: 'a@b.c', purpose: 'reset' }, { secret: EMAIL_SECRET }),
      ],
      [
        'missing the email',
        async () => jwt.signAsync({ sub: 'u1', purpose: 'verify_email' }, { secret: EMAIL_SECRET }),
      ],
    ])('should reject a token %s with AUTH_LINK_INVALID', async (_case, make) => {
      await expect(tokens.verifyEmailVerificationToken(await make())).rejects.toMatchObject({
        code: ErrorCode.AUTH_LINK_INVALID,
      });
    });
  });
});
