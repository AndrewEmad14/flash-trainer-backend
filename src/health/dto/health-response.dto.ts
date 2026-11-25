import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    description: 'Overall status.',
    example: 'ok',
    enum: ['ok', 'error', 'shutting_down'],
  })
  status: string;

  @ApiProperty({
    description: 'Indicators that are up.',
    example: { database: { status: 'up' } },
    type: 'object',
    additionalProperties: true,
  })
  info: Record<string, unknown>;
}
