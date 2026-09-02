import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Per arquitectura.md §2, the API is versioned from the first real
  // endpoint: every controller route is served under /api/v1/...
  // Note: SwaggerModule.setup() below mounts its routes directly on the
  // underlying HTTP adapter rather than through Nest's controller-routing
  // pipeline, so this prefix never applies to it — /api-docs keeps working
  // unprefixed without needing an explicit exclude here.
  // /health is explicitly excluded: it's an infrastructure-level check
  // (Railway/Render gate deploys on it), not part of the versioned public
  // API contract, so it stays stable at /health across API version bumps.
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('AnotaYa API')
      .setDescription('API del backend de AnotaYa (server-app)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
