import { Module } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { AppConfigService } from '../../config/app-config.service';
import { NodeEnv } from '../../config/env.validation';
import { redactUrl, REDACTED_PATHS, resolveRequestId } from './redaction';

/**
 * Structured request logging with pino: JSON in production, pretty in development.
 * Every request gets an ID (`X-Request-Id`), and secrets are redacted.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        pinoHttp: {
          level: config.logLevel,
          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = resolveRequestId(req.headers['x-request-id']);
            res.setHeader('X-Request-Id', id);
            return id;
          },
          redact: { paths: [...REDACTED_PATHS], censor: '[REDACTED]' },
          serializers: {
            req: (req: { id: unknown; method: string; url: string }) => ({
              id: req.id,
              method: req.method,
              url: redactUrl(req.url),
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
          customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) => {
            if (error || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'info';
          },
          transport:
            config.nodeEnv === NodeEnv.Development
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
})
export class LoggerModule {}
