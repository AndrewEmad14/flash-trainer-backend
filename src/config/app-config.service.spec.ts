import { ConfigService } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { EnvironmentVariables, MailDriver, NodeEnv, validateEnv } from './env.validation';

const build = (overrides: Record<string, unknown> = {}): AppConfigService => {
  const env = validateEnv({
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_EMAIL_SECRET: 'b'.repeat(40),
    APP_LINK_BASE_URL: 'http://10.0.2.2:3000/api/v1/links/',
    ...overrides,
  });
  return new AppConfigService(new ConfigService<EnvironmentVariables, true>(env));
};

describe('AppConfigService', () => {
  it('should expose typed values with defaults applied', () => {
    const config = build();

    expect(config.nodeEnv).toBe(NodeEnv.Development);
    expect(config.isProduction).toBe(false);
    expect(config.port).toBe(3000);
    expect(config.databaseUrl).toBe('postgresql://u:p@localhost:5432/db');
    expect(config.logLevel).toBe('info');
    expect(config.refreshTokenTtlDays).toBe(30);
    expect(config.swaggerEnabled).toBe(false);
    expect(config.emailDnsCheckEnabled).toBe(true);
    expect(config.jwt).toEqual({
      accessSecret: 'a'.repeat(40),
      accessTtlSeconds: 900,
      emailSecret: 'b'.repeat(40),
    });
  });

  it('should strip trailing slashes from the link base URL', () => {
    expect(build().links).toEqual({
      baseUrl: 'http://10.0.2.2:3000/api/v1/links',
      deepLinkScheme: 'flashtrainer',
    });
  });

  it('should parse CORS origins from a comma-separated list', () => {
    expect(build({ CORS_ORIGINS: ' http://a.test , ,http://b.test' }).corsOrigins).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });

  it('should return no SMTP settings when the console mail driver is used', () => {
    expect(build().mail).toEqual({
      driver: MailDriver.Console,
      from: 'Flash Trainer <no-reply@flash-trainer.local>',
      smtp: null,
    });
  });

  it('should return SMTP settings when the smtp driver is used', () => {
    const config = build({
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'me@gmail.com',
      SMTP_PASS: 'pw',
      MAIL_FROM: 'Me <me@gmail.com>',
      NODE_ENV: 'production',
    });

    expect(config.isProduction).toBe(true);
    expect(config.mail).toEqual({
      driver: MailDriver.Smtp,
      from: 'Me <me@gmail.com>',
      smtp: { host: 'smtp.gmail.com', port: 465, secure: true, user: 'me@gmail.com', pass: 'pw' },
    });
  });
});
