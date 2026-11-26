import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { normalizeEmail, trimString } from '../../../common/utils/normalize.util';
import {
  IsStrongPassword,
  PASSWORD_RULE_MESSAGE,
} from '../../../common/validators/is-strong-password.validator';

export const USERNAME_PATTERN = /^[A-Za-z0-9_.]+$/;
export const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

const trim = ({ value }: { value: unknown }): unknown => trimString(value);

/** Body of `POST /auth/register`. Field rules: data-model.md "Validation rules summary". */
export class RegisterDto {
  @ApiProperty({
    description: 'Display name. 1–100 characters; surrounding spaces are removed.',
    example: 'Ahmed Ali',
    minLength: 1,
    maxLength: 100,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({
    description:
      'Unique handle, 3–30 characters: letters, digits, underscore and dot. Uniqueness ignores letter case; the name is shown exactly as typed.',
    example: 'Ahmed_A',
    minLength: 3,
    maxLength: 30,
    pattern: USERNAME_PATTERN.source,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(30)
  @Matches(USERNAME_PATTERN, {
    message: 'username may only contain letters, digits, underscore and dot',
  })
  username: string;

  @ApiProperty({
    description: 'Email address. Stored trimmed and lowercased; unique regardless of letter case.',
    example: 'ahmed@mail.com',
    format: 'email',
    maxLength: 254,
  })
  @Transform(({ value }: { value: unknown }) => normalizeEmail(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(254)
  @IsEmail({}, { message: 'email must be a valid email address' })
  email: string;

  @ApiProperty({
    description: `Account password, used as typed (never trimmed). Rule: ${PASSWORD_RULE_MESSAGE}.`,
    example: 's3cretPass',
    format: 'password',
    minLength: 8,
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword()
  password: string;

  @ApiPropertyOptional({
    description:
      'Optional phone number in international (E.164) format. Unique when given; not verified and not used for sign-in in this version.',
    example: '+201001234567',
    pattern: E164_PATTERN.source,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Matches(E164_PATTERN, {
    message: 'phone must be in international format, e.g. +201001234567',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Name of this device, shown in the device list.',
    example: "Ahmed's iPhone",
    maxLength: 100,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Operating system of this device, shown in the device list.',
    example: 'iOS 19.1',
    maxLength: 50,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  deviceOs?: string;
}
