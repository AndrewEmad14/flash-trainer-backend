import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { sha256Hex } from '../../src/common/utils/hash.util';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { login, refresh, registerAndLogin, type AuthResult, type AuthTokens } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';

interface SessionResponse {
  id: string;
  deviceName: string | null;
  deviceOs: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}

describe('GET/DELETE /api/v1/auth/sessions (US6)', () => {
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

  const list = (accessToken: string) =>
    request(app.getHttpServer())
      .get('/api/v1/auth/sessions')
      .set('Authorization', `Bearer ${accessToken}`);

  const revoke = (accessToken: string, sessionId: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/auth/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${accessToken}`);

  const sessionIdOf = async (tokens: AuthTokens): Promise<string> =>
    (
      await prisma.authSession.findUniqueOrThrow({
        where: { refreshTokenHash: sha256Hex(tokens.refreshToken) },
      })
    ).id;

  /** Device A (registration, "Test iPhone") and device B ("Pixel 9"), same user. */
  const twoDevices = async () => {
    const a = await registerAndLogin(app);
    const b = (
      expectSuccessEnvelope(
        await login(app, {
          identifier: a.payload.email,
          password: a.payload.password,
          deviceName: 'Pixel 9',
          deviceOs: 'Android 16',
        }),
      ) as AuthResult
    ).tokens;
    return { a: a.tokens, b, userId: a.user.id };
  };

  it('should list active devices, newest use first, marking the current one', async () => {
    const { a, b } = await twoDevices();
    const aId = await sessionIdOf(a);
    const bId = await sessionIdOf(b);
    await prisma.authSession.update({
      where: { id: aId },
      data: { lastUsedAt: new Date(Date.now() - 60_000) },
    });

    const sessions = expectSuccessEnvelope(await list(a.accessToken)) as SessionResponse[];

    expect(sessions).toEqual([
      {
        id: bId,
        deviceName: 'Pixel 9',
        deviceOs: 'Android 16',
        createdAt: expect.any(String),
        lastUsedAt: expect.any(String),
        isCurrent: false,
      },
      {
        id: aId,
        deviceName: 'Test iPhone',
        deviceOs: 'iOS 19.1',
        createdAt: expect.any(String),
        lastUsedAt: expect.any(String),
        isCurrent: true,
      },
    ]);
    expect(JSON.stringify(sessions)).not.toMatch(/refreshTokenHash|fcmToken/);
  });

  it('should hide revoked and expired sessions', async () => {
    const { a, b, userId } = await twoDevices();
    const third = await login(app, {
      identifier: (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).email,
      password: 's3cretPass',
    });
    const c = (expectSuccessEnvelope(third) as AuthResult).tokens;
    await prisma.authSession.update({
      where: { id: await sessionIdOf(b) },
      data: { revokedAt: new Date() },
    });
    await prisma.authSession.update({
      where: { id: await sessionIdOf(c) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const sessions = expectSuccessEnvelope(await list(a.accessToken)) as SessionResponse[];

    expect(sessions.map((s) => s.id)).toEqual([await sessionIdOf(a)]);
  });

  it('should sign out another of my devices remotely', async () => {
    const { a, b } = await twoDevices();
    const bId = await sessionIdOf(b);

    const response = await revoke(a.accessToken, bId);

    expect(expectSuccessEnvelope(response)).toBeNull();
    const remaining = expectSuccessEnvelope(await list(a.accessToken)) as SessionResponse[];
    expect(remaining.map((s) => s.id)).not.toContain(bId);
    expectErrorEnvelope(await refresh(app, b.refreshToken), 401, 'AUTH_SESSION_INVALID');
    expect((await refresh(app, a.refreshToken)).status).toBe(200);
  });

  it('should allow revoking the current device (same as signing out)', async () => {
    const { a } = await twoDevices();

    expect((await revoke(a.accessToken, await sessionIdOf(a))).status).toBe(200);
    expectErrorEnvelope(await refresh(app, a.refreshToken), 401, 'AUTH_SESSION_INVALID');
  });

  it("should return SESSION_NOT_FOUND for someone else's session, changing nothing", async () => {
    const mine = await registerAndLogin(app);
    const theirs = await registerAndLogin(app);

    const response = await revoke(mine.tokens.accessToken, await sessionIdOf(theirs.tokens));

    expectErrorEnvelope(response, 404, 'SESSION_NOT_FOUND');
    expect((await refresh(app, theirs.tokens.refreshToken)).status).toBe(200);
  });

  it('should return SESSION_NOT_FOUND for an unknown or already-revoked session', async () => {
    const { a, b } = await twoDevices();
    const bId = await sessionIdOf(b);
    await revoke(a.accessToken, bId);

    expectErrorEnvelope(await revoke(a.accessToken, bId), 404, 'SESSION_NOT_FOUND');
    expectErrorEnvelope(
      await revoke(a.accessToken, '00000000-0000-4000-8000-000000000000'),
      404,
      'SESSION_NOT_FOUND',
    );
  });

  it('should reject a non-UUID session id with a field-level VALIDATION_FAILED', async () => {
    const { a } = await twoDevices();

    const response = await revoke(a.accessToken, 'not-a-uuid');

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect((response.body as { error: { details: unknown } }).error.details).toEqual([
      { field: 'sessionId', code: 'FIELD_INVALID_FORMAT', message: expect.any(String) },
    ]);
  });

  it('should require an access token', async () => {
    expectErrorEnvelope(
      await request(app.getHttpServer()).get('/api/v1/auth/sessions'),
      401,
      'AUTH_TOKEN_MISSING',
    );
  });

  describe('PUT /auth/sessions/current/push-token (US10)', () => {
    const setPushToken = (accessToken: string | undefined, pushToken: unknown) => {
      const req = request(app.getHttpServer()).put('/api/v1/auth/sessions/current/push-token');
      return (accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req).send({
        pushToken,
      });
    };

    const fcmOf = async (tokens: AuthTokens): Promise<string | null> =>
      (
        await prisma.authSession.findUniqueOrThrow({
          where: { refreshTokenHash: sha256Hex(tokens.refreshToken) },
        })
      ).fcmToken;

    it("should store the token on this device's session, and replace it on a second call", async () => {
      const { a, b } = await twoDevices();

      expect(expectSuccessEnvelope(await setPushToken(a.accessToken, 'fcm-token-1'))).toBeNull();
      expect(await fcmOf(a)).toBe('fcm-token-1');
      expect(await fcmOf(b)).toBeNull();

      await setPushToken(a.accessToken, 'fcm-token-2');
      expect(await fcmOf(a)).toBe('fcm-token-2');
    });

    it('should move a token that another session already holds (same phone, new sign-in)', async () => {
      const { a, b } = await twoDevices();
      await setPushToken(a.accessToken, 'shared-fcm-token');

      await setPushToken(b.accessToken, 'shared-fcm-token');

      expect(await fcmOf(a)).toBeNull();
      expect(await fcmOf(b)).toBe('shared-fcm-token');
    });

    it('should drop the token when the device signs out', async () => {
      const { a } = await twoDevices();
      await setPushToken(a.accessToken, 'fcm-token-1');

      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .send({ refreshToken: a.refreshToken });

      expect(await fcmOf(a)).toBeNull();
    });

    it('should refuse with AUTH_SESSION_INVALID once this session was signed out remotely', async () => {
      const { a, b } = await twoDevices();
      await revoke(b.accessToken, await sessionIdOf(a));

      expectErrorEnvelope(
        await setPushToken(a.accessToken, 'fcm-token-1'),
        401,
        'AUTH_SESSION_INVALID',
      );
      expect(await fcmOf(a)).toBeNull();
    });

    it('should validate the token', async () => {
      const { a } = await twoDevices();

      expectErrorEnvelope(await setPushToken(a.accessToken, ''), 400, 'VALIDATION_FAILED');
      expectErrorEnvelope(
        await setPushToken(a.accessToken, 'x'.repeat(4097)),
        400,
        'VALIDATION_FAILED',
      );
    });

    it('should require an access token', async () => {
      expectErrorEnvelope(await setPushToken(undefined, 'fcm'), 401, 'AUTH_TOKEN_MISSING');
    });
  });
});
