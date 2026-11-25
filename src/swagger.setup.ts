import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { ERROR_CATALOG, ErrorCode } from './common/errors/error-codes';
import { AppConfigService } from './config/app-config.service';

const DESCRIPTION = `REST API for the Flash Trainer mobile app.

**Every JSON response uses one envelope.** On success: \`{ success: true, data, meta }\`.
On error: \`{ success: false, error: { statusCode, code, message, details? }, meta }\`.
Branch on \`error.code\`, never on \`message\`. \`meta.requestId\` matches the \`X-Request-Id\` header.

**Auth.** Send \`Authorization: Bearer <accessToken>\`. On \`AUTH_TOKEN_EXPIRED\`, call
\`POST /api/v1/auth/refresh\` once (one refresh in flight at a time), then retry the request.
Any other 401 means: clear the stored tokens and show the sign-in screen.`;

/** Markdown table of every error code, generated from the catalog (constitution §IV). */
export function errorCatalogMarkdown(): string {
  const rows = Object.values(ErrorCode).map((code) => {
    const { httpStatus, defaultMessage } = ERROR_CATALOG[code];
    return `| \`${code}\` | ${httpStatus} | ${defaultMessage} |`;
  });
  return ['## Error codes', '', '| Code | HTTP | Message |', '|---|---|---|', ...rows].join('\n');
}

/**
 * Builds the OpenAPI document from the controllers' decorators.
 *
 * @param app - The Nest application.
 * @returns The OpenAPI 3 document.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Flash Trainer API')
    .setDescription(`${DESCRIPTION}\n\n${errorCatalogMarkdown()}`)
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

/**
 * Serves Swagger UI at `/docs` when `SWAGGER_ENABLED=true`. It is never enabled in
 * production; `validateEnv` refuses that combination.
 *
 * @param app - The Nest application.
 */
export function setupSwagger(app: INestApplication): void {
  if (!app.get(AppConfigService).swaggerEnabled) return;
  SwaggerModule.setup('docs', app, () => buildOpenApiDocument(app), {
    swaggerOptions: { persistAuthorization: true },
  });
}
