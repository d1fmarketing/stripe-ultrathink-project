export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

const defaultShouldRetry = (error: any): boolean => {
  if (!error) return true;
  const status = error?.statusCode ?? error?.status ?? error?.$metadata?.httpStatusCode;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500) return true;
    return false;
  }
  const code = error?.code ?? error?.name;
  if (code && typeof code === 'string') {
    const normalized = code.toLowerCase();
    if (normalized.includes('timeout') || normalized.includes('throttle')) return true;
    if (normalized.includes('unavailable') || normalized.includes('expiredtoken')) return true;
    if (normalized.includes('limit') || normalized.includes('too_many')) return true;
    if (normalized.includes('error')) return true;
    return false;
  }
  if (error?.type && typeof error.type === 'string') {
    const t = error.type.toLowerCase();
    if (t.includes('card_error')) return false;
    if (t.includes('invalid_request_error')) return false;
    if (t.includes('authentication_error')) return false;
    return true;
  }
  return true;
};

export const retryWithExponentialBackoff = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    retries = 3,
    baseDelayMs = 200,
    maxDelayMs = 2000,
    shouldRetry = defaultShouldRetry,
    onRetry
  } = options;

  let attempt = 0;
  // attempt counts retries after first failure; total attempts = retries + 1
  // we keep last error to throw if all retries exhausted
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) {
        throw error;
      }
      const delay = Math.min(
        maxDelayMs,
        Math.round(baseDelayMs * Math.pow(2, attempt) + Math.random() * baseDelayMs)
      );
      if (typeof onRetry === 'function') {
        try {
          onRetry(error, attempt + 1, delay);
        } catch (hookError) {
          console.warn('Retry hook error', hookError);
        }
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      attempt += 1;
    }
  }

  throw lastError ?? new Error('Retry operation failed without error context');
};

export const wrapClientSendWithRetry = <T extends { send: (command: any) => Promise<any> }>(
  client: T,
  options: RetryOptions = {}
): T => {
  const marker = '__retryWrapped';
  if ((client as any)[marker]) {
    return client;
  }
  const send = client.send.bind(client);
  const retryOptions: RetryOptions = {
    retries: 3,
    baseDelayMs: 200,
    maxDelayMs: 2500,
    ...options
  };
  client.send = ((command: any) =>
    retryWithExponentialBackoff(() => send(command), retryOptions)
  ) as typeof client.send;
  (client as any)[marker] = true;
  return client;
};

export const shouldRetry = defaultShouldRetry;
