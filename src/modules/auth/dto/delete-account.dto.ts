import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of `DELETE /users/me` (US11, FR-028). */
export class DeleteAccountDto {
  @ApiProperty({
    description:
      'The current password, to confirm. If wrong: 403 `AUTH_CURRENT_PASSWORD_INCORRECT`, and nothing is deleted.',
    example: 's3cretPass',
    format: 'password',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
