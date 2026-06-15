import { ConfigService } from '@nestjs/config';
import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

const prettyFormat = winston.format.printf(
  ({ level, timestamp, requestId, fn, data, message }) => {
    const dataStr =
      data && typeof data === 'object' && Object.keys(data).length > 0
        ? ` ${JSON.stringify(data)}`
        : message
          ? ` ${String(message)}`
          : '';
    return `${level} ${timestamp} ${requestId ?? '-'} ${fn ?? '-'}${dataStr}`;
  },
);

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format((info) => {
    info.requestId = info.requestId ?? 'system';
    return info;
  })(),
  winston.format.json(),
);

export function createWinstonConfig(
  configService: ConfigService,
): WinstonModuleOptions {
  const level = configService.get<string>('log.level') ?? 'info';
  const format = configService.get<string>('log.format') ?? 'pretty';

  return {
    level,
    transports: [
      new winston.transports.Console({
        format:
          format === 'json'
            ? jsonFormat
            : winston.format.combine(
                winston.format.timestamp(),
                winston.format((info) => {
                  info.requestId = info.requestId ?? 'system';
                  return info;
                })(),
                prettyFormat,
              ),
      }),
    ],
  };
}
