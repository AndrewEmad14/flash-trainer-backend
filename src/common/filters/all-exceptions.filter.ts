import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { buildMeta, type ErrorEnvelope } from '../http/envelope';
import { redactUrl } from '../logging/redaction';

/** Framework HTTP errors (not AppExceptions) that map to a specific catalogued code. */
const STATUS_TO_CODE: ReadonlyMap<number, ErrorCode> = new Map<number, ErrorCode>([
  [HttpStatus.NOT_FOUND, ErrorCode.ROUTE_NOT_FOUND],
  [HttpStatus.UNAUTHORIZED, ErrorCode.AUTH_TOKEN_INVALID],
  [HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMIT_EXCEEDED],
  [HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.SERVICE_UNAVAILABLE],
]);

/**
 * Turns every thrown error into the constitution's error envelope (§III.1–III.2).
 * Unknown errors become `INTERNAL_ERROR` and never leak internals. 5xx responses are
 * logged with their stack, and 4xx at `warn` (Observability).
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Writes the error envelope for any exception thrown while handling an HTTP request.
   * The `X-Request-Id` header always matches `meta.requestId`, even for errors raised before
   * the logger middleware ran (e.g. malformed JSON).
   *
   * @param exception - Whatever was thrown.
   * @param host - Gives access to the Express request and response.
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const appException = this.toAppException(exception);
    const status = appException.getStatus();

    this.log(exception, appException, request);

    const meta = buildMeta(request);
    response.setHeader('X-Request-Id', meta.requestId);
    for (const [name, value] of Object.entries(appException.headers)) {
      response.setHeader(name, value);
    }
    const body: ErrorEnvelope = {
      success: false,
      error: {
        statusCode: status,
        code: appException.code,
        message: appException.message,
        ...(appException.details ? { details: appException.details } : {}),
      },
      meta,
    };
    response.status(status).json(body);
  }

  /**
   * Maps any thrown value to a catalogued {@link AppException}.
   *
   * @param exception - Whatever was thrown.
   * @returns The equivalent AppException.
   */
  toAppException(exception: unknown): AppException {
    if (exception instanceof AppException) return exception;
    if (exception instanceof ThrottlerException) {
      return new AppException(ErrorCode.RATE_LIMIT_EXCEEDED);
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const mapped = STATUS_TO_CODE.get(status);
      if (mapped) return new AppException(mapped);
      // Malformed JSON, payload too large, etc.: a client-side request problem.
      if (status < 500) return new AppException(ErrorCode.VALIDATION_FAILED);
    }
    return new AppException(ErrorCode.INTERNAL_ERROR);
  }

  private log(exception: unknown, mapped: AppException, request: Request): void {
    const url = request.originalUrl || request.url;
    const context = `${request.method} ${redactUrl(url)} → ${mapped.getStatus()} ${mapped.code}`;
    if (mapped.getStatus() >= 500) {
      const internal =
        exception instanceof HttpException ? JSON.stringify(exception.getResponse()) : '';
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${context} ${internal}`.trim(), stack);
    } else {
      this.logger.warn(context);
    }
  }
}
