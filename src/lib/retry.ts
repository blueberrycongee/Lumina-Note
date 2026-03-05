export type RetryContext = {
  attempt: number;
  maxAttempts: number;
  nextDelayMs: number;
  error: unknown;
};

export type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs?: number;
  factor?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (context: RetryContext) => void;
};

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function retryWithExponentialBackoff<T>(
  task: () => Promise<T>,
  {
    maxAttempts,
    baseDelayMs,
    maxDelayMs = Number.POSITIVE_INFINITY,
    factor = 2,
    sleep = defaultSleep,
    onRetry,
  }: RetryOptions
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) {
        break;
      }

      const expDelay = baseDelayMs * Math.pow(factor, attempt - 1);
      const nextDelayMs = Math.min(expDelay, maxDelayMs);
      onRetry?.({ attempt, maxAttempts, nextDelayMs, error });
      await sleep(nextDelayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "Unknown retry error"));
}
