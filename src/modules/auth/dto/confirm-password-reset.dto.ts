import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  IsStrongPassword,
  PASSWORD_RULE_MESSAGE,
} from '../../../common/validators/is-strong-password.validator';

/** Body of `POST /auth/password-reset/confirm`. */
export class ConfirmPasswordResetDto {
  @ApiProperty({
    description:
      'The `token` from the reset link (the app receives it via `flashtrainer://reset-password?token=…`).',
    example: 'Xy9kP2m…',
    maxLength: 512,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;

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
}
