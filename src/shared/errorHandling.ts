import Stripe from 'stripe';
import { createErrorResponse } from './responses.js';

type LambdaHandler<TEvent = any, TResult = any> = (event: TEvent, context?: any) => Promise<TResult> | TResult;

interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  cooldownPeriodMs: number;
}

interface ErrorHandlingOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  retryOn?: (error: any, attempt: number) => boolean | Promise<boolean>;
  circuitBreaker?: CircuitBreakerOptions;
  classifyError?: (error: any) => { statusCode: number; message: string; details?: Record<string, any> };
}

type CircuitState = {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  nextAttemptTime: number;
};

const defaultOptions: Required<Pick<ErrorHandlingOptions, 'timeoutMs' | 'retries' | 'retryDelayMs'>> & {
  circuitBreaker: CircuitBreakerOptions;
} = {
  timeoutMs: 8000,
  retries: 1,
  retryDelayMs: 250,
  circuitBreaker: {
    failureThreshold: 4,
    successThreshold: 2,
    cooldownPeriodMs: 30_000
  }
};

const circuitStates = new Map<string, CircuitState>();

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isStripeError(error: any): error is Stripe.errors.StripeError {
  return !!(error && typeof error === 'object' && 'type' in error &&
    typeof (error as Stripe.errors.StripeError).type === 'string' &&
    'message' in error);
}

function isTimeoutError(error: any) {
  return error && typeof error === 'object' &&
    (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.name === 'TimeoutError');
}

function isRetryableAwsError(error: any) {
  return error && typeof error === 'object' &&
    (error.$retryable?.throttling || error.$retryable?.retryDelay || error.name === 'ThrottlingException');
}

function shouldRetryDefault(error: any) {
  if (!error) return false;
  if (isTimeoutError(error) || isRetryableAwsError(error)) {
    return true;
  }
  if (isStripeError(error)) {
    const retryableStripeTypes = new Set([
      'api_connection_error',
      'idempotency_error',
      'rate_limit_error',
      'api_error'
    ]);
    return retryableStripeTypes.has(error.type);
  }
  if (error.retryable === true) {
    return true;
  }
  return false;
}

function getCircuitState(name: string, options: CircuitBreakerOptions): CircuitState {
  const current = circuitStates.get(name);
  if (current) {
    if (current.state === 'open' && Date.now() >= current.nextAttemptTime) {
      // Transition to half-open
      const halfOpen: CircuitState = {
        state: 'half-open',
        failureCount: 0,
        successCount: 0,
        nextAttemptTime: Date.now() + options.cooldownPeriodMs
      };
      circuitStates.set(name, halfOpen);
      return halfOpen;
    }
    return current;
  }
  const initial: CircuitState = {
    state: 'closed',
    failureCount: 0,
    successCount: 0,
    nextAttemptTime: 0
  };
  circuitStates.set(name, initial);
  return initial;
}

function recordFailure(name: string, options: CircuitBreakerOptions) {
  const state = getCircuitState(name, options);
  const failureCount = state.failureCount + 1;
  const newState: CircuitState = {
    state: failureCount >= options.failureThreshold ? 'open' : state.state,
    failureCount,
    successCount: 0,
    nextAttemptTime:
      failureCount >= options.failureThreshold
        ? Date.now() + options.cooldownPeriodMs
        : state.nextAttemptTime
  };
  circuitStates.set(name, newState);
}

function recordSuccess(name: string, options: CircuitBreakerOptions) {
  const state = getCircuitState(name, options);
  if (state.state === 'half-open') {
    const successCount = state.successCount + 1;
    if (successCount >= options.successThreshold) {
      circuitStates.set(name, {
        state: 'closed',
        failureCount: 0,
        successCount: 0,
        nextAttemptTime: 0
      });
      return;
    }
    circuitStates.set(name, {
      ...state,
      successCount
    });
  } else {
    circuitStates.set(name, {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      nextAttemptTime: 0
    });
  }
}

async function executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs: number) {
  let timeoutHandle: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new Error('Operation timed out');
      (error as any).name = 'TimeoutError';
      (error as any).code = 'ETIMEDOUT';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

function normalizeStripeError(error: Stripe.errors.StripeError) {
  const statusCode = error.statusCode ?? 400;
  return {
    statusCode,
    message: error.message || 'Stripe API error',
    details: {
      code: (error as any).code,
      doc_url: (error as any).doc_url,
      type: error.type,
      requestId: (error as any).requestId ?? (error as any).request_id
    }
  };
}

function defaultClassifyError(error: any) {
  if (isStripeError(error)) {
    return normalizeStripeError(error);
  }

  if (error && typeof error === 'object') {
    if ('statusCode' in error && 'body' in error) {
      return {
        statusCode: (error as any).statusCode ?? 500,
        message: (() => {
          try {
            const parsed = JSON.parse((error as any).body);
            return parsed?.error || parsed?.message || 'Unhandled error';
          } catch {
            return 'Unhandled error';
          }
        })(),
        details: {
          passthrough: true
        }
      };
    }

    if (error.statusCode && error.message) {
      return {
        statusCode: error.statusCode,
        message: error.message,
        details: {
          code: error.code
        }
      };
    }
  }

  return {
    statusCode: 500,
    message: (error && (error.message || error.toString())) || 'Unexpected error',
    details: undefined
  };
}

function buildErrorResponse(
  handlerName: string,
  error: any,
  requestId: string | undefined,
  classifyError?: ErrorHandlingOptions['classifyError']
) {
  const classifier = classifyError ?? defaultClassifyError;
  const { statusCode, message, details } = classifier(error);
  const typedDetails = details as Record<string, any> | undefined;
  const responseDetails = {
    ...details,
    handler: handlerName,
    requestId
  };

  if (typedDetails?.passthrough) {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json'
      },
      body: (error as any).body
    };
  }

  return createErrorResponse(statusCode, message, responseDetails);
}

export function withErrorHandling<TEvent = any, TResult = any>(
  name: string,
  handler: LambdaHandler<TEvent, TResult>,
  options: ErrorHandlingOptions = {}
): LambdaHandler<TEvent, TResult> {
  const resolvedOptions: ErrorHandlingOptions = {
    ...defaultOptions,
    ...options,
    circuitBreaker: {
      ...defaultOptions.circuitBreaker,
      ...(options.circuitBreaker || {})
    }
  };

  return async (event: TEvent, context?: any) => {
    const requestId = (event as any)?.headers?.['x-request-id'] ||
      (event as any)?.headers?.['X-Request-ID'] ||
      (event as any)?.requestContext?.requestId;

    const circuitState = getCircuitState(name, resolvedOptions.circuitBreaker!);
    if (circuitState.state === 'open') {
      console.warn(`[${name}] circuit breaker open - rejecting request`, {
        requestId,
        nextAttemptTime: circuitState.nextAttemptTime
      });
      return createErrorResponse(503, 'Service temporarily unavailable', {
        handler: name,
        requestId,
        reason: 'circuit_breaker_open'
      }) as unknown as TResult;
    }

    let attempt = 0;
    let lastError: any;

    while (attempt <= (resolvedOptions.retries ?? 0)) {
      try {
        const execute = () => Promise.resolve(handler(event, context));
        const result = await executeWithTimeout(execute, resolvedOptions.timeoutMs ?? defaultOptions.timeoutMs);
        if (attempt > 0) {
          console.info(`[${name}] succeeded after retry`, { attempt, requestId });
        }
        recordSuccess(name, resolvedOptions.circuitBreaker!);
        return result as TResult;
      } catch (error: any) {
        lastError = error;
        const retryable = await Promise.resolve(
          (resolvedOptions.retryOn ?? shouldRetryDefault)(error, attempt)
        );

        console.error(`[${name}] handler attempt failed`, {
          attempt,
          retryable,
          requestId,
          error: {
            message: error?.message,
            code: error?.code,
            type: error?.type,
            statusCode: error?.statusCode
          }
        });

        if (retryable && attempt < (resolvedOptions.retries ?? 0)) {
          attempt += 1;
          await delay((resolvedOptions.retryDelayMs ?? defaultOptions.retryDelayMs) * attempt);
          continue;
        }

        recordFailure(name, resolvedOptions.circuitBreaker!);
        return buildErrorResponse(name, error, requestId, resolvedOptions.classifyError) as unknown as TResult;
      }
    }

    recordFailure(name, resolvedOptions.circuitBreaker!);
    return buildErrorResponse(name, lastError, requestId, resolvedOptions.classifyError) as unknown as TResult;
  };
}

export function resetCircuitBreaker(name?: string) {
  if (name) {
    circuitStates.delete(name);
  } else {
    circuitStates.clear();
  }
}

