import { HttpStatus } from '@nestjs/common';

/**
 * Top-level error codes: the public error contract with the Flutter app
 * (constitution §III.2, specs/001-user-auth/contracts/error-codes.md).
 * Once released, a code MUST NOT be renamed or reused. Codes can only be added or deprecated.
 */
export enum ErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  USER_IDENTITY_TAKEN = 'USER_IDENTITY_TAKEN',
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOO_MANY_ATTEMPTS = 'AUTH_TOO_MANY_ATTEMPTS',
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_SESSION_INVALID = 'AUTH_SESSION_INVALID',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  AUTH_LINK_INVALID = 'AUTH_LINK_INVALID',
  AUTH_LINK_EXPIRED = 'AUTH_LINK_EXPIRED',
  AUTH_LINK_USED = 'AUTH_LINK_USED',
  AUTH_EMAIL_ALREADY_VERIFIED = 'AUTH_EMAIL_ALREADY_VERIFIED',
  AUTH_CURRENT_PASSWORD_INCORRECT = 'AUTH_CURRENT_PASSWORD_INCORRECT',
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** Field-level codes used inside `error.details[].code`. */
export enum DetailCode {
  FIELD_REQUIRED = 'FIELD_REQUIRED',
  FIELD_TOO_SHORT = 'FIELD_TOO_SHORT',
  FIELD_TOO_LONG = 'FIELD_TOO_LONG',
  FIELD_INVALID_FORMAT = 'FIELD_INVALID_FORMAT',
  FIELD_NOT_ALLOWED = 'FIELD_NOT_ALLOWED',
  AUTH_PASSWORD_TOO_WEAK = 'AUTH_PASSWORD_TOO_WEAK',
  USER_EMAIL_TAKEN = 'USER_EMAIL_TAKEN',
  USER_USERNAME_TAKEN = 'USER_USERNAME_TAKEN',
  USER_PHONE_TAKEN = 'USER_PHONE_TAKEN',
}

export interface ErrorDefinition {
  httpStatus: HttpStatus;
  /** English message. `{name}` placeholders are filled from `messageParams`. */
  defaultMessage: string;
}

/** The single source of truth mapping every error code to its HTTP status and message. */
export const ERROR_CATALOG: Readonly<Record<ErrorCode, ErrorDefinition>> = {
  VALIDATION_FAILED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'The request contains invalid fields.',
  },
  USER_IDENTITY_TAKEN: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Some of the details you entered are already used by another account.',
  },
  AUTH_INVALID_CREDENTIALS: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'The email/username or password is incorrect.',
  },
  AUTH_TOO_MANY_ATTEMPTS: {
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    defaultMessage: 'Too many failed sign-in attempts. Try again after {time}.',
  },
  AUTH_TOKEN_MISSING: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'You need to sign in to do this.',
  },
  AUTH_TOKEN_INVALID: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Your sign-in is not valid. Please sign in again.',
  },
  AUTH_TOKEN_EXPIRED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Your access has expired. Refresh your session.',
  },
  AUTH_SESSION_INVALID: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'This session is no longer valid. Please sign in again.',
  },
  AUTH_SESSION_EXPIRED: {
    httpStatus: HttpStatus.UNAUTHORIZED,
    defaultMessage: 'Your session has expired. Please sign in again.',
  },
  AUTH_LINK_INVALID: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This link is not valid.',
  },
  AUTH_LINK_EXPIRED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This link has expired. Request a new one.',
  },
  AUTH_LINK_USED: {
    httpStatus: HttpStatus.BAD_REQUEST,
    defaultMessage: 'This link has already been used.',
  },
  AUTH_EMAIL_ALREADY_VERIFIED: {
    httpStatus: HttpStatus.CONFLICT,
    defaultMessage: 'Your email is already verified.',
  },
  // 403, not 401, on purpose: the app treats 401 as "refresh or sign out" (research R15).
  AUTH_CURRENT_PASSWORD_INCORRECT: {
    httpStatus: HttpStatus.FORBIDDEN,
    defaultMessage: 'The current password is incorrect.',
  },
  SESSION_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'No session was found with this id.',
  },
  RATE_LIMIT_EXCEEDED: {
    httpStatus: HttpStatus.TOO_MANY_REQUESTS,
    defaultMessage: 'Too many requests. Please slow down.',
  },
  ROUTE_NOT_FOUND: {
    httpStatus: HttpStatus.NOT_FOUND,
    defaultMessage: 'The requested endpoint does not exist.',
  },
  SERVICE_UNAVAILABLE: {
    httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
    defaultMessage: 'The service is temporarily unavailable. Please try again shortly.',
  },
  INTERNAL_ERROR: {
    httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
    defaultMessage: 'Something went wrong on our side.',
  },
};

/**
 * Fills `{name}` placeholders in a catalog message.
 *
 * @param template - Message containing `{name}` placeholders.
 * @param params - Values for the placeholders. Unknown placeholders are left as is.
 * @returns The interpolated message.
 */
export function formatMessage(
  template: string,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
