import { ApiProperty } from '@nestjs/swagger';

/** One signed-in device (contracts/auth-api.md "SessionResponse"). No secrets. */
export class SessionResponseDto {
  @ApiProperty({
    description: 'Session id. Pass it to DELETE /auth/sessions/{sessionId}.',
    example: 'b2d4f6a8-1c3e-4a5b-9d7f-0e2c4a6b8d10',
  })
  id: string;

  @ApiProperty({
    description: 'Device name given at sign-in, or null.',
    example: "Ahmed's iPhone",
    nullable: true,
    type: String,
  })
  deviceName: string | null;

  @ApiProperty({
    description: 'Device OS given at sign-in, or null.',
    example: 'iOS 19.1',
    nullable: true,
    type: String,
  })
  deviceOs: string | null;

  @ApiProperty({
    description: 'When this device signed in (ISO 8601, UTC).',
    example: '2026-11-01T08:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last refresh by this device (ISO 8601, UTC); accurate to about 15 minutes.',
    example: '2026-11-25T10:00:00.000Z',
  })
  lastUsedAt: string;

  @ApiProperty({ description: 'True for the device making this request.', example: true })
  isCurrent: boolean;
}
