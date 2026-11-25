import { redactUrl, resolveRequestId } from './redaction';

describe('redactUrl', () => {
  it('should mask token query parameters', () => {
    expect(redactUrl('/api/v1/links/verify-email?token=abc.def&x=1')).toBe(
      '/api/v1/links/verify-email?token=[REDACTED]&x=1',
    );
    expect(redactUrl('/x?a=1&refreshToken=secret')).toBe('/x?a=1&refreshToken=[REDACTED]');
  });

  it('should leave URLs without tokens unchanged', () => {
    expect(redactUrl('/api/v1/health')).toBe('/api/v1/health');
  });
});

describe('resolveRequestId', () => {
  it('should reuse a safe incoming id', () => {
    expect(resolveRequestId('abc-123_X.y')).toBe('abc-123_X.y');
    expect(resolveRequestId(['first', 'second'])).toBe('first');
  });

  it('should generate a UUID for missing or unsafe ids', () => {
    expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('<script>')).toMatch(/^[0-9a-f-]{36}$/);
    expect(resolveRequestId('x'.repeat(200))).toMatch(/^[0-9a-f-]{36}$/);
  });
});
