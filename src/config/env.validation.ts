import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export enum MailDriver {
  Console = 'console',
  Smtp = 'smtp',
}

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const MIN_SECRET_LENGTH = 32;

const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() !== '' ? Number(value) : value;

const toBool = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

const isSmtp = (env: EnvironmentVariables): boolean => env.MAIL_DRIVER === MailDriver.Smtp;

/**
 * Every environment variable the app reads, with its validation rules.
 * The app refuses to start when any rule fails (constitution §VII: fail fast on bad config).
 */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: LogLevel = 'info';

  @Matches(/^postgres(ql)?:\/\/.+/, { message: 'DATABASE_URL must be a postgres:// URL' })
  DATABASE_URL: string;

  @IsOptional()
  @Matches(/^postgres(ql)?:\/\/.+/, { message: 'TEST_DATABASE_URL must be a postgres:// URL' })
  TEST_DATABASE_URL?: string;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH)
  JWT_ACCESS_SECRET: string;

  @Transform(toInt)
  @IsInt()
  @Min(5)
  @Max(86400)
  JWT_ACCESS_TTL = 900;

  @IsString()
  @MinLength(MIN_SECRET_LENGTH)
  JWT_EMAIL_SECRET: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(365)
  REFRESH_TOKEN_TTL_DAYS = 30;

  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  APP_LINK_BASE_URL: string;

  @Matches(/^[a-z][a-z0-9+.-]*$/, {
    message: 'APP_DEEP_LINK_SCHEME must be a lowercase URL scheme',
  })
  APP_DEEP_LINK_SCHEME = 'flashtrainer';

  @IsEnum(MailDriver)
  MAIL_DRIVER: MailDriver = MailDriver.Console;

  @ValidateIf(isSmtp)
  @IsString()
  @MinLength(1)
  SMTP_HOST?: string;

  @ValidateIf(isSmtp)
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT?: number;

  @ValidateIf(isSmtp)
  @Transform(toBool)
  @IsBoolean()
  SMTP_SECURE?: boolean;

  @ValidateIf(isSmtp)
  @IsString()
  @MinLength(1)
  SMTP_USER?: string;

  @ValidateIf(isSmtp)
  @IsString()
  @MinLength(1)
  SMTP_PASS?: string;

  @IsString()
  @MinLength(3)
  MAIL_FROM = 'Flash Trainer <no-reply@flash-trainer.local>';

  @IsString()
  CORS_ORIGINS = '';

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = false;

  /** Reject registration emails whose domain can't receive mail (research R18). */
  @Transform(toBool)
  @IsBoolean()
  EMAIL_DNS_CHECK = true;
}

/**
 * Validates and normalises `process.env`-style input. Used as `ConfigModule.forRoot({ validate })`.
 *
 * Error messages name the failing variables and rules but never echo their values,
 * so secrets can't leak into logs.
 *
 * @param config - Raw key/value pairs (from `process.env` and `.env`).
 * @returns The typed, defaulted configuration.
 * @throws Error listing every invalid variable when validation fails.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(env, { skipMissingProperties: false, whitelist: false });
  const problems = errors.map(
    (error) => `${error.property}: ${Object.keys(error.constraints ?? {}).join(', ')}`,
  );

  if (env.JWT_ACCESS_SECRET && env.JWT_ACCESS_SECRET === env.JWT_EMAIL_SECRET) {
    problems.push('JWT_EMAIL_SECRET: must differ from JWT_ACCESS_SECRET');
  }
  if (env.NODE_ENV === NodeEnv.Production && env.SWAGGER_ENABLED) {
    problems.push('SWAGGER_ENABLED: must be false in production (constitution §IV)');
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }
  return env;
}
