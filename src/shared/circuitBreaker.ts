export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before tripping the breaker */
  failureThreshold: number;
  /** Number of consecutive successes in half-open state to close the breaker */
  successThreshold: number;
  /** How long to wait before allowing another try after tripping (ms) */
  cooldownPeriod: number;
  /** Timeout for the protected action (ms) */
  timeout: number;
  /** Maximum number of concurrent calls allowed while half-open */
  halfOpenMaxCalls?: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 1,
  cooldownPeriod: 30_000,
  timeout: 10_000,
  halfOpenMaxCalls: 1,
};

export class CircuitBreakerOpenError extends Error {
  public readonly nextAttempt: number;
  constructor(message: string, nextAttempt: number) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
    this.nextAttempt = nextAttempt;
  }
}

export class CircuitBreakerTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerTimeoutError';
  }
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = 0;
  private activeHalfOpenCalls = 0;
  private options: CircuitBreakerOptions;

  constructor(private readonly name: string, options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...(options ?? {}) };
  }

  updateOptions(options: Partial<CircuitBreakerOptions>) {
    this.options = { ...this.options, ...options };
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        this.activeHalfOpenCalls = 0;
      } else {
        throw new CircuitBreakerOpenError(
          `Circuit breaker \"${this.name}\" is open until ${new Date(this.nextAttempt).toISOString()}`,
          this.nextAttempt
        );
      }
    }

    if (this.state === 'HALF_OPEN') {
      const maxCalls = this.options.halfOpenMaxCalls ?? 1;
      if (this.activeHalfOpenCalls >= maxCalls) {
        throw new CircuitBreakerOpenError(
          `Circuit breaker \"${this.name}\" is half-open and only allows ${maxCalls} concurrent call(s)`,
          this.nextAttempt
        );
      }
      this.activeHalfOpenCalls++;
    }

    const timeout = this.options.timeout;
    let timeoutHandle: NodeJS.Timeout | undefined;

    const timeoutPromise = timeout > 0
      ? new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new CircuitBreakerTimeoutError(`Circuit breaker \"${this.name}\" timed out after ${timeout}ms`));
          }, timeout);
        })
      : null;

    try {
      const actionPromise = action();
      const result = timeoutPromise
        ? await Promise.race([actionPromise, timeoutPromise])
        : await actionPromise;
      this.onSuccess();
      return result as T;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      if (this.state === 'HALF_OPEN' && this.activeHalfOpenCalls > 0) {
        this.activeHalfOpenCalls--;
      }
    }
  }

  private onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.close();
      }
    } else {
      this.reset();
    }
  }

  private onFailure(error: Error) {
    console.warn(`Circuit breaker \"${this.name}\" caught error: ${error.message}`);
    if (this.state === 'HALF_OPEN') {
      this.trip();
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.options.failureThreshold) {
      this.trip();
    }
  }

  private trip() {
    this.state = 'OPEN';
    this.nextAttempt = Date.now() + this.options.cooldownPeriod;
    this.failureCount = 0;
    this.successCount = 0;
    this.activeHalfOpenCalls = 0;
    console.warn(`Circuit breaker \"${this.name}\" opened. Next attempt after ${new Date(this.nextAttempt).toISOString()}`);
  }

  private close() {
    console.info(`Circuit breaker \"${this.name}\" closed after successful calls.`);
    this.reset();
  }

  private reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.activeHalfOpenCalls = 0;
  }
}

const breakers = new Map<string, CircuitBreaker>();

export function getCircuitBreaker(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker(name, options);
    breakers.set(name, breaker);
  } else if (options) {
    breaker.updateOptions(options);
  }
  return breaker;
}

export async function withCircuitBreaker<T>(
  name: string,
  action: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): Promise<T> {
  const breaker = getCircuitBreaker(name, options);
  return breaker.execute(action);
}

export interface FetchCircuitBreakerOptions extends Partial<CircuitBreakerOptions> {
  breakerId?: string;
}

export function fetchWithCircuitBreaker(
  url: string | URL,
  init?: RequestInit,
  options?: FetchCircuitBreakerOptions
): Promise<Response> {
  const targetUrl = typeof url === 'string' ? new URL(url) : url;
  const { breakerId, ...breakerOptions } = options ?? {};

  return withCircuitBreaker(
    breakerId ?? `fetch:${targetUrl.hostname}`,
    () => fetch(url, init),
    { timeout: 15_000, ...breakerOptions }
  );
}

export function stripeCircuitBreaker<T>(
  operation: string,
  action: () => Promise<T>,
  options?: Partial<CircuitBreakerOptions>
): Promise<T> {
  return withCircuitBreaker(`stripe:${operation}`, action, { timeout: 20_000, ...options });
}
