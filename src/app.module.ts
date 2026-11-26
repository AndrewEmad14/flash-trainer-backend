import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { LoggerModule } from './common/logging/logger.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { MailModule } from './modules/mail/mail.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

/** Global default: 100 requests per minute per IP (research R7). */
export const DEFAULT_THROTTLE = { name: 'default', ttl: 60_000, limit: 100 } as const;

/**
 * Root module. Guards run in order: rate limit first, then authentication
 * (every route is protected unless marked `@Public()`, §VII).
 */
@Module({
  imports: [
    AppConfigModule,
    LoggerModule,
    PrismaModule,
    ThrottlerModule.forRoot({ throttlers: [DEFAULT_THROTTLE] }),
    // Secrets are passed per call (access vs email-verification tokens use different secrets).
    JwtModule.register({ global: true }),
    // Scheduled jobs, e.g. the daily auth cleanup (research R16).
    ScheduleModule.forRoot(),
    HealthModule,
    MailModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
