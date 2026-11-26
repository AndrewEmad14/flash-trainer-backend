import { ApiProperty } from '@nestjs/swagger';

/** Public view of an account (contracts/auth-api.md "UserResponse"). Never contains secrets. */
export class UserResponseDto {
  @ApiProperty({
    description: 'Account id (UUID).',
    example: '6f1c2b1e-8a4d-4c3e-9f1a-2b3c4d5e6f70',
  })
  id: string;

  @ApiProperty({ description: 'Display name.', example: 'Ahmed Ali' })
  fullName: string;

  @ApiProperty({ description: 'Unique handle, shown as typed.', example: 'Ahmed_A' })
  username: string;

  @ApiProperty({ description: 'Lowercased email address.', example: 'ahmed@mail.com' })
  email: string;

  @ApiProperty({ description: 'Whether the email address has been verified.', example: false })
  isEmailVerified: boolean;

  @ApiProperty({
    description: 'Phone in E.164 format, or null when not set.',
    example: null,
    nullable: true,
    type: String,
  })
  phone: string | null;

  @ApiProperty({
    description: 'When the account was created (ISO 8601, UTC).',
    example: '2026-11-25T10:15:00.000Z',
  })
  createdAt: string;
}
