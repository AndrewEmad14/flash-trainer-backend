import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { expectErrorEnvelope, expectSuccessEnvelope } from '../utils/assertions';
import { createTestApp } from '../utils/create-test-app';

describe('Health & cross-cutting HTTP behaviour (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should return 200 with the success envelope when the database is up', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    const data = expectSuccessEnvelope(response) as { status: string; info: unknown };
    expect(data.status).toBe('ok');
    expect(data.info).toEqual({ database: expect.objectContaining({ status: 'up' }) });
  });

  it('should echo X-Request-Id and use it as meta.requestId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .set('X-Request-Id', 'e2e-trace-42');

    expect(response.headers['x-request-id']).toBe('e2e-trace-42');
    expect((response.body as { meta: { requestId: string } }).meta.requestId).toBe('e2e-trace-42');
  });

  it('should return ROUTE_NOT_FOUND for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/does-not-exist');

    expectErrorEnvelope(response, 404, 'ROUTE_NOT_FOUND');
  });

  it('should return VALIDATION_FAILED for a malformed JSON body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{not json');

    expectErrorEnvelope(response, 400, 'VALIDATION_FAILED');
  });

  it('should set security headers (helmet)', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});
