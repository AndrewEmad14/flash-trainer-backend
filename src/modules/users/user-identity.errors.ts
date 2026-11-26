import { AppException, type ErrorDetail } from '../../common/errors/app.exception';
import { DetailCode, ErrorCode } from '../../common/errors/error-codes';

export type IdentityField = 'email' | 'username' | 'phone';

/** Order in which conflicts are reported. */
export const IDENTITY_FIELDS: readonly IdentityField[] = ['email', 'username', 'phone'];

const DETAILS: Readonly<Record<IdentityField, ErrorDetail>> = {
  email: {
    field: 'email',
    code: DetailCode.USER_EMAIL_TAKEN,
    message: 'This email is already registered.',
  },
  username: {
    field: 'username',
    code: DetailCode.USER_USERNAME_TAKEN,
    message: 'This username is already taken.',
  },
  phone: {
    field: 'phone',
    code: DetailCode.USER_PHONE_TAKEN,
    message: 'This phone number is already registered.',
  },
};

/**
 * Builds the `USER_IDENTITY_TAKEN` error listing every conflicting field (FR-006, R9).
 *
 * @param fields - The fields already used by another account.
 * @returns The exception to throw.
 */
export function identityTakenException(fields: readonly IdentityField[]): AppException {
  const details = IDENTITY_FIELDS.filter((field) => fields.includes(field)).map(
    (field) => DETAILS[field],
  );
  return new AppException(ErrorCode.USER_IDENTITY_TAKEN, { details });
}
