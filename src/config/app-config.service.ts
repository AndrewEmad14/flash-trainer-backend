import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, LogLevel, MailDriver, NodeEnv } from './env.validation';

export interface JwtSettings {
  accessSecret: string;
  accessTtlSeconds: number;
  emailSecret: string;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface MailSettings {
  driver: MailDriver;
  from: string;
  smtp: SmtpSettings | null;
}

export interface LinkSettings {
  baseUrl: string;
  deepLinkScheme: string;
}

/**
 * Typed, read-only access to the validated configuration. Inject this instead of
 * reading `process.env` directly.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  /** The running environment (development, test or production). */
  get nodeEnv(): NodeEnv {
    return this.get('NODE_ENV');
  }

  /** True when running with `NODE_ENV=production`. */
  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.Production;
  }

  /** HTTP port the API listens on. */
  get port(): number {
    return this.get('PORT');
  }

  /** PostgreSQL connection string. */
  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  /** Minimum pino log level. */
  get logLevel(): LogLevel {
    return this.get('LOG_LEVEL');
  }

  /** JWT secrets and the access-token lifetime (research R1, R3). */
  get jwt(): JwtSettings {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      accessTtlSeconds: this.get('JWT_ACCESS_TTL'),
      emailSecret: this.get('JWT_EMAIL_SECRET'),
    };
  }

  /** Sliding refresh-token / session lifetime in days (FR-012). */
  get refreshTokenTtlDays(): number {
    return this.get('REFRESH_TOKEN_TTL_DAYS');
  }

  /** Base URL used in email links, and the app's deep-link scheme (research R3). */
  get links(): LinkSettings {
    return {
      baseUrl: this.get('APP_LINK_BASE_URL').replace(/\/+$/, ''),
      deepLinkScheme: this.get('APP_DEEP_LINK_SCHEME'),
    };
  }

  /** Mail driver, sender and (for `smtp`) the SMTP connection settings (research R12). */
  get mail(): MailSettings {
    const driver = this.get('MAIL_DRIVER');
    const smtp: SmtpSettings | null =
      driver === MailDriver.Smtp
        ? {
            host: this.get('SMTP_HOST') ?? '',
            port: this.get('SMTP_PORT') ?? 465,
            secure: this.get('SMTP_SECURE') ?? true,
            user: this.get('SMTP_USER') ?? '',
            pass: this.get('SMTP_PASS') ?? '',
          }
        : null;
    return { driver, from: this.get('MAIL_FROM'), smtp };
  }

  /** Allowed CORS origins, parsed from the comma-separated `CORS_ORIGINS`. */
  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  /** Whether registration checks that the email's domain can receive mail (R18). */
  get emailDnsCheckEnabled(): boolean {
    return this.get('EMAIL_DNS_CHECK');
  }

  /** Whether Swagger UI is served at `/docs` (never in production; see validateEnv). */
  get swaggerEnabled(): boolean {
    return this.get('SWAGGER_ENABLED');
  }
}
