import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Response } from 'supertest';

export interface RegisterPayload {
  fullName: string;
  username: string;
  email: string;
  password: string;
  passwordConfirmation?: string;
  phone?: string;
  deviceName?: string;
  deviceOs?: string;
}

export interface AuthTokens {
  tokenType: 'Bearer';
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export interface UserResponse {
  id: string;
  fullName: string;
  username: string;
  email: string;
  isEmailVerified: boolean;
  phone: string | null;
  createdAt: string;
}

export interface AuthResult {
  user: UserResponse;
  tokens: AuthTokens;
}

let counter = 0;

/** A valid, unique registration payload. Override any field per test. */
export function newUser(overrides: Partial<RegisterPayload> = {}): RegisterPayload {
  counter += 1;
  const user: RegisterPayload = {
    fullName: 'Ahmed Ali',
    username: `user_${String(counter)}_${String(Date.now() % 100000)}`,
    email: `user${String(counter)}.${String(Date.now() % 100000)}@mail.com`,
    password: 's3cretPass',
    deviceName: 'Test iPhone',
    deviceOs: 'iOS 19.1',
    ...overrides,
  };
  // Confirm whatever password the test chose, unless it sets the confirmation itself (FR-033).
  return { ...user, passwordConfirmation: overrides.passwordConfirmation ?? user.password };
}

/** POST /api/v1/auth/register, returning the raw response. */
export function register(app: NestExpressApplication, payload: object): Promise<Response> {
  return request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send(payload)
    .then((r) => r);
}

/** POST /api/v1/auth/refresh, returning the raw response. */
export function refresh(app: NestExpressApplication, refreshToken: unknown): Promise<Response> {
  return request(app.getHttpServer())
    .post('/api/v1/auth/refresh')
    .send({ refreshToken })
    .then((r) => r);
}

/** POST /api/v1/auth/logout (public; identifies the device by its refresh token). */
export function logout(app: NestExpressApplication, refreshToken: unknown): Promise<Response> {
  return request(app.getHttpServer())
    .post('/api/v1/auth/logout')
    .send({ refreshToken })
    .then((r) => r);
}

/** POST /api/v1/auth/logout-all with a bearer access token. */
export function logoutAll(app: NestExpressApplication, accessToken?: string): Promise<Response> {
  const req = request(app.getHttpServer()).post('/api/v1/auth/logout-all');
  return (accessToken ? req.set('Authorization', `Bearer ${accessToken}`) : req).then((r) => r);
}

/** POST /api/v1/auth/login, returning the raw response. */
export function login(app: NestExpressApplication, payload: object): Promise<Response> {
  return request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send(payload)
    .then((r) => r);
}

/**
 * Registers a fresh user, which also signs in that device (US1), and returns the auth result.
 *
 * @throws Error if registration doesn't return 201.
 */
export async function registerAndLogin(
  app: NestExpressApplication,
  overrides: Partial<RegisterPayload> = {},
): Promise<AuthResult & { payload: RegisterPayload }> {
  const payload = newUser(overrides);
  const response = await register(app, payload);
  if (response.status !== 201) {
    throw new Error(`register failed: ${String(response.status)} ${JSON.stringify(response.body)}`);
  }
  return { ...(response.body as { data: AuthResult }).data, payload };
}
