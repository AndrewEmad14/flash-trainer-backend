import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppException } from '../../src/common/errors/app.exception';
import { UsersRepository } from '../../src/modules/users/users.repository';
import { PrismaService } from '../../src/prisma/prisma.service';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { newUser, register, type AuthResult } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';
import { extractTokenFromLink, lastMailTo, mailbox } from '../utils/mail';

interface ErrorBody {
  error: { details?: { field: string; code: string }[] };
}

const detailsOf = (body: unknown): { field: string; code: string }[] =>
  ((body as ErrorBody).error.details ?? []).map(({ field, code }) => ({ field, code }));

describe('POST /api/v1/auth/register (US1)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

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

  it('should create the account, sign the device in and send a verification email', async () => {
    const payload = newUser({ email: ' Ahmed@Mail.com ', phone: '+201001234567' });

    const response = await register(app, payload);

    const data = expectSuccessEnvelope(response, 201) as AuthResult;
    expect(data.user).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      fullName: 'Ahmed Ali',
      username: payload.username,
      email: 'ahmed@mail.com',
      isEmailVerified: false,
      phone: '+201001234567',
      createdAt: expect.any(String),
    });
    expect(data.user).not.toHaveProperty('passwordHash');
    expect(data.tokens).toEqual({
      tokenType: 'Bearer',
      accessToken: expect.any(String),
      accessTokenExpiresAt: expect.any(String),
      refreshToken: expect.any(String),
      refreshTokenExpiresAt: expect.any(String),
    });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: data.user.id } });
    expect(stored.email).toBe('ahmed@mail.com');
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);

    const sessions = await prisma.authSession.findMany({ where: { userId: data.user.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ deviceName: 'Test iPhone', deviceOs: 'iOS 19.1' });
    expect(sessions[0]?.refreshTokenHash).not.toBe(data.tokens.refreshToken);

    const mail = lastMailTo(app, 'ahmed@mail.com');
    expect(mail?.text).toContain('/verify-email?token=');
    expect(extractTokenFromLink(mail as NonNullable<typeof mail>).length).toBeGreaterThan(20);
    expect(
      await prisma.emailDispatch.count({ where: { userId: data.user.id, type: 'VERIFY_EMAIL' } }),
    ).toBe(1);
  });

  it('should return a phone of null when none is given', async () => {
    const response = await register(app, newUser());

    expect((expectSuccessEnvelope(response, 201) as AuthResult).user.phone).toBeNull();
  });

  it('should report every taken field when email and username already exist (ignoring case)', async () => {
    await register(
      app,
      newUser({ email: 'ahmed@mail.com', username: 'Ahmed_A', phone: '+201001234567' }),
    );

    const response = await register(
      app,
      newUser({ email: 'AHMED@mail.com', username: 'ahmed_a', phone: '+201001234567' }),
    );

    expectErrorEnvelope(response, 409, 'USER_IDENTITY_TAKEN');
    expect(detailsOf(response.body)).toEqual([
      { field: 'email', code: 'USER_EMAIL_TAKEN' },
      { field: 'username', code: 'USER_USERNAME_TAKEN' },
      { field: 'phone', code: 'USER_PHONE_TAKEN' },
    ]);
  });

  it('should report every invalid field at once', async () => {
    const response = await register(app, {
      fullName: '',
      username: 'ab',
      email: 'not-an-email',
      password: 'abcdefgh',
      passwordConfirmation: 'abcdefgh',
      phone: '0100',
    });

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(detailsOf(response.body)).toEqual(
      expect.arrayContaining([
        { field: 'fullName', code: 'FIELD_REQUIRED' },
        { field: 'username', code: 'FIELD_TOO_SHORT' },
        { field: 'email', code: 'FIELD_INVALID_FORMAT' },
        { field: 'password', code: 'AUTH_PASSWORD_TOO_WEAK' },
        { field: 'phone', code: 'FIELD_INVALID_FORMAT' },
      ]),
    );
    expect(detailsOf(response.body)).toHaveLength(5);
  });

  it('should reject usernames with characters outside letters, digits, _ and .', async () => {
    const response = await register(app, newUser({ username: 'ahmed ali!' }));

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(detailsOf(response.body)).toEqual([{ field: 'username', code: 'FIELD_INVALID_FORMAT' }]);
  });

  it('should reject unknown body fields with FIELD_NOT_ALLOWED', async () => {
    const response = await register(app, { ...newUser(), isAdmin: true });

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(detailsOf(response.body)).toEqual([{ field: 'isAdmin', code: 'FIELD_NOT_ALLOWED' }]);
  });

  it('should require every mandatory field', async () => {
    const response = await register(app, {});

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(
      detailsOf(response.body)
        .map((d) => d.field)
        .sort(),
    ).toEqual(['email', 'fullName', 'password', 'passwordConfirmation', 'username']);
  });

  it('should reject a password confirmation that does not match (FR-033)', async () => {
    const response = await register(app, newUser({ passwordConfirmation: 's3cretPasS' }));

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(detailsOf(response.body)).toEqual([
      { field: 'passwordConfirmation', code: 'FIELD_CONFIRMATION_MISMATCH' },
    ]);
  });

  it('should require the password confirmation (FR-033)', async () => {
    const payload: Record<string, unknown> = { ...newUser() };
    delete payload.passwordConfirmation;

    const response = await register(app, payload);

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
    expect(detailsOf(response.body)).toEqual([
      { field: 'passwordConfirmation', code: 'FIELD_REQUIRED' },
    ]);
  });

  it('should let exactly one of two simultaneous duplicate registrations succeed', async () => {
    const payload = newUser();

    const responses = await Promise.all([register(app, payload), register(app, payload)]);

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);
    const conflict = responses.find((r) => r.status === 409);
    expectErrorEnvelope(conflict as NonNullable<typeof conflict>, 409, 'USER_IDENTITY_TAKEN');
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ['email', { email: 'race@mail.com' }, 'USER_EMAIL_TAKEN'],
    ['username (ignoring case)', { username: 'race_user' }, 'USER_USERNAME_TAKEN'],
    ['phone', { phone: '+201009998887' }, 'USER_PHONE_TAKEN'],
  ])(
    'should turn a real database unique violation on %s into USER_IDENTITY_TAKEN with that field',
    async (_field, clash, detailCode) => {
      const repository = app.get(UsersRepository, { strict: false });
      const base = { fullName: 'R', passwordHash: 'x', phone: null };
      await repository.create({
        ...base,
        username: 'Race_User',
        email: 'race@mail.com',
        phone: '+201009998887',
      });

      const error = await repository
        .create({ ...base, username: 'other_user', email: 'other@mail.com', ...clash })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).details?.map((d) => d.code)).toEqual([detailCode]);
    },
  );

  it('should keep spaces inside passwords exactly as typed', async () => {
    const response = await register(app, newUser({ password: ' pass word 1 ' }));

    expect(response.status).toBe(201);
  });
});
