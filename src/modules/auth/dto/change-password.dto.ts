import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  IsStrongPassword,
  PASSWORD_RULE_MESSAGE,
} from '../../../common/validators/is-strong-password.validator';
import { MatchesField } from '../../../common/validators/matches-field.validator';

/** Body of `PUT /auth/password` (US9, FR-027, FR-033). */
export class ChangePasswordDto {
  @ApiProperty({
    description:
      'The password the user has now, exactly as typed. If wrong: 403 `AUTH_CURRENT_PASSWORD_INCORRECT`.',
    example: 's3cretPass',
    format: 'password',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({
    description: `The new password, used as typed. Rule: ${PASSWORD_RULE_MESSAGE}.`,
    example: 'n3wSecretPass',
    format: 'password',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword()
  newPassword: string;

  @ApiProperty({
    description:
      'The new password typed again. It must match `newPassword` exactly; otherwise `FIELD_CONFIRMATION_MISMATCH` (FR-033).',
    example: 'n3wSecretPass',
    format: 'password',
  })
  @IsString()
  @IsNotEmpty()
  @MatchesField('newPassword')
  newPasswordConfirmation: string;
}
