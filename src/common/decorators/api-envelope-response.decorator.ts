import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiResponse,
  getSchemaPath,
  type ReferenceObject,
  type SchemaObject,
} from '@nestjs/swagger';
import { MetaDto } from '../dto/envelope.dto';

export interface ApiEnvelopeResponseOptions {
  status?: HttpStatus;
  description?: string;
  isArray?: boolean;
}

/**
 * Builds the OpenAPI schema of a success envelope around `model`.
 * A `null` model documents `data: null`, used by endpoints that return nothing.
 *
 * @param model - The DTO class in `data`, or `null`.
 * @param isArray - Whether `data` is an array of `model`.
 * @returns The envelope schema.
 */
export function successEnvelopeSchema(model: Type<unknown> | null, isArray = false): SchemaObject {
  let data: SchemaObject | ReferenceObject;
  if (model === null) {
    data = { type: 'object', nullable: true, example: null, description: 'Always null.' };
  } else if (isArray) {
    data = { type: 'array', items: { $ref: getSchemaPath(model) } };
  } else {
    data = { $ref: getSchemaPath(model) };
  }
  return {
    type: 'object',
    required: ['success', 'data', 'meta'],
    properties: {
      success: { type: 'boolean', example: true },
      data,
      meta: { $ref: getSchemaPath(MetaDto) },
    },
  };
}

/**
 * Documents a successful response wrapped in the envelope (constitution §IV), so Swagger
 * shows exactly what the client receives.
 */
export function ApiEnvelopeResponse(
  model: Type<unknown> | null,
  options: ApiEnvelopeResponseOptions = {},
): MethodDecorator & ClassDecorator {
  const models = model ? [MetaDto, model] : [MetaDto];
  return applyDecorators(
    ApiExtraModels(...models),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Success.',
      schema: successEnvelopeSchema(model, options.isArray),
    }),
  );
}
