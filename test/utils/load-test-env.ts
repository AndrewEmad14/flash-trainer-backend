import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `.env` (if present) and points the app at the e2e test database. The same values
 * are used by the global setup (migrations) and by every test file.
 */
export function loadTestEnv(): void {
  const envFile = resolve(__dirname, '../../.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  process.env.NODE_ENV = 'test';
  process.env.MAIL_DRIVER = 'console';
  process.env.SWAGGER_ENABLED = 'true';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL_TEST ?? 'silent';
  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}
