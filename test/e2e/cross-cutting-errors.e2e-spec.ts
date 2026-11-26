import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaHealthIndicator } from '@nestjs/terminus';
import request, { type Response } from 'supertest';
import { buildOpenApiDocument } from '../../src/swagger.setup';
import { expectErrorEnvelope } from '../utils/assertions';
import { registerAndLogin } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';
import {
  concretePath,
  ENDPOINTS,
  EXCLUDED_OPERATIONS,
  openApiOperationKeys,
  toOpenApiPath,
  type EndpointSpec,
} from '../utils/endpoints';

/**
 * Constitution §II: "an e2e test for each documented error". Every endpoint is checked against
 * the errors it shares with others: token errors, validation errors and rate limiting.
 */
describe('Cross-cutting errors on every endpoint (T125)', () => {
  let app: NestExpressApplication;
  let validAccessToken: string;
  let expiredAccessToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await truncateAll(app);
    const { tokens, user } = await registerAndLogin(app);
    validAccessToken = tokens.accessToken;
    expiredAccessToken = await new JwtService().signAsync(
      {
        sub: user.id,
        sid: '00000000-0000-4000-8000-000000000000',
        exp: Math.floor(Date.now() / 1000) - 5,
      },
      { secret: process.env.JWT_ACCESS_SECRET },
    );
  });

  beforeEach(() => {
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const send = (endpoint: EndpointSpec, token?: string, body?: object): Promise<Response> => {
    const req = request(app.getHttpServer())[endpoint.method](concretePath(endpoint.path));
    if (token) req.set('Authorization', `Bearer ${token}`);
    return (body === undefined ? req : req.send(body)).then((r) => r);
  };

  const label = (e: EndpointSpec): string => `${e.method.toUpperCase()} ${e.path}`;

  it('should cover every JSON operation in the OpenAPI document', () => {
    const listed = ENDPOINTS.map((e) => `${e.method} ${toOpenApiPath(e.path)}`);
    const documented = openApiOperationKeys(buildOpenApiDocument(app)).filter(
      (key) => !EXCLUDED_OPERATIONS.includes(key),
    );

    expect(documented.sort()).toEqual(listed.sort());
  });

  describe.each(ENDPOINTS.filter((e) => !e.isPublic).map((e) => [label(e), e] as const))(
    '%s (protected)',
    (_label, endpoint) => {
      it('should return AUTH_TOKEN_MISSING without a token', async () => {
        expectErrorEnvelope(await send(endpoint, undefined, {}), 401, 'AUTH_TOKEN_MISSING');
      });

      it('should return AUTH_TOKEN_INVALID for a garbage token', async () => {
        expectErrorEnvelope(await send(endpoint, 'garbage.token', {}), 401, 'AUTH_TOKEN_INVALID');
      });

      it('should return AUTH_TOKEN_EXPIRED for an expired token', async () => {
        expectErrorEnvelope(
          await send(endpoint, expiredAccessToken, {}),
          401,
          'AUTH_TOKEN_EXPIRED',
        );
      });
    },
  );

  describe.each(
    ENDPOINTS.filter((e) => e.invalidBody !== undefined).map((e) => [label(e), e] as const),
  )('%s (body validation)', (_label, endpoint) => {
    const token = (): string | undefined => (endpoint.isPublic ? undefined : validAccessToken);

    it('should return VALIDATION_FAILED with field details for an invalid body', async () => {
      const response = await send(endpoint, token(), endpoint.invalidBody);

      expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
      const details = (response.body as { error: { details?: unknown[] } }).error.details ?? [];
      expect(details.length).toBeGreaterThan(0);
    });

    it('should reject unknown fields with FIELD_NOT_ALLOWED', async () => {
      const response = await send(endpoint, token(), { ...endpoint.invalidBody, notAField: 'x' });

      expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
      expect((response.body as { error: { details: unknown } }).error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'notAField', code: 'FIELD_NOT_ALLOWED' }),
        ]),
      );
    });
  });

  describe.each(ENDPOINTS.filter((e) => e.throttle === 'auth').map((e) => [label(e), e] as const))(
    '%s (auth rate limit)',
    (_label, endpoint) => {
      it('should return RATE_LIMIT_EXCEEDED with Retry-After on the 11th request in a minute', async () => {
        for (let i = 0; i < 10; i += 1) {
          expect((await send(endpoint, undefined, endpoint.invalidBody ?? {})).status).not.toBe(
            429,
          );
        }

        const limited = await send(endpoint, undefined, endpoint.invalidBody ?? {});

        expectErrorEnvelope(limited, 429, 'RATE_LIMIT_EXCEEDED');
        expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
      });
    },
  );

  describe.each(
    ENDPOINTS.filter((e) => e.throttle === 'default').map((e) => [label(e), e] as const),
  )('%s (default rate limit)', (_label, endpoint) => {
    it('should return RATE_LIMIT_EXCEEDED with Retry-After on the 101st request in a minute', async () => {
      for (let i = 0; i < 100; i += 1) {
        expect((await send(endpoint, undefined, endpoint.invalidBody ?? {})).status).not.toBe(429);
      }

      const limited = await send(endpoint, undefined, endpoint.invalidBody ?? {});

      expectErrorEnvelope(limited, 429, 'RATE_LIMIT_EXCEEDED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  describe('GET /health', () => {
    it('should return RATE_LIMIT_EXCEEDED on the 101st request in a minute', async () => {
      for (let i = 0; i < 100; i += 1) {
        expect((await request(app.getHttpServer()).get('/api/v1/health')).status).toBe(200);
      }

      expectErrorEnvelope(
        await request(app.getHttpServer()).get('/api/v1/health'),
        429,
        'RATE_LIMIT_EXCEEDED',
      );
    });
  });
});

describe('GET /health with the database down (T137)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const failingPing = {
      pingCheck: (key: string) =>
        Promise.resolve({
          [key]: { status: 'down', message: 'connect ECONNREFUSED db-internal:5432' },
        }),
    };
    app = await createTestApp({
      providers: [{ provide: PrismaHealthIndicator, useValue: failingPing }],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 503 SERVICE_UNAVAILABLE without exposing which dependency failed', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expectErrorEnvelope(response, 503, 'SERVICE_UNAVAILABLE');
    expect(JSON.stringify(response.body)).not.toMatch(/database|db-internal|ECONNREFUSED/);
  });
});
