import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../config/app-config.service';
import { PrismaClient } from '../generated/prisma/client';

/**
 * The single Prisma client for the app (Prisma 7 + the `pg` driver adapter).
 * Only repositories may inject it (constitution §I).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  /** Opens the connection pool at startup so bad credentials fail fast. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Closes the pool on shutdown (requires `app.enableShutdownHooks()`). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
