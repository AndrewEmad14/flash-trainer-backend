import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { login, refresh, register, registerAndLogin, type UserResponse } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';

describe('GET /api/v1/users/me (US4)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const me = (token?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/users/me');
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };

  it('should return every account field, with phone null when unset and no secrets', async () => {
    const { tokens, user, payload } = await registerAndLogin(app);

    const response = await me(tokens.accessToken);

    const data = expectSuccessEnvelope(response) as UserResponse;
    expect(data).toEqual({
      id: user.id,
      fullName: payload.fullName,
      username: payload.username,
      email: payload.email,
      isEmailVerified: false,
      phone: null,
      createdAt: user.createdAt,
    });
    expect(Object.keys(data).sort()).toEqual(
      ['createdAt', 'email', 'fullName', 'id', 'isEmailVerified', 'phone', 'username'].sort(),
    );
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|argon2/);
  });

  it('should work for an unverified user (FR-022) and reflect verification once done', async () => {
    const { tokens, user } = await registerAndLogin(app, { phone: '+201001234567' });

    const unverified = expectSuccessEnvelope(await me(tokens.accessToken)) as UserResponse;
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
    const verified = expectSuccessEnvelope(await me(tokens.accessToken)) as UserResponse;

    expect(unverified).toMatchObject({ isEmailVerified: false, phone: '+201001234567' });
    expect(verified.isEmailVerified).toBe(true);
  });

  it('should return AUTH_TOKEN_MISSING without a bearer token', async () => {
    expectErrorEnvelope(await me(), 401, 'AUTH_TOKEN_MISSING');
  });

  it('should return AUTH_TOKEN_INVALID for a garbage token', async () => {
    expectErrorEnvelope(await me('garbage.token.here'), 401, 'AUTH_TOKEN_INVALID');
  });

  it('should return AUTH_TOKEN_EXPIRED for an expired token', async () => {
    const { user } = await registerAndLogin(app);
    const expired = await new JwtService().signAsync(
      { sub: user.id, sid: 's', exp: Math.floor(Date.now() / 1000) - 5 },
      { secret: process.env.JWT_ACCESS_SECRET },
    );

    expectErrorEnvelope(await me(expired), 401, 'AUTH_TOKEN_EXPIRED');
  });

  it('should return AUTH_TOKEN_INVALID for a still-valid token of a deleted account', async () => {
    const { tokens, user } = await registerAndLogin(app);
    await prisma.user.delete({ where: { id: user.id } });

    expectErrorEnvelope(await me(tokens.accessToken), 401, 'AUTH_TOKEN_INVALID');
  });
});

describe('DELETE /api/v1/users/me (US11)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const deleteMe = (accessToken: string | undefined, body: Record<string, unknown>) => {
    const req = request(app.getHttpServer()).delete('/api/v1/users/me');
    return (accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req).send(body);
  };

  /** A user with two devices, a pending reset link, an email log and a sign-in lock row. */
  const userWithData = async () => {
    const a = await registerAndLogin(app, { phone: '+201001112223' });
    const b = await login(app, { identifier: a.payload.email, password: a.payload.password });
    await prisma.passwordReset.create({
      data: {
        userId: a.user.id,
        tokenHash: 'f'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.loginAttempt.create({
      data: { throttleKey: `user:${a.user.id}`, failedCount: 2, windowStartedAt: new Date() },
    });
    return {
      ...a,
      bRefresh: (b.body as { data: { tokens: { refreshToken: string } } }).data.tokens.refreshToken,
    };
  };

  it('should permanently delete the account and everything tied to it', async () => {
    const { user, tokens, payload } = await userWithData();

    const response = await deleteMe(tokens.accessToken, { password: payload.password });

    expect(expectSuccessEnvelope(response)).toBeNull();
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    expect(await prisma.authSession.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.passwordReset.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.emailDispatch.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.loginAttempt.count({ where: { throttleKey: `user:${user.id}` } })).toBe(0);
  });

  it('should cut off every device: refresh fails and the old access token is rejected', async () => {
    const { tokens, payload, bRefresh } = await userWithData();

    await deleteMe(tokens.accessToken, { password: payload.password });

    expectErrorEnvelope(await refresh(app, tokens.refreshToken), 401, 'AUTH_SESSION_INVALID');
    expectErrorEnvelope(await refresh(app, bRefresh), 401, 'AUTH_SESSION_INVALID');
    expectErrorEnvelope(
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${tokens.accessToken}`),
      401,
      'AUTH_TOKEN_INVALID',
    );
    expectErrorEnvelope(
      await login(app, { identifier: payload.email, password: payload.password }),
      401,
      'AUTH_INVALID_CREDENTIALS',
    );
  });

  it('should free the email, username and phone for a new registration', async () => {
    const { tokens, payload } = await userWithData();
    await deleteMe(tokens.accessToken, { password: payload.password });

    const again = await register(app, { ...payload });

    expect(again.status).toBe(201);
  });

  it('should refuse a wrong password with 403 and delete nothing', async () => {
    const { user, tokens, bRefresh } = await userWithData();

    const response = await deleteMe(tokens.accessToken, { password: 'wrongPass1' });

    expectErrorEnvelope(response, 403, 'AUTH_CURRENT_PASSWORD_INCORRECT');
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(1);
    expect((await refresh(app, bRefresh)).status).toBe(200);
  });

  it('should return AUTH_TOKEN_INVALID when the account is already gone', async () => {
    const { tokens, payload } = await userWithData();
    await deleteMe(tokens.accessToken, { password: payload.password });

    expectErrorEnvelope(
      await deleteMe(tokens.accessToken, { password: payload.password }),
      401,
      'AUTH_TOKEN_INVALID',
    );
  });

  it('should require the password and an access token', async () => {
    const { tokens } = await userWithData();

    expectErrorEnvelope(await deleteMe(tokens.accessToken, {}), 400, 'VALIDATION_FAILED');
    expectErrorEnvelope(await deleteMe(undefined, { password: 'x' }), 401, 'AUTH_TOKEN_MISSING');
  });
});
