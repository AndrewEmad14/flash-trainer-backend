import { Controller, Get, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { AppModule } from '../../src/app.module';
import { setupApp } from '../../src/app.setup';
import { CurrentUser } from '../../src/common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../src/common/http/authenticated-request';

/**
 * Test-only protected route (`GET /api/v1/test/protected`). It lets e2e tests exercise the
 * global JWT guard before any real protected endpoint exists. It is never part of the app.
 */
@Controller('test')
export class TestProtectedController {
  @Get('protected')
  whoAmI(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}

/** Replaces an app provider with a test double. */
export interface ProviderOverride {
  provide: string | symbol | Type;
  useValue: unknown;
}

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
 * Pass `controllers: [TestProtectedController]` to get a protected route for guard tests, and
 * `providers` to replace app providers with test doubles (e.g. a fake DNS resolver).
 */
export async function createTestApp(
  options: { controllers?: Type[]; providers?: ProviderOverride[] } = {},
): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: options.controllers ?? [],
  })
    .overrideProvider(ThrottlerStorage)
    .useValue(new ResettableThrottlerStorage());
  for (const override of options.providers ?? []) {
    builder = builder.overrideProvider(override.provide).useValue(override.useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  setupApp(app);
  await app.init();
  return app;
}

/** Clears rate-limit counters so tests don't throttle each other. */
export function resetThrottling(app: NestExpressApplication): void {
  app.get<ResettableThrottlerStorage>(ThrottlerStorage).reset();
}
