import { ValidationError } from 'class-validator';
import { DetailCode, ErrorCode } from '../errors/error-codes';
import { validationExceptionFactory } from './validation-exception.factory';

const error = (
  property: string,
  constraints?: Record<string, string>,
  children: ValidationError[] = [],
): ValidationError => Object.assign(new ValidationError(), { property, constraints, children });

describe('validationExceptionFactory', () => {
  it('should report every invalid field with its detail code', () => {
    const exception = validationExceptionFactory([
      error('email', { isEmail: 'email must be an email' }),
      error('username', { minLength: 'username is too short' }),
      error('fullName', { maxLength: 'fullName is too long' }),
      error('extra', { whitelistValidation: 'property extra should not exist' }),
      error('password', { isStrongPassword: 'password is too weak' }),
    ]);

    expect(exception.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(exception.details).toEqual([
      { field: 'email', code: DetailCode.FIELD_INVALID_FORMAT, message: 'email must be an email' },
      { field: 'username', code: DetailCode.FIELD_TOO_SHORT, message: 'username is too short' },
      { field: 'fullName', code: DetailCode.FIELD_TOO_LONG, message: 'fullName is too long' },
      {
        field: 'extra',
        code: DetailCode.FIELD_NOT_ALLOWED,
        message: 'property extra should not exist',
      },
      {
        field: 'password',
        code: DetailCode.AUTH_PASSWORD_TOO_WEAK,
        message: 'password is too weak',
      },
    ]);
  });

  it('should prefer FIELD_REQUIRED when a field breaks several rules', () => {
    const exception = validationExceptionFactory([
      error('email', { isEmail: 'bad format', isNotEmpty: 'email should not be empty' }),
    ]);

    expect(exception.details).toEqual([
      { field: 'email', code: DetailCode.FIELD_REQUIRED, message: 'email should not be empty' },
    ]);
  });

  it('should build bracketed paths for nested and array fields', () => {
    const exception = validationExceptionFactory([
      error('cards', undefined, [
        error('0', undefined, [error('front', { maxLength: 'front is too long' })]),
      ]),
    ]);

    expect(exception.details).toEqual([
      { field: 'cards[0].front', code: DetailCode.FIELD_TOO_LONG, message: 'front is too long' },
    ]);
  });

  it('should skip errors that carry no constraints', () => {
    expect(validationExceptionFactory([error('x', {})]).details).toEqual([]);
  });
});
