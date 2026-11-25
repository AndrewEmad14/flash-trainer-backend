import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DetailCode, ErrorCode } from '../errors/error-codes';

/** Swagger-only shapes describing the constitution §III.1 envelope. */
export class PaginationMetaDto {
  @ApiProperty({ description: 'Current page (1-based).', example: 1 })
  page: number;

  @ApiProperty({ description: 'Page size.', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total matching items.', example: 135 })
  totalItems: number;

  @ApiProperty({ description: 'Total pages.', example: 7 })
  totalPages: number;
}

export class MetaDto {
  @ApiProperty({
    description: 'Correlates the response with server logs. Same value as the X-Request-Id header.',
    example: 'a1b2c3d4-0000-4000-8000-000000000000',
  })
  requestId: string;

  @ApiProperty({
    description: 'Server time of the response (ISO 8601, UTC).',
    example: '2026-11-25T10:15:00.000Z',
  })
  timestamp: string;

  @ApiPropertyOptional({ description: 'Present on paginated lists only.', type: PaginationMetaDto })
  pagination?: PaginationMetaDto;
}

export class ErrorDetailDto {
  @ApiProperty({ description: 'Path of the offending field.', example: 'email' })
  field: string;

  @ApiProperty({
    description: 'Field-level code.',
    enum: DetailCode,
    example: DetailCode.FIELD_REQUIRED,
  })
  code: DetailCode;

  @ApiProperty({ description: 'Human-readable explanation.', example: 'email should not be empty' })
  message: string;
}

export class ErrorBodyDto {
  @ApiProperty({ description: 'Same as the HTTP status.', example: 404 })
  statusCode: number;

  @ApiProperty({
    description: 'Stable machine-readable code. The app MUST branch on this, not on `message`.',
    enum: ErrorCode,
    example: ErrorCode.SESSION_NOT_FOUND,
  })
  code: ErrorCode;

  @ApiProperty({
    description: 'English explanation (the app localises by `code`).',
    example: 'No session was found with this id.',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Field-level problems, when relevant.',
    type: [ErrorDetailDto],
  })
  details?: ErrorDetailDto[];
}

export class ErrorEnvelopeDto {
  @ApiProperty({ description: 'Always false for errors.', example: false })
  success: false;

  @ApiProperty({ description: 'What went wrong.', type: ErrorBodyDto })
  error: ErrorBodyDto;

  @ApiProperty({ description: 'Request metadata.', type: MetaDto })
  meta: MetaDto;
}
