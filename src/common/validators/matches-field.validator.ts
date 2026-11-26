import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Requires this property to equal `otherProperty` exactly, with no trimming and case
 * included. Used for password confirmations (FR-033). The constraint is named
 * `matchesField`, which the validation exception factory maps to
 * `FIELD_CONFIRMATION_MISMATCH`.
 *
 * @param otherProperty - The sibling property this one must equal (e.g. `password`).
 */
export function MatchesField(
  otherProperty: string,
  options?: ValidationOptions,
): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'matchesField',
      target: target.constructor,
      propertyName: String(propertyName),
      constraints: [otherProperty],
      options: { message: `${String(propertyName)} must match ${otherProperty}`, ...options },
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const other = (args.object as Record<string, unknown>)[otherProperty];
          return typeof value === 'string' && value === other;
        },
      },
    });
  };
}
