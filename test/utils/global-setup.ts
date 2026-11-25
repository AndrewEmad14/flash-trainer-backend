import { execSync } from 'node:child_process';
import { loadTestEnv } from './load-test-env';

/** Applies all migrations to the e2e test database once, before any test file runs. */
export default function globalSetup(): void {
  loadTestEnv();
  execSync('pnpm prisma migrate deploy', { stdio: 'inherit', env: process.env });
}
