import { HttpStatus } from '@nestjs/common';
import { AppException } from './app.exception';
import { DetailCode, ErrorCode } from './error-codes';

describe('AppException', () => {
  it('should take its status and message from the catalog', () => {
    const exception = new AppException(ErrorCode.SESSION_NOT_FOUND);

    expect(exception.getStatus()).toBe(HttpStatus.NOT_FOUND);
    expect(exception.message).toBe('No session was found with this id.');
    expect(exception.code).toBe(ErrorCode.SESSION_NOT_FOUND);
    expect(exception.details).toBeUndefined();
    expect(exception.headers).toEqual({});
  });

  it('should interpolate message params and keep details and headers', () => {
    const details = [{ field: 'email', code: DetailCode.USER_EMAIL_TAKEN, message: 'taken' }];
    const exception = new AppException(ErrorCode.AUTH_TOO_MANY_ATTEMPTS, {
      messageParams: { time: '2026-11-25T10:15:00.000Z' },
      headers: { 'Retry-After': '120' },
      details,
    });

    expect(exception.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(exception.message).toBe(
      'Too many failed sign-in attempts. Try again after 2026-11-25T10:15:00.000Z.',
    );
    expect(exception.headers).toEqual({ 'Retry-After': '120' });
    expect(exception.details).toEqual(details);
  });
});
