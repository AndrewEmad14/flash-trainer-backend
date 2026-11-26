import type { NestExpressApplication } from '@nestjs/platform-express';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ErrorCode } from '../../src/common/errors/error-codes';
import { buildOpenApiDocument } from '../../src/swagger.setup';
import { createTestApp } from '../utils/create-test-app';
import { ENDPOINTS, toOpenApiPath } from '../utils/endpoints';

interface Operation {
  summary?: string;
  description?: string;
  security?: unknown[];
  responses: Record<string, Response>;
}
interface Response {
  content?: Record<string, { examples?: Record<string, { value: unknown }> }>;
}
interface SchemaProperty {
  description?: string;
  example?: unknown;
  $ref?: string;
  allOf?: unknown[];
  type?: string;
  items?: { $ref?: string };
}

const HTML_OPERATIONS = ['get /links/{type}'];

/**
 * Constitution §IV: Swagger is the Flutter developer's contract, so it must be complete enough
 * to work from without reading the backend code.
 */
describe('OpenAPI document completeness (T119)', () => {
  let app: NestExpressApplication;
  let document: OpenAPIObject;
  const operations: [string, Operation][] = [];

  beforeAll(async () => {
    app = await createTestApp();
    document = buildOpenApiDocument(app);
    for (const [path, methods] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, Operation>)) {
        operations.push([`${method} ${path.replace(/^\/api\/v1/, '')}`, operation]);
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('should document every operation with a summary, a description and a 2xx response', () => {
    const problems = operations.flatMap(([key, op]) => [
      ...(op.summary?.trim() ? [] : [`${key}: missing summary`]),
      ...(op.description?.trim() ? [] : [`${key}: missing description`]),
      ...(Object.keys(op.responses).some((status) => status.startsWith('2'))
        ? []
        : [`${key}: no 2xx response`]),
    ]);

    expect(problems).toEqual([]);
  });

  it('should declare bearer auth on exactly the protected endpoints', () => {
    const problems = ENDPOINTS.flatMap((endpoint) => {
      const op = operations.find(
        ([key]) => key === `${endpoint.method} ${toOpenApiPath(endpoint.path)}`,
      )?.[1];
      const secured = (op?.security?.length ?? 0) > 0;
      return secured === !endpoint.isPublic
        ? []
        : [`${endpoint.method} ${endpoint.path}: secured=${String(secured)}`];
    });

    expect(problems).toEqual([]);
  });

  it('should show a catalogued example envelope for every documented JSON error', () => {
    const catalogued = new Set<string>(Object.values(ErrorCode));
    const problems = operations
      .filter(([key]) => !HTML_OPERATIONS.includes(key))
      .flatMap(([key, op]) =>
        Object.entries(op.responses)
          .filter(([status]) => Number(status) >= 400)
          .flatMap(([status, response]) => {
            const examples = Object.values(response.content?.['application/json']?.examples ?? {});
            if (examples.length === 0) return [`${key} ${status}: no example`];
            return examples.flatMap((example) => {
              const error = (example.value as { error?: { code?: string; statusCode?: number } })
                .error;
              if (!error?.code || !catalogued.has(error.code)) {
                return [`${key} ${status}: uncatalogued code ${String(error?.code)}`];
              }
              return error.statusCode === Number(status)
                ? []
                : [`${key} ${status}: example statusCode ${String(error.statusCode)}`];
            });
          }),
      );

    expect(problems).toEqual([]);
  });

  it('should give every schema property a description, and an example unless it is a nested model', () => {
    const schemas = (document.components?.schemas ?? {}) as Record<
      string,
      { properties?: Record<string, SchemaProperty> }
    >;
    const problems = Object.entries(schemas).flatMap(([name, schema]) =>
      Object.entries(schema.properties ?? {}).flatMap(([prop, def]) => {
        const nested = Boolean(def.$ref ?? def.allOf ?? def.items?.$ref);
        return [
          ...(def.description?.trim() ? [] : [`${name}.${prop}: missing description`]),
          ...(nested || def.example !== undefined ? [] : [`${name}.${prop}: missing example`]),
        ];
      }),
    );

    expect(problems).toEqual([]);
  });
});
