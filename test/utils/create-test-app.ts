import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';

/**
 * Boots the full app exactly like `main.ts` (same pipes, filter, interceptor and guards),
 * against the test database and the console mailer (see load-test-env.ts).
 */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return app;
}

/** Clears rate-limit counters so tests don't throttle each other. */
export function resetThrottling(app: NestExpressApplication): void {
  const storage = app.get<unknown>(ThrottlerStorage);
  if (storage instanceof ThrottlerStorageService) {
    storage.storage.clear();
  }
}
