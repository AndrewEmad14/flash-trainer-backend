import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-codes';
import { ApiEnvelopeResponse, successEnvelopeSchema } from './api-envelope-response.decorator';
import { ApiErrorResponses, errorEnvelopeExample } from './api-error-responses.decorator';

class ThingDto {
  @ApiProperty({ description: 'Id.', example: 'x' })
  id: string;
}

@Controller()
class SampleController {
  @Get()
  @ApiEnvelopeResponse(ThingDto, { status: HttpStatus.CREATED })
  @ApiErrorResponses(
    ErrorCode.VALIDATION_FAILED,
    ErrorCode.AUTH_TOKEN_MISSING,
    ErrorCode.AUTH_TOKEN_EXPIRED,
  )
  create(): void {
    /* no-op */
  }
}

/** Metadata key used by @nestjs/swagger for @ApiResponse (not exported from the package root). */
const API_RESPONSE_KEY = 'swagger/apiResponse';

type Responses = Record<string, { examples?: Record<string, { value: unknown }> }>;

describe('API doc decorators', () => {
  const responses = Reflect.getMetadata(
    API_RESPONSE_KEY,
    SampleController.prototype.create,
  ) as Responses;

  it('should document the success envelope at the given status', () => {
    expect(Object.keys(responses)).toEqual(expect.arrayContaining(['201', '400', '401']));
  });

  it('should group error codes by status with one example per code', () => {
    expect(Object.keys(responses['401']?.examples ?? {})).toEqual([
      'AUTH_TOKEN_MISSING',
      'AUTH_TOKEN_EXPIRED',
    ]);
  });

  it('should build example envelopes from the catalog', () => {
    expect(errorEnvelopeExample(ErrorCode.SESSION_NOT_FOUND)).toEqual({
      success: false,
      error: {
        statusCode: 404,
        code: 'SESSION_NOT_FOUND',
        message: 'No session was found with this id.',
      },
      meta: expect.objectContaining({ requestId: expect.any(String) }),
    });
    expect(errorEnvelopeExample(ErrorCode.VALIDATION_FAILED).error.details).toHaveLength(1);
  });

  it('should document null data and arrays', () => {
    expect(successEnvelopeSchema(null).properties?.data).toMatchObject({ nullable: true });
    expect(successEnvelopeSchema(ThingDto, true).properties?.data).toMatchObject({
      type: 'array',
    });
  });
});
