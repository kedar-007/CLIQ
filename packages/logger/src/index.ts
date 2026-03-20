import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDevelopment = process.env.NODE_ENV !== 'production';

export const createLogger = (service: string) => {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    defaultMeta: { service },
    format: combine(
      errors({ stack: true }),
      timestamp(),
      isDevelopment
        ? combine(colorize(), simple())
        : json()
    ),
    transports: [
      new winston.transports.Console(),
    ],
  });
};

export const logger = createLogger('app');
export default logger;
