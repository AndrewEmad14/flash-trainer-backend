import { Module } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { AppConfigService } from '../../config/app-config.service';
import { NodeEnv } from '../../config/env.validation';
import { redactUrl, REDACTED_PATHS, resolveRequestId } from './redaction';

/**
 * Optional log destination. `null` (the default) means stdout. Tests override it with a
 * capturing stream, so they can assert on real log output without patching Node internals.
 */
export const LOG_DESTINATION = Symbol('LOG_DESTINATION');

/**
 * Structured request logging with pino: JSON in production, pretty in development.
 * Every request gets an ID (`X-Request-Id`), and secrets are redacted.
 */
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      providers: [{ provide: LOG_DESTINATION, useValue: null }],
      inject: [AppConfigService, LOG_DESTINATION],
      useFactory: (config: AppConfigService, destination: DestinationStream | null) => {
        const options = {
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
            if (error || res.statusCode >= 500) return 'error' as const;
            if (res.statusCode >= 400) return 'warn' as const;
            return 'info' as const;
          },
          transport:
            config.nodeEnv === NodeEnv.Development && !destination
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        };
        return { pinoHttp: destination ? [options, destination] : options };
      },
    }),
  ],
})
export class LoggerModule {}
