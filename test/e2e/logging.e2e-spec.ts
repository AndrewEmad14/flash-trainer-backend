import fs from 'node:fs';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
// Type-only: erased at runtime, so these modules still load only after LOG_LEVEL is switched on.
import type * as CreateTestAppModule from '../utils/create-test-app';
import type * as DbModule from '../utils/db';

/**
 * Constitution Observability / T120: logs must never contain passwords, tokens or the
 * Authorization header. Runs real requests with logging switched on and inspects every line
 * pino writes.
 */
describe('Log redaction (T120)', () => {
  const lines: string[] = [];
  let app: NestExpressApplication;
  let writeSpies: jest.SpyInstance[] = [];
  let previousLogLevel: string | undefined;

  const PASSWORD = 'sup3rSecretPass';

  beforeAll(async () => {
    // e2e tests run with LOG_LEVEL=silent; this suite needs real log output. The env is read
    // when AppModule is first loaded, so the app is imported only after switching it on.
    previousLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'info';
    const capture = (fd: unknown, data: unknown): boolean => {
      if (fd !== 1 && fd !== 2) return false;
      lines.push(Buffer.isBuffer(data) ? data.toString('utf8') : String(data));
      return true;
    };
    const realWriteSync = fs.writeSync.bind(fs) as (...args: unknown[]) => number;
    const realWrite = fs.write.bind(fs) as (...args: unknown[]) => void;
    writeSpies = [
      jest.spyOn(fs, 'writeSync').mockImplementation((...args: unknown[]) => {
        if (!capture(args[0], args[1])) return realWriteSync(...args);
        const data = args[1];
        return typeof data === 'string' ? Buffer.byteLength(data) : (data as Buffer).length;
      }),
      jest.spyOn(fs, 'write').mockImplementation((...args: unknown[]) => {
        if (!capture(args[0], args[1])) {
          realWrite(...args);
          return;
        }
        const data = args[1];
        const written =
          typeof data === 'string' ? Buffer.byteLength(data) : (data as Buffer).length;
        const callback = args.at(-1);
        if (typeof callback === 'function') {
          process.nextTick(() => {
            (callback as (e: null, n: number) => void)(null, written);
          });
        }
      }),
    ];
    // Loaded here (not as a top-level import) so AppModule reads LOG_LEVEL=info.
    const { createTestApp } = jest.requireActual<typeof CreateTestAppModule>(
      '../utils/create-test-app',
    );
    const { truncateAll } = jest.requireActual<typeof DbModule>('../utils/db');
    app = await createTestApp();
    await truncateAll(app);
  });

  afterAll(async () => {
    await app.close();
    for (const spy of writeSpies) spy.mockRestore();
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

    await new Promise((resolve) => setTimeout(resolve, 200));
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
