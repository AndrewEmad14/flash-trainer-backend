import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { registerAndLogin, type UserResponse } from '../utils/auth';
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
