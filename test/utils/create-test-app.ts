import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';

type IncrementArgs = Parameters<ThrottlerStorageService['increment']>;

/**
 * The real in-memory throttler storage behind a wrapper that can be swapped for a fresh one.
 * The package counts hits in private state, so resetting means replacing the instance.
 * Rate limiting itself behaves exactly as in production.
 */
export class ResettableThrottlerStorage implements ThrottlerStorage {
  private inner = new ThrottlerStorageService();

  increment(...args: IncrementArgs): ReturnType<ThrottlerStorageService['increment']> {
    return this.inner.increment(...args);
  }

  /** Forgets every counter and block. */
  reset(): void {
    this.inner.onApplicationShutdown();
    this.inner = new ThrottlerStorageService();
  }

  onApplicationShutdown(): void {
    this.inner.onApplicationShutdown();
  }
}

/**
 * Boots the full app exactly like `main.ts` (same pipes, filter, interceptor and guards),
 * against the test database and the console mailer (see load-test-env.ts).
 */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ThrottlerStorage)
    .useValue(new ResettableThrottlerStorage())
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return app;
}

/** Clears rate-limit counters so tests don't throttle each other. */
export function resetThrottling(app: NestExpressApplication): void {
  app.get<ResettableThrottlerStorage>(ThrottlerStorage).reset();
}
