import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { AppModule } from './app.module';
import { isCorsOriginAllowed, LOCAL_CORS_ORIGINS } from './config/cors.util';
import { AppError, ERRORS } from './shared/errors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);

  const configService = app.get(ConfigService);
  const corsOrigins = configService.get<string[]>('corsOrigins') ?? LOCAL_CORS_ORIGINS;
  const nodeEnv = configService.get<string>('nodeEnv');

  if (nodeEnv === 'production' && corsOrigins.every((o) => o.includes('localhost'))) {
    logger.warn(
      'CORS_ORIGIN is not set for production — browser clients on Vercel will be blocked. ' +
        'Set CORS_ORIGIN=https://inventory-pos-saas-rho.vercel.app/ on the API host.',
    );
  }

  logger.log(`CORS allowed origins: ${corsOrigins.join(', ')}`);

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: (requestOrigin, callback) => {
      callback(null, isCorsOriginAllowed(requestOrigin, corsOrigins));
    },
    credentials: true,
    exposedHeaders: ['x-request-id'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new AppError(ERRORS.COMMON.VALIDATION_FAILED, { details: errors }),
    }),
  );

  const port = configService.get<number>('port')!;
  await app.listen(port);
}
bootstrap();
