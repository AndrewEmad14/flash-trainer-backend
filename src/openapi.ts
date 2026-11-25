/**
 * Writes openapi.json from the controllers' decorators (CI job 8, "Boot & OpenAPI check").
 * Exits non-zero if the document can't be generated.
 */
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';
import { buildOpenApiDocument } from './swagger.setup';

async function main(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
  setupApp(app);
  const document = buildOpenApiDocument(app);
  writeFileSync('openapi.json', `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  process.stdout.write(`openapi.json written (${Object.keys(document.paths).length} paths)\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`OpenAPI generation failed: ${String(error)}\n`);
  process.exit(1);
});
