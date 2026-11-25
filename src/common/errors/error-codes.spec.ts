import { HttpStatus } from '@nestjs/common';
import { DetailCode, ERROR_CATALOG, ErrorCode, formatMessage } from './error-codes';

const UPPER_SNAKE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

describe('ERROR_CATALOG', () => {
  it('should define a status and message for every error code', () => {
    for (const code of Object.values(ErrorCode)) {
      const definition = ERROR_CATALOG[code];
      expect(definition.httpStatus).toBeGreaterThanOrEqual(400);
      expect(definition.defaultMessage.length).toBeGreaterThan(0);
    }
  });

  it('should only contain catalogued codes', () => {
    expect(Object.keys(ERROR_CATALOG).sort()).toEqual(Object.values(ErrorCode).sort());
  });

  it('should use UPPER_SNAKE_CASE for every top-level and detail code', () => {
    for (const code of [...Object.values(ErrorCode), ...Object.values(DetailCode)]) {
      expect(code).toMatch(UPPER_SNAKE);
    }
  });

  it('should not reuse a value between top-level and detail codes', () => {
    const all = [...Object.values(ErrorCode), ...Object.values(DetailCode)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('should use 403, not 401, for a wrong current password (research R15)', () => {
    expect(ERROR_CATALOG.AUTH_CURRENT_PASSWORD_INCORRECT.httpStatus).toBe(HttpStatus.FORBIDDEN);
  });
});

describe('formatMessage', () => {
  it('should replace known placeholders', () => {
    expect(formatMessage('Try again after {time}.', { time: '10:15 UTC' })).toBe(
      'Try again after 10:15 UTC.',
    );
  });

  it('should leave unknown placeholders untouched when no value is given', () => {
    expect(formatMessage('Try again after {time}.')).toBe('Try again after {time}.');
  });
});
