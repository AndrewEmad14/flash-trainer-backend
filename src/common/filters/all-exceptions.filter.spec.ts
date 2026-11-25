import {
  ArgumentsHost,
  BadRequestException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from '../errors/app.exception';
import { DetailCode, ErrorCode } from '../errors/error-codes';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface CapturedResponse {
  statusCode?: number;
  body?: unknown;
  headers: Record<string, string>;
}

const run = (exception: unknown): CapturedResponse => {
  const captured: CapturedResponse = { headers: {} };
  const response = {
    setHeader: (name: string, value: string) => {
      captured.headers[name] = value;
    },
    status: (code: number) => {
      captured.statusCode = code;
      return { json: (body: unknown) => (captured.body = body) };
    },
  };
  const request = { id: 'req-1', method: 'GET', url: '/api/v1/x' };
  const host = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return captured;
};

describe('AllExceptionsFilter', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('should render an AppException as the error envelope with its details and headers', () => {
    const details = [{ field: 'email', code: DetailCode.USER_EMAIL_TAKEN, message: 'taken' }];
    const result = run(
      new AppException(ErrorCode.USER_IDENTITY_TAKEN, {
        details,
        headers: { 'Retry-After': '5' },
      }),
    );

    expect(result.statusCode).toBe(409);
    expect(result.headers).toEqual({ 'X-Request-Id': 'req-1', 'Retry-After': '5' });
    expect(result.body).toEqual({
      success: false,
      error: {
        statusCode: 409,
        code: 'USER_IDENTITY_TAKEN',
        message: 'Some of the details you entered are already used by another account.',
        details,
      },
      meta: { requestId: 'req-1', timestamp: expect.any(String) },
    });
  });

  it('should omit details when there are none', () => {
    const result = run(new AppException(ErrorCode.SESSION_NOT_FOUND));

    expect((result.body as { error: object }).error).not.toHaveProperty('details');
  });

  it.each([
    [new ThrottlerException(), HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMIT_EXCEEDED],
    [new NotFoundException('Cannot GET /x'), HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND],
    [new UnauthorizedException(), HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID],
    [
      new BadRequestException('Unexpected token'),
      HttpStatus.BAD_REQUEST,
      ErrorCode.VALIDATION_FAILED,
    ],
    [new PayloadTooLargeException(), HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_FAILED],
    [
      new ServiceUnavailableException({ database: { status: 'down' } }),
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.SERVICE_UNAVAILABLE,
    ],
  ])('should map %p to a catalogued code', (exception, status, code) => {
    const result = run(exception);

    expect(result.statusCode).toBe(status);
    expect((result.body as { error: { code: string } }).error.code).toBe(code);
  });

  it('should hide internals of unknown errors behind INTERNAL_ERROR and log the stack', () => {
    const result = run(new Error('db password is hunter2'));

    expect(result.statusCode).toBe(500);
    expect(JSON.stringify(result.body)).not.toContain('hunter2');
    expect((result.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('INTERNAL_ERROR'),
      expect.stringContaining('hunter2'),
    );
  });

  it('should log non-Error throwables as 500s', () => {
    expect(run('boom').statusCode).toBe(500);
  });

  it('should never return dependency details for SERVICE_UNAVAILABLE but log them', () => {
    const result = run(new ServiceUnavailableException({ database: { status: 'down' } }));

    expect(JSON.stringify(result.body)).not.toContain('database');
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('database'),
      expect.any(String),
    );
  });

  it('should redact link tokens from logged URLs', () => {
    const captured: string[] = [];
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      captured.push(String(message));
    });
    const host = {
      switchToHttp: () => ({
        getRequest: () => ({ id: 'r', method: 'GET', url: '/api/v1/links/x?token=secret' }),
        getResponse: () => ({ setHeader: jest.fn(), status: () => ({ json: jest.fn() }) }),
      }),
    } as unknown as ArgumentsHost;

    new AllExceptionsFilter().catch(new AppException(ErrorCode.AUTH_LINK_INVALID), host);

    expect(captured.join()).not.toContain('secret');
  });

  it('should log 4xx responses at warn level', () => {
    run(new AppException(ErrorCode.SESSION_NOT_FOUND));

    expect(Logger.prototype.warn).toHaveBeenCalledWith('GET /api/v1/x → 404 SESSION_NOT_FOUND');
  });
});
