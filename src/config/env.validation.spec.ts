import { MailDriver, NodeEnv, validateEnv } from './env.validation';

const ACCESS_SECRET = 'a'.repeat(40);
const EMAIL_SECRET = 'b'.repeat(40);

const validInput = (): Record<string, unknown> => ({
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: ACCESS_SECRET,
  JWT_EMAIL_SECRET: EMAIL_SECRET,
  APP_LINK_BASE_URL: 'http://10.0.2.2:3000/api/v1/links',
});

describe('validateEnv', () => {
  it('should apply defaults when only required variables are given', () => {
    const env = validateEnv(validInput());

    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.MAIL_DRIVER).toBe(MailDriver.Console);
    expect(env.APP_DEEP_LINK_SCHEME).toBe('flashtrainer');
    expect(env.SWAGGER_ENABLED).toBe(false);
    expect(env.EMAIL_DNS_CHECK).toBe(true);
  });

  it('should allow turning the email DNS check off', () => {
    expect(validateEnv({ ...validInput(), EMAIL_DNS_CHECK: 'false' }).EMAIL_DNS_CHECK).toBe(false);
  });

  it('should convert numeric and boolean strings when values come from .env', () => {
    const env = validateEnv({ ...validInput(), PORT: '4000', SWAGGER_ENABLED: 'true' });

    expect(env.PORT).toBe(4000);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('should list every invalid variable when several are wrong', () => {
    const input: Record<string, unknown> = {
      ...validInput(),
      DATABASE_URL: 'mysql://x',
      PORT: 'abc',
    };
    delete input.JWT_ACCESS_SECRET;

    expect(() => validateEnv(input)).toThrow(/DATABASE_URL[\s\S]*PORT|PORT[\s\S]*DATABASE_URL/);
    expect(() => validateEnv(input)).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('should reject secrets shorter than 32 characters', () => {
    expect(() => validateEnv({ ...validInput(), JWT_ACCESS_SECRET: 'short' })).toThrow(
      /JWT_ACCESS_SECRET: minLength/,
    );
  });

  it('should reject identical access and email secrets', () => {
    expect(() => validateEnv({ ...validInput(), JWT_EMAIL_SECRET: ACCESS_SECRET })).toThrow(
      /must differ/,
    );
  });

  it('should reject swagger in production', () => {
    expect(() =>
      validateEnv({ ...validInput(), NODE_ENV: 'production', SWAGGER_ENABLED: 'true' }),
    ).toThrow(/SWAGGER_ENABLED: must be false in production/);
  });

  it('should require SMTP settings only when MAIL_DRIVER is smtp', () => {
    expect(() => validateEnv({ ...validInput(), MAIL_DRIVER: 'smtp' })).toThrow(/SMTP_HOST/);

    const env = validateEnv({
      ...validInput(),
      MAIL_DRIVER: 'smtp',
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'me@gmail.com',
      SMTP_PASS: 'app-password',
    });
    expect(env.SMTP_PORT).toBe(465);
    expect(env.SMTP_SECURE).toBe(true);
  });

  it('should never include secret values in the error message', () => {
    const leaky = 'super-secret-value-that-is-too-short';
    let message = '';
    try {
      validateEnv({ ...validInput(), JWT_EMAIL_SECRET: ACCESS_SECRET, SMTP_PASS: leaky });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain(ACCESS_SECRET);
    expect(message).not.toContain(leaky);
  });

  it('should reject an invalid deep link scheme', () => {
    expect(() => validateEnv({ ...validInput(), APP_DEEP_LINK_SCHEME: 'Flash Trainer' })).toThrow(
      /APP_DEEP_LINK_SCHEME/,
    );
  });
});
