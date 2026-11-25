import { ApiProperty } from '@nestjs/swagger';

/** Tokens issued at sign-in, registration and refresh (contracts/auth-api.md "AuthTokens"). */
export class AuthTokensDto {
  @ApiProperty({ description: 'Always "Bearer".', example: 'Bearer', enum: ['Bearer'] })
  tokenType: 'Bearer';

  @ApiProperty({
    description:
      'Short-lived JWT (≈15 min). Send it as `Authorization: Bearer <accessToken>` on protected routes.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
  })
  accessToken: string;

  @ApiProperty({
    description: 'When the access token expires (ISO 8601, UTC).',
    example: '2026-11-25T10:30:00.000Z',
  })
  accessTokenExpiresAt: string;

  @ApiProperty({
    description:
      'Opaque refresh token. Store it securely; it is rotated (replaced) on every refresh.',
    example: 'q8Zk3fJ0n2mX…',
  })
  refreshToken: string;

  @ApiProperty({
    description:
      'When this device session expires if unused (ISO 8601, UTC). Sliding: 30 days from the last refresh.',
    example: '2026-12-25T10:15:00.000Z',
  })
  refreshTokenExpiresAt: string;
}
