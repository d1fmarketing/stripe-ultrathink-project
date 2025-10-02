import { AsyncLocalStorage } from 'node:async_hooks';
import util from 'node:util';
import pino, { Logger, LogFn } from 'pino';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface CorrelationContext {
  requestId: string;
  eventId: string;
  merchantId: string;
}

const DEFAULT_CONTEXT: CorrelationContext = {
  requestId: 'unknown',
  eventId: 'unknown',
  merchantId: 'unknown'
};

const asyncContext = new AsyncLocalStorage<CorrelationContext>();

const baseLogger: Logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  messageKey: 'message',
  mixin() {
    const store = asyncContext.getStore();
    return {
      requestId: store?.requestId ?? DEFAULT_CONTEXT.requestId,
      eventId: store?.eventId ?? DEFAULT_CONTEXT.eventId,
      merchantId: store?.merchantId ?? DEFAULT_CONTEXT.merchantId
    };
  }
});

function resolveHeaders(event: any): Record<string, unknown> {
  const headers = event?.headers;
  if (!headers || typeof headers !== 'object') {
    return {};
  }
  return headers as Record<string, unknown>;
}

function getHeader(event: any, headerName: string): string | undefined {
  const headers = resolveHeaders(event);
  const desired = headerName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === desired) {
      const value = headers[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
  }
  return undefined;
}

function extractRequestId(event: any, context: any): string | undefined {
  return (
    event?.requestContext?.requestId ||
    getHeader(event, 'x-request-id') ||
    context?.awsRequestId ||
    undefined
  );
}

function extractEventId(event: any): string | undefined {
  const headers = [
    'stripe-event-id',
    'x-event-id',
    'event-id'
  ];
  for (const header of headers) {
    const value = getHeader(event, header);
    if (value) {
      return value;
    }
  }
  if (typeof event?.id === 'string' && event.id.trim().length > 0) {
    return event.id;
  }
  if (typeof event?.detail?.id === 'string') {
    return event.detail.id;
  }
  return undefined;
}

function parseJsonBody(body: unknown): any {
  if (typeof body !== 'string') {
    return null;
  }
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function extractMerchantId(event: any): string | undefined {
  const headerMerchant =
    getHeader(event, 'x-merchant-id') ||
    getHeader(event, 'stripe-account') ||
    getHeader(event, 'merchant-id');
  if (headerMerchant) {
    return headerMerchant;
  }

  const pathMerchant =
    event?.pathParameters?.merchantId ||
    event?.pathParameters?.merchant ||
    event?.pathParameters?.id;
  if (typeof pathMerchant === 'string' && pathMerchant.trim().length > 0) {
    return pathMerchant;
  }

  const queryMerchant =
    event?.queryStringParameters?.merchantId ||
    event?.queryStringParameters?.merchant ||
    event?.queryStringParameters?.stripe_account_id;
  if (typeof queryMerchant === 'string' && queryMerchant.trim().length > 0) {
    return queryMerchant;
  }

  if (typeof event?.merchantId === 'string') {
    return event.merchantId;
  }

  if (typeof event?.merchant_id === 'string') {
    return event.merchant_id;
  }

  const parsedBody = parseJsonBody(event?.body);
  if (parsedBody) {
    const bodyMerchant =
      parsedBody.merchantId ||
      parsedBody.merchant_id ||
      parsedBody.merchant ||
      parsedBody.stripe_account_id;
    if (typeof bodyMerchant === 'string' && bodyMerchant.trim().length > 0) {
      return bodyMerchant;
    }
  }

  return undefined;
}

function formatArgs(args: unknown[]): { obj?: Record<string, unknown>; message?: string } {
  if (args.length === 0) {
    return { message: '' };
  }

  const [first, ...rest] = args;

  if (first instanceof Error) {
    const message = rest.length ? util.format(rest[0] as any, ...rest.slice(1)) : first.message;
    return { obj: { err: first }, message };
  }

  if (typeof first === 'object' && first !== null) {
    const message = rest.length ? util.format(rest[0] as any, ...rest.slice(1)) : undefined;
    return { obj: first as Record<string, unknown>, message };
  }

  return { message: util.format(first as any, ...rest) };
}

function logThroughPino(level: PinoLevel, args: unknown[]): void {
  const { obj, message } = formatArgs(args);
  if (obj && message) {
    (baseLogger[level] as LogFn)(obj, message);
  } else if (obj) {
    (baseLogger[level] as LogFn)(obj);
  } else {
    (baseLogger[level] as LogFn)(message ?? '');
  }
}

const consoleLevelMap: Record<string, PinoLevel> = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug'
};

for (const [method, level] of Object.entries(consoleLevelMap)) {
  const bound = (...args: unknown[]) => logThroughPino(level, args);
  (console as any)[method] = bound;
}

(console as any).trace = (...args: unknown[]) => logThroughPino('trace', args);

export function getLogger(): Logger {
  return baseLogger;
}

export function getCorrelationContext(): CorrelationContext {
  return asyncContext.getStore() ?? { ...DEFAULT_CONTEXT };
}

export function setCorrelationContext(update: Partial<CorrelationContext>): void {
  const store = asyncContext.getStore();
  if (!store) {
    return;
  }
  if (update.requestId && update.requestId.trim().length > 0) {
    store.requestId = update.requestId;
  }
  if (update.eventId && update.eventId.trim().length > 0) {
    store.eventId = update.eventId;
  }
  if (update.merchantId && update.merchantId.trim().length > 0) {
    store.merchantId = update.merchantId;
  }
}

type Handler<TEvent, TResult> = (event: TEvent, context: any) => Promise<TResult> | TResult;

type WrappedHandler<TEvent, TResult> = (event: TEvent, context: any) => Promise<TResult>;

export function withRequestLogging<TEvent = any, TResult = any>(
  handler: Handler<TEvent, TResult>
): WrappedHandler<TEvent, TResult> {
  return async (event: TEvent, context: any) => {
    const correlation: CorrelationContext = {
      requestId: extractRequestId(event, context) ?? DEFAULT_CONTEXT.requestId,
      eventId: extractEventId(event) ?? DEFAULT_CONTEXT.eventId,
      merchantId: extractMerchantId(event) ?? DEFAULT_CONTEXT.merchantId
    };

    return asyncContext.run({ ...correlation }, async () => {
      try {
        return await handler(event, context);
      } catch (error) {
        if (error instanceof Error) {
          baseLogger.error({ err: error }, 'Unhandled error in handler');
        } else {
          baseLogger.error({ error }, 'Unhandled error in handler');
        }
        throw error;
      }
    });
  };
}
