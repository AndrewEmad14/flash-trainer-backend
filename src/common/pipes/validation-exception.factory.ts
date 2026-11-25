import { ValidationError } from 'class-validator';
import { AppException, ErrorDetail } from '../errors/app.exception';
import { DetailCode, ErrorCode } from '../errors/error-codes';

/** Constraint name → detail code. Anything not listed is a format problem. */
const CONSTRAINT_CODES: Readonly<Record<string, DetailCode>> = {
  isNotEmpty: DetailCode.FIELD_REQUIRED,
  isDefined: DetailCode.FIELD_REQUIRED,
  whitelistValidation: DetailCode.FIELD_NOT_ALLOWED,
  isStrongPassword: DetailCode.AUTH_PASSWORD_TOO_WEAK,
  minLength: DetailCode.FIELD_TOO_SHORT,
  maxLength: DetailCode.FIELD_TOO_LONG,
};

/** When a field breaks several rules, report the most useful one. */
const PRIORITY: readonly DetailCode[] = [
  DetailCode.FIELD_REQUIRED,
  DetailCode.FIELD_NOT_ALLOWED,
  DetailCode.AUTH_PASSWORD_TOO_WEAK,
  DetailCode.FIELD_TOO_SHORT,
  DetailCode.FIELD_TOO_LONG,
  DetailCode.FIELD_INVALID_FORMAT,
];

const childPath = (parent: string, property: string): string => {
  if (parent === '') return property;
  return /^\d+$/.test(property) ? `${parent}[${property}]` : `${parent}.${property}`;
};

function toDetail(field: string, constraints: Record<string, string>): ErrorDetail | null {
  const candidates = Object.entries(constraints).map(([name, message]) => ({
    code: CONSTRAINT_CODES[name] ?? DetailCode.FIELD_INVALID_FORMAT,
    message,
  }));
  candidates.sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code));
  const best = candidates[0];
  return best ? { field, code: best.code, message: best.message } : null;
}

function collect(errors: readonly ValidationError[], parent: string, out: ErrorDetail[]): void {
  for (const error of errors) {
    const path = childPath(parent, error.property);
    const detail = error.constraints ? toDetail(path, error.constraints) : null;
    if (detail) out.push(detail);
    if (error.children?.length) collect(error.children, path, out);
  }
}

/**
 * `ValidationPipe` exception factory: maps class-validator errors to a single
 * `VALIDATION_FAILED` error with one detail per invalid field (FR-006, constitution §VII).
 *
 * @param errors - Errors produced by class-validator.
 * @returns An {@link AppException} carrying every invalid field.
 */
export function validationExceptionFactory(errors: ValidationError[]): AppException {
  const details: ErrorDetail[] = [];
  collect(errors, '', details);
  return new AppException(ErrorCode.VALIDATION_FAILED, { details });
}
