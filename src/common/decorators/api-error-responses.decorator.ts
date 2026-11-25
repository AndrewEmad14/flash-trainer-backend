import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse } from '@nestjs/swagger';
import { ErrorEnvelopeDto } from '../dto/envelope.dto';
import { DetailCode, ERROR_CATALOG, ErrorCode } from '../errors/error-codes';
import type { ErrorEnvelope } from '../http/envelope';

const EXAMPLE_META = {
  requestId: 'a1b2c3d4-0000-4000-8000-000000000000',
  timestamp: '2026-11-25T10:15:00.000Z',
};

const EXAMPLE_DETAILS: Partial<Record<ErrorCode, ErrorEnvelope['error']['details']>> = {
  VALIDATION_FAILED: [
    { field: 'email', code: DetailCode.FIELD_INVALID_FORMAT, message: 'email must be an email' },
  ],
  USER_IDENTITY_TAKEN: [
    {
      field: 'email',
      code: DetailCode.USER_EMAIL_TAKEN,
      message: 'This email is already registered.',
    },
  ],
};

/**
 * Builds the example error envelope for a catalogued code.
 *
 * @param code - The error code.
 * @returns A full example envelope using the catalog's status and message.
 */
export function errorEnvelopeExample(code: ErrorCode): ErrorEnvelope {
  const { httpStatus, defaultMessage } = ERROR_CATALOG[code];
  const details = EXAMPLE_DETAILS[code];
  return {
    success: false,
    error: {
      statusCode: httpStatus,
      code,
      message: defaultMessage,
      ...(details ? { details } : {}),
    },
    meta: EXAMPLE_META,
  };
}

/**
 * Documents every error an endpoint can return, with one example envelope per code,
 * grouped by HTTP status (constitution §IV: "every status, including each error").
 */
export function ApiErrorResponses(...codes: ErrorCode[]): MethodDecorator & ClassDecorator {
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = ERROR_CATALOG[code].httpStatus;
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  const responses = [...byStatus.entries()].map(([status, group]) =>
    ApiResponse({
      status,
      description: group.map((code) => `\`${code}\``).join(', '),
      type: ErrorEnvelopeDto,
      examples: Object.fromEntries(
        group.map((code) => [code, { summary: code, value: errorEnvelopeExample(code) }]),
      ),
    }),
  );
  return applyDecorators(ApiExtraModels(ErrorEnvelopeDto), ...responses);
}
