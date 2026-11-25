import { registerDecorator, type ValidationOptions } from 'class-validator';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_RULE_MESSAGE = `password must be ${String(PASSWORD_MIN_LENGTH)}–${String(PASSWORD_MAX_LENGTH)} characters and contain at least one letter and one number`;

/**
 * The password policy (FR-004, data-model.md validation rule "password / newPassword"):
 * 8–64 characters, at least one letter and at least one digit. Passwords are never trimmed.
 *
 * @param value - Candidate password.
 * @returns Whether it satisfies the policy.
 */
export function isStrongPassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  // Count Unicode code points, not UTF-16 units, so emoji and accents count as one character.
  const length = Array.from(value).length;
  return (
    length >= PASSWORD_MIN_LENGTH &&
    length <= PASSWORD_MAX_LENGTH &&
    /\p{L}/u.test(value) &&
    /\p{Nd}/u.test(value)
  );
}

/**
 * Validates the password policy. The constraint is named `isStrongPassword`, which the
 * validation exception factory maps to the `AUTH_PASSWORD_TOO_WEAK` detail code.
 */
export function IsStrongPassword(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isStrongPassword',
      target: target.constructor,
      propertyName: String(propertyName),
      options: { message: PASSWORD_RULE_MESSAGE, ...options },
      validator: { validate: isStrongPassword },
    });
  };
}
