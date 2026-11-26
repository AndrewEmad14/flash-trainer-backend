import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { sha256Hex } from '../../src/common/utils/hash.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { refresh, registerAndLogin, type AuthTokens } from '../utils/auth';
import { createTestApp, resetThrottling, TestProtectedController } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('POST /api/v1/auth/refresh (US3)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({ controllers: [TestProtectedController] });
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const sessionFor = (refreshToken: string) =>
    prisma.authSession.findUnique({ where: { refreshTokenHash: sha256Hex(refreshToken) } });

  it('should rotate the tokens and slide the 30-day expiry forward', async () => {
    const { tokens } = await registerAndLogin(app);
    const before = await sessionFor(tokens.refreshToken);
    await prisma.authSession.update({
      where: { id: before?.id },
      data: {
        lastUsedAt: new Date(Date.now() - 10 * DAY_MS),
        expiresAt: new Date(Date.now() + 20 * DAY_MS),
      },
    });

    const response = await refresh(app, tokens.refreshToken);

    const next = expectSuccessEnvelope(response) as AuthTokens;
    expect(next).toEqual({
      tokenType: 'Bearer',
      accessToken: expect.any(String),
      accessTokenExpiresAt: expect.any(String),
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    });
    expect(next.refreshToken).not.toBe(tokens.refreshToken);
    const after = await sessionFor(next.refreshToken);
    expect(after?.id).toBe(before?.id);
    expect(after?.lastUsedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const expiresInDays = ((after?.expiresAt.getTime() ?? 0) - Date.now()) / DAY_MS;
    expect(expiresInDays).toBeGreaterThan(29.9);
    expect(expiresInDays).toBeLessThanOrEqual(30);
    expect(new Date(next.refreshTokenExpiresAt).getTime()).toBe(after?.expiresAt.getTime());
  });

  it('should issue an access token that works on protected routes and names the same session', async () => {
    const { tokens } = await registerAndLogin(app);
    const session = await sessionFor(tokens.refreshToken);

    const next = expectSuccessEnvelope(await refresh(app, tokens.refreshToken)) as AuthTokens;
    const whoAmI = await request(app.getHttpServer())
      .get('/api/v1/test/protected')
      .set('Authorization', `Bearer ${next.accessToken}`);

    expect(expectSuccessEnvelope(whoAmI)).toEqual({
      userId: session?.userId,
      sessionId: session?.id,
    });
  });

  it('should reject a refresh token that was already used', async () => {
    const { tokens } = await registerAndLogin(app);
    expect((await refresh(app, tokens.refreshToken)).status).toBe(200);

    const reused = await refresh(app, tokens.refreshToken);

    expectErrorEnvelope(reused, 401, 'AUTH_SESSION_INVALID');
  });

  it('should let exactly one of two simultaneous refreshes with the same token win', async () => {
    const { tokens } = await registerAndLogin(app);

    const responses = await Promise.all([
      refresh(app, tokens.refreshToken),
      refresh(app, tokens.refreshToken),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('should return AUTH_SESSION_EXPIRED after 30 days without use', async () => {
    const { tokens } = await registerAndLogin(app);
    await prisma.authSession.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    expectErrorEnvelope(await refresh(app, tokens.refreshToken), 401, 'AUTH_SESSION_EXPIRED');
  });

  it('should return AUTH_SESSION_INVALID for a revoked session', async () => {
    const { tokens } = await registerAndLogin(app);
    await prisma.authSession.updateMany({ data: { revokedAt: new Date() } });

    expectErrorEnvelope(await refresh(app, tokens.refreshToken), 401, 'AUTH_SESSION_INVALID');
  });

  it('should return AUTH_SESSION_INVALID once the account is deleted', async () => {
    const { tokens, user } = await registerAndLogin(app);
    await prisma.user.delete({ where: { id: user.id } });

    expectErrorEnvelope(await refresh(app, tokens.refreshToken), 401, 'AUTH_SESSION_INVALID');
  });

  it('should return AUTH_SESSION_INVALID for an unknown token', async () => {
    expectErrorEnvelope(await refresh(app, 'not-a-real-token'), 401, 'AUTH_SESSION_INVALID');
  });

  it('should require a refresh token', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').send({});

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
  });

  describe('access token on a protected route', () => {
    const call = (token?: string) => {
      const req = request(app.getHttpServer()).get('/api/v1/test/protected');
      return token ? req.set('Authorization', `Bearer ${token}`) : req;
    };

    it('should return AUTH_TOKEN_EXPIRED for an expired access token (the app should refresh)', async () => {
      const expired = await new JwtService().signAsync(
        { sub: 'u', sid: 's', exp: Math.floor(Date.now() / 1000) - 5 },
        { secret: process.env.JWT_ACCESS_SECRET },
      );

      expectErrorEnvelope(await call(expired), 401, 'AUTH_TOKEN_EXPIRED');
    });

    it('should return AUTH_TOKEN_MISSING without a token and AUTH_TOKEN_INVALID for garbage', async () => {
      expectErrorEnvelope(await call(), 401, 'AUTH_TOKEN_MISSING');
      expectErrorEnvelope(await call('garbage'), 401, 'AUTH_TOKEN_INVALID');
    });
  });
});
