import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { AppConfigService } from './config/app-config.service';
import { setupSwagger } from './swagger.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  setupApp(app);
  setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(app.get(AppConfigService).port);
}
void bootstrap();
