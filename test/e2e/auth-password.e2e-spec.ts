import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { sha256Hex } from '../../src/common/utils/hash.util';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { login, refresh, registerAndLogin } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';
import { extractTokenFromLink, mailbox, settle, waitForMailTo } from '../utils/mail';

describe('Forgot password (US8)', () => {
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

  const requestReset = (email: unknown) =>
    request(server()).post('/api/v1/auth/password-reset').send({ email });

  const confirmReset = (
    token: unknown,
    newPassword: unknown,
    newPasswordConfirmation: unknown = newPassword,
  ) =>
    request(server())
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, newPassword, newPasswordConfirmation });

  const resetMailsTo = (email: string) =>
    mailbox(app)
      .getSentMessages()
      .filter((m) => m.to === email && m.subject.toLowerCase().includes('reset'));

  /** Registered user (welcome email cleared) plus a fresh reset token from their inbox. */
  const userWithResetToken = async () => {
    const user = await registerAndLogin(app);
    mailbox(app).clear();
    await requestReset(user.payload.email);
    const token = extractTokenFromLink(await waitForMailTo(app, user.payload.email));
    return { ...user, token };
  };

  const ageResetDispatches = (userId: string) =>
    prisma.emailDispatch.updateMany({
      where: { userId, type: 'RESET_PASSWORD' },
      data: { createdAt: new Date(Date.now() - 2 * 60_000) },
    });

  describe('POST /auth/password-reset', () => {
    it('should answer identically for existing and unknown emails, emailing only the real one', async () => {
      const { payload } = await registerAndLogin(app);
      mailbox(app).clear();

      const known = await requestReset(payload.email);
      const unknown = await requestReset('nobody-here@gmail.com');
      await waitForMailTo(app, payload.email);
      await settle();

      expect(expectSuccessEnvelope(known)).toBeNull();
      expect(expectSuccessEnvelope(unknown)).toBeNull();
      expect((known.body as { error?: unknown }).error).toEqual(
        (unknown.body as { error?: unknown }).error,
      );
      expect(
        mailbox(app)
          .getSentMessages()
          .map((m) => m.to),
      ).toEqual([payload.email]);
      expect(resetMailsTo(payload.email)[0]?.text).toContain('/reset-password?token=');
    });

    it('should accept the email in any letter case', async () => {
      const { payload } = await registerAndLogin(app);
      mailbox(app).clear();

      await requestReset(`  ${payload.email.toUpperCase()} `);

      await expect(waitForMailTo(app, payload.email)).resolves.toBeDefined();
    });

    it('should silently skip a second request within 60 seconds', async () => {
      const { payload } = await userWithResetToken();

      const second = await requestReset(payload.email);
      await settle();

      expect(second.status).toBe(200);
      expect(resetMailsTo(payload.email)).toHaveLength(1);
    });

    it('should require a valid email', async () => {
      expectErrorEnvelope(await requestReset('not-an-email'), 400, 'VALIDATION_FAILED');
    });
  });

  describe('POST /auth/password-reset/confirm', () => {
    it('should set the new password, sign out every device and keep the old password from working', async () => {
      const { payload, token, tokens } = await userWithResetToken();
      const otherDevice = await login(app, {
        identifier: payload.email,
        password: payload.password,
      });
      const otherRefresh = (otherDevice.body as { data: { tokens: { refreshToken: string } } }).data
        .tokens.refreshToken;

      const response = await confirmReset(token, 'n3wSecretPass');

      expect(expectSuccessEnvelope(response)).toBeNull();
      expectErrorEnvelope(await refresh(app, tokens.refreshToken), 401, 'AUTH_SESSION_INVALID');
      expectErrorEnvelope(await refresh(app, otherRefresh), 401, 'AUTH_SESSION_INVALID');
      expectErrorEnvelope(
        await login(app, { identifier: payload.email, password: payload.password }),
        401,
        'AUTH_INVALID_CREDENTIALS',
      );
      expect(
        (await login(app, { identifier: payload.email, password: 'n3wSecretPass' })).status,
      ).toBe(200);
    });

    it('should work only once (AUTH_LINK_USED afterwards)', async () => {
      const { token } = await userWithResetToken();
      expect((await confirmReset(token, 'n3wSecretPass')).status).toBe(200);

      expectErrorEnvelope(await confirmReset(token, 'an0therPass'), 400, 'AUTH_LINK_USED');
    });

    it('should invalidate an earlier link once a newer one is requested', async () => {
      const { payload, token: first, user } = await userWithResetToken();
      await ageResetDispatches(user.id);
      mailbox(app).clear();
      await requestReset(payload.email);
      const second = extractTokenFromLink(await waitForMailTo(app, payload.email));

      expectErrorEnvelope(await confirmReset(first, 'n3wSecretPass'), 400, 'AUTH_LINK_INVALID');
      expect((await confirmReset(second, 'n3wSecretPass')).status).toBe(200);
    });

    it('should return AUTH_LINK_EXPIRED after an hour', async () => {
      const { token } = await userWithResetToken();
      await prisma.passwordReset.updateMany({
        where: { tokenHash: sha256Hex(token) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      expectErrorEnvelope(await confirmReset(token, 'n3wSecretPass'), 400, 'AUTH_LINK_EXPIRED');
    });

    it('should return AUTH_LINK_INVALID for an unknown token', async () => {
      expectErrorEnvelope(
        await confirmReset('never-issued', 'n3wSecretPass'),
        400,
        'AUTH_LINK_INVALID',
      );
    });

    it('should reject a weak new password with AUTH_PASSWORD_TOO_WEAK, keeping the link usable', async () => {
      const { token } = await userWithResetToken();

      const weak = await confirmReset(token, 'abcdefgh');

      expectErrorEnvelope(weak, 400, 'VALIDATION_FAILED');
      expect((weak.body as { error: { details: unknown } }).error.details).toEqual([
        expect.objectContaining({ field: 'newPassword', code: 'AUTH_PASSWORD_TOO_WEAK' }),
      ]);
      expect((await confirmReset(token, 'n3wSecretPass')).status).toBe(200);
    });

    it('should reject a mismatched or missing confirmation, keeping the link usable (FR-033)', async () => {
      const { token } = await userWithResetToken();

      const mismatch = await confirmReset(token, 'n3wSecretPass', 'n3wSecretPasS');
      // Sent without the field: a default parameter would fill `undefined` back in.
      const missing = await request(server())
        .post('/api/v1/auth/password-reset/confirm')
        .send({ token, newPassword: 'n3wSecretPass' });

      expectErrorEnvelope(mismatch, 400, 'VALIDATION_FAILED');
      expect((mismatch.body as { error: { details: unknown } }).error.details).toEqual([
        expect.objectContaining({
          field: 'newPasswordConfirmation',
          code: 'FIELD_CONFIRMATION_MISMATCH',
        }),
      ]);
      expectErrorEnvelope(missing, 400, 'VALIDATION_FAILED');
      expect((missing.body as { error: { details: unknown } }).error.details).toEqual([
        expect.objectContaining({ field: 'newPasswordConfirmation', code: 'FIELD_REQUIRED' }),
      ]);
      expect((await confirmReset(token, 'n3wSecretPass')).status).toBe(200);
    });

    it('should let exactly one of two simultaneous confirmations win', async () => {
      const { token } = await userWithResetToken();

      const results = await Promise.all([
        confirmReset(token, 'n3wSecretPass'),
        confirmReset(token, 'otherPass99'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    });

    it('should lift a sign-in lockout so the new password works immediately', async () => {
      const { payload, token } = await userWithResetToken();
      for (let i = 0; i < 5; i += 1) {
        await login(app, { identifier: payload.email, password: 'wrongPass1' });
      }

      await confirmReset(token, 'n3wSecretPass');

      expect(
        (await login(app, { identifier: payload.email, password: 'n3wSecretPass' })).status,
      ).toBe(200);
    });
  });
});
