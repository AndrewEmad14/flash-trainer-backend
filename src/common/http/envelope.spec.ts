import type { Request } from 'express';
import { buildMeta, getRequestId } from './envelope';

const req = (id?: unknown): Request => ({ id }) as unknown as Request;

describe('getRequestId', () => {
  it('should return the request id set by the logger', () => {
    expect(getRequestId(req('abc-123'))).toBe('abc-123');
  });

  it('should stringify numeric ids', () => {
    expect(getRequestId(req(42))).toBe('42');
  });

  it('should generate a UUID and keep it on the request when no id is present', () => {
    const request = req();

    const id = getRequestId(request);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(getRequestId(request)).toBe(id);
  });
});

describe('buildMeta', () => {
  it('should include the request id and an ISO timestamp', () => {
    const meta = buildMeta(req('r1'));

    expect(meta.requestId).toBe('r1');
    expect(new Date(meta.timestamp).toISOString()).toBe(meta.timestamp);
    expect(meta).not.toHaveProperty('pagination');
  });

  it('should include pagination when given', () => {
    const pagination = { page: 1, limit: 20, totalItems: 3, totalPages: 1 };

    expect(buildMeta(req('r1'), pagination).pagination).toEqual(pagination);
  });
});
