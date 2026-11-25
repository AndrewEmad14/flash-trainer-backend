import { HttpException } from '@nestjs/common';
import { DetailCode, ERROR_CATALOG, ErrorCode, formatMessage } from './error-codes';

/** One field-level problem inside `error.details[]`. */
export interface ErrorDetail {
  /** Dotted/bracketed path of the field, e.g. `email` or `cards[0].front`. */
  field: string;
  code: DetailCode;
  message: string;
}

export interface AppExceptionOptions {
  details?: ErrorDetail[];
  /** Values for `{name}` placeholders in the catalog message. */
  messageParams?: Readonly<Record<string, string | number>>;
  /** Extra response headers, e.g. `Retry-After`. */
  headers?: Readonly<Record<string, string>>;
}

/**
 * The only way business code reports a failure (constitution §III.2). Status and message
 * come from {@link ERROR_CATALOG}. The global filter turns it into the error envelope.
 *
 * @example throw new AppException(ErrorCode.SESSION_NOT_FOUND);
 */
export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details: readonly ErrorDetail[] | undefined;
  readonly headers: Readonly<Record<string, string>>;

  constructor(code: ErrorCode, options: AppExceptionOptions = {}) {
    const definition = ERROR_CATALOG[code];
    super(formatMessage(definition.defaultMessage, options.messageParams), definition.httpStatus);
    this.code = code;
    this.details = options.details;
    this.headers = options.headers ?? {};
  }
}
