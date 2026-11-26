import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizeEmail } from '../../../common/utils/normalize.util';

/** Body of `POST /auth/password-reset`. */
export class RequestPasswordResetDto {
  @ApiProperty({
    description: 'Email of the account. Case and surrounding spaces are ignored.',
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
}
