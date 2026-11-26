import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { registerAndLogin, type UserResponse } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';
import { extractTokenFromLink, lastMailTo, mailbox } from '../utils/mail';

interface VerificationResult {
  isEmailVerified: boolean;
  alreadyVerified: boolean;
}

describe('Email verification (US7)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const server = () => app.getHttpServer();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
    mailbox(app).clear();
  });

  afterAll(async () => {
    await app.close();
  });

  const confirm = (token: unknown) =>
    request(server()).post('/api/v1/auth/email-verification/confirm').send({ token });

  const resend = (accessToken?: string) => {
    const req = request(server()).post('/api/v1/auth/email-verification');
    return accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req;
  };

  const me = (accessToken: string) =>
    request(server()).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`);

  /** Registers a user and returns them with the token from their verification email. */
  const registered = async () => {
    const result = await registerAndLogin(app);
    const mail = lastMailTo(app, result.payload.email);
    if (!mail) throw new Error('no verification email captured');
    return { ...result, linkToken: extractTokenFromLink(mail) };
  };

  const emailToken = (claims: Record<string, unknown>) =>
    new JwtService().signAsync(claims, { secret: process.env.JWT_EMAIL_SECRET });

  describe('POST /auth/email-verification/confirm', () => {
    it('should verify the email once, then report it as already verified', async () => {
      const { linkToken, tokens } = await registered();

      const first = expectSuccessEnvelope(await confirm(linkToken)) as VerificationResult;
      const second = expectSuccessEnvelope(await confirm(linkToken)) as VerificationResult;

      expect(first).toEqual({ isEmailVerified: true, alreadyVerified: false });
      expect(second).toEqual({ isEmailVerified: true, alreadyVerified: true });
      expect(
        (expectSuccessEnvelope(await me(tokens.accessToken)) as UserResponse).isEmailVerified,
      ).toBe(true);
    });

    it('should not need an access token (opened from the email)', async () => {
      const { linkToken } = await registered();

      expect((await confirm(linkToken)).status).toBe(200);
    });

    it('should return AUTH_LINK_EXPIRED for a link older than 24 hours', async () => {
      const { user, payload } = await registered();
      const expired = await emailToken({
        sub: user.id,
        email: payload.email,
        purpose: 'verify_email',
        exp: Math.floor(Date.now() / 1000) - 5,
      });

      expectErrorEnvelope(await confirm(expired), 400, 'AUTH_LINK_EXPIRED');
    });

    it('should return AUTH_LINK_INVALID for a tampered link', async () => {
      const { linkToken } = await registered();
      const tampered = `${linkToken.slice(0, -2)}${linkToken.endsWith('A') ? 'BB' : 'AA'}`;

      expectErrorEnvelope(await confirm(tampered), 400, 'AUTH_LINK_INVALID');
      expectErrorEnvelope(await confirm('garbage'), 400, 'AUTH_LINK_INVALID');
    });

    it('should return AUTH_LINK_INVALID once the email changed after the link was sent', async () => {
      const { linkToken, user } = await registered();
      await prisma.user.update({ where: { id: user.id }, data: { email: 'changed@gmail.com' } });

      expectErrorEnvelope(await confirm(linkToken), 400, 'AUTH_LINK_INVALID');
    });

    it('should return AUTH_LINK_INVALID for a token with the wrong purpose or a deleted user', async () => {
      const { user, payload } = await registered();
      const wrongPurpose = await emailToken({ sub: user.id, email: payload.email, purpose: 'x' });
      const { linkToken } = await registered();
      const other = await prisma.user.findFirstOrThrow({ where: { NOT: { id: user.id } } });
      await prisma.user.delete({ where: { id: other.id } });

      expectErrorEnvelope(await confirm(wrongPurpose), 400, 'AUTH_LINK_INVALID');
      expectErrorEnvelope(await confirm(linkToken), 400, 'AUTH_LINK_INVALID');
    });

    it('should require a token', async () => {
      expectErrorEnvelope(await confirm(undefined), 400, 'VALIDATION_FAILED');
    });
  });

  describe('POST /auth/email-verification (resend)', () => {
    const ageDispatches = (userId: string, ms: number) =>
      prisma.emailDispatch.updateMany({
        where: { userId },
        data: { createdAt: new Date(Date.now() - ms) },
      });

    it('should refuse a resend within 60 seconds of the last email, with Retry-After', async () => {
      const { tokens } = await registered();

      const response = await resend(tokens.accessToken);

      expectErrorEnvelope(response, 429, 'RATE_LIMIT_EXCEEDED');
      const retryAfter = Number(response.headers['retry-after']);
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });

    it('should send a new working link after a minute', async () => {
      const { tokens, user, payload } = await registered();
      await ageDispatches(user.id, 2 * 60_000);
      mailbox(app).clear();

      const response = await resend(tokens.accessToken);

      expect(expectSuccessEnvelope(response)).toBeNull();
      const mail = lastMailTo(app, payload.email);
      expect(mail).toBeDefined();
      expect((await confirm(extractTokenFromLink(mail as NonNullable<typeof mail>))).status).toBe(
        200,
      );
    });

    it('should refuse the 6th email within 24 hours', async () => {
      const { tokens, user } = await registered();
      await ageDispatches(user.id, 2 * 60_000);
      await prisma.emailDispatch.createMany({
        data: [3, 4, 5, 6].map((minutes) => ({
          userId: user.id,
          type: 'VERIFY_EMAIL' as const,
          createdAt: new Date(Date.now() - minutes * 60 * 60_000),
        })),
      });

      const response = await resend(tokens.accessToken);

      expectErrorEnvelope(response, 429, 'RATE_LIMIT_EXCEEDED');
      expect(Number(response.headers['retry-after'])).toBeGreaterThan(60);
    });

    it('should return AUTH_EMAIL_ALREADY_VERIFIED for a verified user', async () => {
      const { tokens, linkToken } = await registered();
      await confirm(linkToken);

      expectErrorEnvelope(await resend(tokens.accessToken), 409, 'AUTH_EMAIL_ALREADY_VERIFIED');
    });

    it('should require an access token', async () => {
      expectErrorEnvelope(await resend(), 401, 'AUTH_TOKEN_MISSING');
    });
  });

  describe('GET /links/:type (email landing page)', () => {
    it('should render an HTML page that opens the app, without verifying anything', async () => {
      const { linkToken, user } = await registered();

      const response = await request(server()).get(
        `/api/v1/links/verify-email?token=${encodeURIComponent(linkToken)}`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.text).toContain(
        `flashtrainer://verify-email?token=${encodeURIComponent(linkToken)}`,
      );
      expect(response.text).toContain('Open Flash Trainer');
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(stored.emailVerifiedAt).toBeNull();
    });

    it('should support the reset-password link type', async () => {
      const response = await request(server()).get('/api/v1/links/reset-password?token=abc');

      expect(response.status).toBe(200);
      expect(response.text).toContain('flashtrainer://reset-password?token=abc');
    });

    it('should escape hostile input instead of injecting it', async () => {
      const response = await request(server()).get(
        `/api/v1/links/verify-email?token=${encodeURIComponent('"><script>alert(1)</script>')}`,
      );

      expect(response.text).not.toContain('<script>');
    });

    it('should return a 404 HTML page for an unknown link type', async () => {
      const response = await request(server()).get('/api/v1/links/delete-everything?token=x');

      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
      expect(response.text).not.toContain('flashtrainer://');
    });

    it('should return a 400 HTML page when the token is missing', async () => {
      const response = await request(server()).get('/api/v1/links/verify-email');

      expect(response.status).toBe(400);
      expect(response.headers['content-type']).toMatch(/^text\/html/);
    });
  });
});
