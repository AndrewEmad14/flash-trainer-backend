import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of `POST /auth/email-verification/confirm`. */
export class ConfirmEmailVerificationDto {
  @ApiProperty({
    description:
      'The `token` query parameter of the verification link (the app receives it via the `flashtrainer://verify-email?token=…` deep link).',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    maxLength: 2048,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  token: string;
}
