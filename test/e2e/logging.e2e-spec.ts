import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { LOG_DESTINATION } from '../../src/common/logging/logger.module';
// Type-only: erased at runtime, so these modules still load only after LOG_LEVEL is switched on.
import type * as CreateTestAppModule from '../utils/create-test-app';
import type * as DbModule from '../utils/db';

/**
 * Constitution Observability / T120: logs must never contain passwords, tokens or the
 * Authorization header. Runs real requests with logging switched on and inspects every line
 * pino writes. The app's log destination is swapped for an in-memory stream (LOG_DESTINATION),
 * which works the same on every OS and CI runner.
 */
describe('Log redaction (T120)', () => {
  const lines: string[] = [];
  const capture = { write: (chunk: string): void => void lines.push(chunk) };
  let app: NestExpressApplication;
  let previousLogLevel: string | undefined;

  const PASSWORD = 'sup3rSecretPass';

  beforeAll(async () => {
    // e2e tests run with LOG_LEVEL=silent; this suite needs real log output. The env is read
    // when AppModule is first loaded, so the app is loaded only after switching it on.
    previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';
    const { createTestApp } = jest.requireActual<typeof CreateTestAppModule>(
      '../utils/create-test-app',
    );
    const { truncateAll } = jest.requireActual<typeof DbModule>('../utils/db');
    app = await createTestApp({ providers: [{ provide: LOG_DESTINATION, useValue: capture }] });
    await truncateAll(app);
  });

  afterAll(async () => {
    await app.close();
    process.env.LOG_LEVEL = previousLogLevel;
  });

  it('should log requests without any password, token or Authorization header', async () => {
    const server = app.getHttpServer();
    const registered = await request(server).post('/api/v1/auth/register').send({
      fullName: 'Log Check',
      username: 'log_check',
      email: 'log.check@gmail.com',
      password: PASSWORD,
      passwordConfirmation: PASSWORD,
    });
    const { accessToken, refreshToken } = (
      registered.body as { data: { tokens: { accessToken: string; refreshToken: string } } }
    ).data.tokens;
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: 'log_check', password: PASSWORD });
    await request(server)
      .post('/api/v1/auth/login')
      .send({ identifier: 'log_check', password: 'wrongPass1' });
    await request(server).post('/api/v1/auth/refresh').send({ refreshToken });
    await request(server).get('/api/v1/users/me').set('Authorization', `Bearer ${accessToken}`);
    await request(server).get('/api/v1/links/verify-email?token=LINK-TOKEN-SECRET-123');
    await request(server)
      .post('/api/v1/auth/email-verification/confirm')
      .send({ token: 'BODY-TOKEN-SECRET-456' });

    const output = lines.join('\n');
    expect(output).toContain('request completed');
    for (const secret of [
      PASSWORD,
      'wrongPass1',
      accessToken,
      refreshToken,
      'LINK-TOKEN-SECRET-123',
      'BODY-TOKEN-SECRET-456',
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output.toLowerCase()).not.toContain('"authorization"');
    expect(output).toContain('token=[REDACTED]');
  });
});
