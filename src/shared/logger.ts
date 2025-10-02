import { createLogger, format, transports } from 'winston';

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const logger = createLogger({
  level,
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'stripe-chargeback-autopilot',
  },
  transports: [
    new transports.Console({
      handleExceptions: true,
    }),
  ],
});

export const childLogger = (meta: Record<string, unknown>) => logger.child(meta);

export default logger;
