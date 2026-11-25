import type { NestExpressApplication } from '@nestjs/platform-express';
import { PrismaService } from '../../src/prisma/prisma.service';

/** Empties every table of the 001 schema. Call in `beforeEach` for isolated tests. */
export async function truncateAll(app: NestExpressApplication): Promise<void> {
  await app
    .get(PrismaService)
    .$executeRawUnsafe(
      'TRUNCATE TABLE users, auth_sessions, password_resets, email_dispatches, login_attempts CASCADE',
    );
}
