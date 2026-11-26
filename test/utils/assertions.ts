import type { Response } from 'supertest';

/** Asserts the constitution §III.1 error envelope, including meta. */
export function expectErrorEnvelope(response: Response, status: number, code: string): void {
  expect(response.status).toBe(status);
  expect(response.body).toEqual({
    success: false,
    error: expect.objectContaining({ statusCode: status, code, message: expect.any(String) }),
    meta: { requestId: expect.any(String), timestamp: expect.any(String) },
  });
  expect(response.headers['x-request-id']).toBe(
    (response.body as { meta: { requestId: string } }).meta.requestId,
  );
}

/**
 * Asserts the success envelope and returns `data` (cast it at the call site). `data` may be
 * `null` (endpoints that return nothing), but the key must always be present.
 */
export function expectSuccessEnvelope(response: Response, status = 200): unknown {
  expect(response.status).toBe(status);
  const body = response.body as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(['data', 'meta', 'success']);
  expect(body.success).toBe(true);
  expect(body.meta).toEqual({ requestId: expect.any(String), timestamp: expect.any(String) });
  return body.data;
}
