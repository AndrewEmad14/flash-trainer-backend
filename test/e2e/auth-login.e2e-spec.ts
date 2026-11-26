import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Response } from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { login, registerAndLogin, type AuthResult, type RegisterPayload } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';

const errorPart = (response: Response): unknown => (response.body as { error: unknown }).error;

describe('POST /api/v1/auth/login (US2)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let account: RegisterPayload;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
    const registered = await registerAndLogin(app, {
      email: 'ahmed@mail.com',
      username: 'Ahmed_A',
    });
    account = registered.payload;
    userId = registered.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const fail = (identifier: string): Promise<Response> =>
    login(app, { identifier, password: 'wrongPass1' });

  it('should sign in by email or by username, creating a separate session each time', async () => {
    const byEmail = await login(app, {
      identifier: ' AHMED@mail.com ',
      password: account.password,
      deviceName: 'Pixel 9',
      deviceOs: 'Android 16',
    });
    const byUsername = await login(app, { identifier: 'ahmed_a', password: account.password });

    const first = expectSuccessEnvelope(byEmail) as AuthResult;
    const second = expectSuccessEnvelope(byUsername) as AuthResult;
    expect(first.user).toMatchObject({ id: userId, email: 'ahmed@mail.com', username: 'Ahmed_A' });
    expect(first.user).not.toHaveProperty('passwordHash');
    expect(first.tokens.tokenType).toBe('Bearer');
    expect(second.tokens.refreshToken).not.toBe(first.tokens.refreshToken);

    const sessions = await prisma.authSession.findMany({ where: { userId } });
    expect(sessions).toHaveLength(3);
    expect(sessions.map((s) => s.deviceName)).toContain('Pixel 9');
  });

  it('should return AUTH_INVALID_CREDENTIALS for a wrong password', async () => {
    expectErrorEnvelope(await fail('ahmed@mail.com'), 401, 'AUTH_INVALID_CREDENTIALS');
  });

  it('should return an identical error for an unknown identifier and a wrong password', async () => {
    const wrongPassword = await fail('ahmed@mail.com');
    const unknownEmail = await fail('nobody@mail.com');
    const unknownUsername = await fail('nobody_here');

    expectErrorEnvelope(unknownEmail, 401, 'AUTH_INVALID_CREDENTIALS');
    expect(errorPart(unknownEmail)).toEqual(errorPart(wrongPassword));
    expect(errorPart(unknownUsername)).toEqual(errorPart(wrongPassword));
  });

  it('should lock the account after 5 failures, even for the correct password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expectErrorEnvelope(await fail('ahmed@mail.com'), 401, 'AUTH_INVALID_CREDENTIALS');
    }

    const locked = await login(app, { identifier: 'ahmed@mail.com', password: account.password });

    expectErrorEnvelope(locked, 429, 'AUTH_TOO_MANY_ATTEMPTS');
    const retryAfter = Number(locked.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(14 * 60);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect((errorPart(locked) as { message: string }).message).toMatch(/Try again after \S+/);
  });

  it('should count failures by email and by username against the same account', async () => {
    for (const identifier of [
      'ahmed@mail.com',
      'Ahmed_A',
      'AHMED@MAIL.COM',
      'ahmed_a',
      'Ahmed_A',
    ]) {
      await fail(identifier);
    }

    const locked = await login(app, { identifier: 'Ahmed_A', password: account.password });

    expectErrorEnvelope(locked, 429, 'AUTH_TOO_MANY_ATTEMPTS');
  });

  it('should lock an unknown identifier exactly like a real account', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await fail('ghost@mail.com');

    const locked = await fail('ghost@mail.com');

    expectErrorEnvelope(locked, 429, 'AUTH_TOO_MANY_ATTEMPTS');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(14 * 60);
  });

  it('should lift the lock once it has expired', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) await fail('ahmed@mail.com');
    const past = new Date(Date.now() - 60_000);
    await prisma.loginAttempt.updateMany({
      data: { lockedUntil: past, windowStartedAt: new Date(Date.now() - 31 * 60_000) },
    });

    const response = await login(app, { identifier: 'ahmed@mail.com', password: account.password });

    expect(response.status).toBe(200);
  });

  it('should reset the failure counter after a successful sign-in', async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) await fail('ahmed@mail.com');
    expect(
      (await login(app, { identifier: 'ahmed@mail.com', password: account.password })).status,
    ).toBe(200);

    for (let attempt = 0; attempt < 4; attempt += 1) await fail('ahmed@mail.com');
    const stillOpen = await login(app, {
      identifier: 'ahmed@mail.com',
      password: account.password,
    });

    expect(stillOpen.status).toBe(200);
  });

  it('should count concurrent failures atomically', async () => {
    await Promise.all(Array.from({ length: 5 }, () => fail('ahmed@mail.com')));

    const locked = await login(app, { identifier: 'ahmed@mail.com', password: account.password });

    expectErrorEnvelope(locked, 429, 'AUTH_TOO_MANY_ATTEMPTS');
  });

  it('should require identifier and password', async () => {
    const response = await login(app, {});

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    const fields = (response.body as { error: { details: { field: string }[] } }).error.details.map(
      (d) => d.field,
    );
    expect(fields.sort()).toEqual(['identifier', 'password']);
  });
});
