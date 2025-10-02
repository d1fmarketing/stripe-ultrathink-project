import type { Context } from 'aws-lambda';

export interface CleanupContext {
  type: 'timeout' | 'signal' | 'manual';
  signal?: NodeJS.Signals;
  detail?: string;
  remainingTime?: number;
}

export type CleanupHandler = (context: CleanupContext) => Promise<void> | void;

const cleanupHandlers = new Set<CleanupHandler>();
let cleanupInProgress: Promise<void> | null = null;
let signalHandlersRegistered = false;

export function registerCleanupHandler(handler: CleanupHandler): () => void {
  cleanupHandlers.add(handler);
  return () => cleanupHandlers.delete(handler);
}

export async function runCleanup(context: CleanupContext): Promise<void> {
  if (cleanupInProgress) {
    return cleanupInProgress;
  }

  cleanupInProgress = (async () => {
    for (const handler of Array.from(cleanupHandlers)) {
      try {
        await handler(context);
      } catch (error) {
        console.error('[lambdaLifecycle] Cleanup handler failed:', error);
      }
    }
  })();

  try {
    await cleanupInProgress;
  } finally {
    cleanupInProgress = null;
  }
}

export function setupLambdaTimeout(
  context?: Context,
  options?: { bufferMs?: number; logger?: (message: string) => void }
): () => void {
  ensureSignalHandlers();

  if (!context || typeof context.getRemainingTimeInMillis !== 'function') {
    return () => {};
  }

  context.callbackWaitsForEmptyEventLoop = false;

  const bufferMs = Math.max(options?.bufferMs ?? 1000, 0);
  const log = options?.logger ?? defaultLogger;

  let cleared = false;
  let finished = false;

  const schedule = Math.max(0, context.getRemainingTimeInMillis() - bufferMs);

  if (schedule === 0) {
    log('Lambda timeout buffer exceeded on invocation start, running cleanup immediately');
    runCleanup({ type: 'timeout', remainingTime: context.getRemainingTimeInMillis?.() }).catch((error) => {
      console.error('[lambdaLifecycle] Failed to execute timeout cleanup:', error);
    });
    finished = true;
    return () => {};
  }

  const timer = setTimeout(() => {
    if (cleared || finished) {
      return;
    }
    finished = true;
    log('Lambda nearing timeout, running registered cleanup handlers');
    runCleanup({ type: 'timeout', remainingTime: context.getRemainingTimeInMillis?.() }).catch((error) => {
      console.error('[lambdaLifecycle] Failed to execute timeout cleanup:', error);
    });
  }, schedule);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return () => {
    cleared = true;
    clearTimeout(timer);
  };
}

function ensureSignalHandlers(): void {
  if (signalHandlersRegistered) {
    return;
  }

  signalHandlersRegistered = true;

  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  for (const signal of signals) {
    process.once(signal, () => {
      defaultLogger(`Received ${signal}, running cleanup handlers`);
      runCleanup({ type: 'signal', signal }).catch((error) => {
        console.error('[lambdaLifecycle] Cleanup handler failed during signal processing:', error);
      });
    });
  }

  process.once('beforeExit', (code) => {
    defaultLogger(`Process beforeExit with code ${code}, running cleanup handlers`);
    runCleanup({ type: 'signal' }).catch((error) => {
      console.error('[lambdaLifecycle] Cleanup handler failed during beforeExit:', error);
    });
  });
}

function defaultLogger(message: string): void {
  console.warn(`[lambdaLifecycle] ${message}`);
}
