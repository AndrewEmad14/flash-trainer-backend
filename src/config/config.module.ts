import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppConfigService } from './app-config.service';
import { validateEnv } from './env.validation';

/**
 * Loads `.env` (runtime environment variables take precedence), validates it at boot,
 * and exposes the typed {@link AppConfigService} everywhere.
 */
@Global()
@Module({
  imports: [ConfigModule.forRoot({ validate: validateEnv, cache: true })],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
