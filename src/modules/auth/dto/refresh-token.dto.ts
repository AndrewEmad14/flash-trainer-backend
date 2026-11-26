import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Body of `POST /auth/refresh` (and later `POST /auth/logout`). */
export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token from the last sign-in or refresh. Each one can be used once.',
    example: 'q8Zk3fJ0n2mXcVb7Lw1pQe9sRt4yUa6dHg5jKz2xNcM',
    maxLength: 512,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refreshToken: string;
}
