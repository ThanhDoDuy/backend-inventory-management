import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';
import { createWinstonConfig } from './winston.config';

@Global()
@Module({
  imports: [
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        createWinstonConfig(configService),
    }),
  ],
  providers: [RequestContextService, AppLoggerService],
  exports: [RequestContextService, AppLoggerService],
})
export class LoggerModule {}
