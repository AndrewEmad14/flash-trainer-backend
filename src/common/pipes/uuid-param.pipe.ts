import { ParseUUIDPipe } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { DetailCode, ErrorCode } from '../errors/error-codes';

/**
 * `ParseUUIDPipe` for a path parameter that fails with the standard envelope: `VALIDATION_FAILED`
 * with a field-level `FIELD_INVALID_FORMAT` detail, instead of Nest's bare 400.
 *
 * @param field - The parameter name reported in `details[].field`.
 * @returns The configured pipe.
 */
export function uuidParam(field: string): ParseUUIDPipe {
  return new ParseUUIDPipe({
    exceptionFactory: () =>
      new AppException(ErrorCode.VALIDATION_FAILED, {
        details: [
          { field, code: DetailCode.FIELD_INVALID_FORMAT, message: `${field} must be a UUID` },
        ],
      }),
  });
}
