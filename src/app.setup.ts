import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validationExceptionFactory } from './common/pipes/validation-exception.factory';
import { AppConfigService } from './config/app-config.service';

/** Every JSON API route lives under this prefix (constitution §III.5). */
export const API_PREFIX = 'api/v1';

/**
 * Applies the cross-cutting HTTP setup the constitution requires. Shared by `main.ts`,
 * the e2e tests and the OpenAPI script, so all three behave the same.
 *
 * @param app - The Nest application, before `listen()`/`init()`.
 */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get(AppConfigService);

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix(API_PREFIX);
  // Swagger UI needs inline scripts. It is only ever enabled outside production (validateEnv).
  app.use(helmet({ contentSecurityPolicy: config.swaggerEnabled ? false : undefined }));
  app.enableCors({ origin: config.corsOrigins.length > 0 ? config.corsOrigins : false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
}
