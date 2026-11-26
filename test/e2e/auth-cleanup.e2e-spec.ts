import type { NestExpressApplication } from '@nestjs/platform-express';
import { AuthCleanupTask } from '../../src/modules/auth/cleanup/auth-cleanup.task';
import { PrismaService } from '../../src/prisma/prisma.service';
import { registerAndLogin } from '../utils/auth';
import { createTestApp, resetThrottling } from '../utils/create-test-app';
import { truncateAll } from '../utils/db';

const DAY = 24 * 60 * 60_000;
const ago = (ms: number): Date => new Date(Date.now() - ms);

describe('Daily auth cleanup against the real database (R16)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await truncateAll(app);
    resetThrottling(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should delete exactly the dead rows and keep everything still usable', async () => {
    const { user } = await registerAndLogin(app);
    const userId = user.id;
    const session = (refreshTokenHash: string, data: object) =>
      prisma.authSession.create({
        data: { userId, refreshTokenHash, expiresAt: new Date(Date.now() + DAY), ...data },
      });
    await session('a'.repeat(64), { expiresAt: ago(31 * DAY) }); // expired long ago: delete
    await session('b'.repeat(64), { revokedAt: ago(31 * DAY) }); // revoked long ago: delete
    await session('c'.repeat(64), { revokedAt: ago(2 * DAY) }); // revoked recently: keep
    await prisma.passwordReset.createMany({
      data: [
        { userId, tokenHash: 'd'.repeat(64), createdAt: ago(2 * DAY), expiresAt: ago(2 * DAY) },
        { userId, tokenHash: 'e'.repeat(64), expiresAt: new Date(Date.now() + 3_600_000) },
      ],
    });
    await prisma.emailDispatch.create({
      data: { userId, type: 'VERIFY_EMAIL', createdAt: ago(2 * DAY) },
    });
    await prisma.loginAttempt.createMany({
      data: [
        { throttleKey: 'ident:old', failedCount: 2, windowStartedAt: ago(60 * 60_000) },
        {
          throttleKey: 'ident:locked',
          failedCount: 5,
          windowStartedAt: ago(20 * 60_000),
          lockedUntil: new Date(Date.now() + 5 * 60_000),
        },
        { throttleKey: 'ident:fresh', failedCount: 1, windowStartedAt: new Date() },
      ],
    });

    const counts = await app.get(AuthCleanupTask).run();

    expect(counts).toEqual({
      sessions: 2,
      passwordResets: 1,
      emailDispatches: 1,
      loginAttempts: 1,
    });
    expect(await prisma.authSession.count({ where: { userId } })).toBe(2);
    expect(await prisma.passwordReset.count({ where: { userId } })).toBe(1);
    expect(await prisma.emailDispatch.count({ where: { userId } })).toBe(1);
    expect((await prisma.loginAttempt.findMany()).map((row) => row.throttleKey).sort()).toEqual([
      'ident:fresh',
      'ident:locked',
    ]);
  });
});
