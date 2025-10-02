import { createLogger, format, transports, Logger } from 'winston';
import util from 'util';

const DEFAULT_SERVICE_NAME = process.env.LOG_SERVICE_NAME || 'stripe-chargeback-autopilot';
const DEFAULT_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

const flattenMetadata = format((info) => {
  if (info.metadata && typeof info.metadata === 'object') {
    Object.assign(info, info.metadata);
    delete info.metadata;
  }
  return info;
});

const baseLogger = createLogger({
  level: DEFAULT_LEVEL,
  defaultMeta: { service: DEFAULT_SERVICE_NAME },
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.metadata({ fillExcept: ['level', 'message', 'timestamp', 'service'] }),
    flattenMetadata(),
    format.json()
  ),
  transports: [
    new transports.Console({ handleExceptions: true })
  ],
  exitOnError: false
});

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

const consoleLevelMap: Record<ConsoleMethod, string> = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug'
};

function getCallSite(): { file?: string; line?: number; column?: number } | undefined {
  const stack = new Error().stack;
  if (!stack) {
    return undefined;
  }

  const frames = stack.split('\n').slice(3);
  for (const frame of frames) {
    const cleaned = frame.trim();
    if (!cleaned || cleaned.includes('shared/logger')) {
      continue;
    }

    const match = cleaned.match(/\(?([^():]+):(\d+):(\d+)\)?$/);
    if (match) {
      return {
        file: match[1],
        line: Number.parseInt(match[2], 10),
        column: Number.parseInt(match[3], 10)
      };
    }
  }

  return undefined;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialized: Record<string, unknown> = {
      message: error.message,
      name: error.name,
      stack: error.stack
    };

    const props = Object.getOwnPropertyNames(error);
    for (const key of props) {
      if (!(key in serialized)) {
        serialized[key] = (error as any)[key];
      }
    }

    return serialized;
  }

  if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>;
  }

  return { value: error };
}

function normaliseLogArguments(args: unknown[]): { message: string; meta?: Record<string, unknown> } {
  if (args.length === 0) {
    return { message: '' };
  }

  const message = typeof args[0] === 'string'
    ? util.format(args[0] as string, ...args.slice(1))
    : util.format(...(args as [unknown, ...unknown[]]));

  const context: unknown[] = [];
  const errors: unknown[] = [];

  args.forEach((arg, index) => {
    if (arg instanceof Error) {
      errors.push(arg);
      return;
    }

    if (typeof arg === 'string' && index === 0) {
      return;
    }

    context.push(arg);
  });

  const meta: Record<string, unknown> = {};

  if (errors.length > 0) {
    meta.errors = errors.map(serializeError);
  }

  if (context.length === 1) {
    meta.context = context[0];
  } else if (context.length > 1) {
    meta.context = context;
  }

  const callSite = getCallSite();
  if (callSite) {
    meta.source = callSite;
  }

  if (Object.keys(meta).length === 0) {
    return { message };
  }

  return { message, meta };
}

function attachStructuredConsole(loggerInstance: Logger) {
  const globalKey = Symbol.for('stripe-ultrathink.logger.initialised');
  if ((globalThis as any)[globalKey]) {
    return;
  }

  const originalConsole: Partial<Record<ConsoleMethod, (...args: unknown[]) => void>> = {};

  (Object.keys(consoleLevelMap) as ConsoleMethod[]).forEach((method) => {
    originalConsole[method] = console[method].bind(console);

    console[method] = ((...args: unknown[]) => {
      const { message, meta } = normaliseLogArguments(args);
      const level = consoleLevelMap[method];
      const payload = meta ? { ...meta, level, message } : { level, message };
      loggerInstance.log(payload);
    }) as typeof console[typeof method];
  });

  Object.defineProperty(globalThis, globalKey, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
}

attachStructuredConsole(baseLogger);

export function getLogger(module: string, defaultMeta: Record<string, unknown> = {}) {
  return baseLogger.child({ module, ...defaultMeta });
}

export function errorToMetadata(error: unknown, additional: Record<string, unknown> = {}) {
  if (!error) {
    return { ...additional, error: { message: 'Unknown error' } };
  }

  return { ...additional, error: serializeError(error) };
}

export { baseLogger as logger };
