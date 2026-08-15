export type RetryProgress = { attempt: number; maxAttempts: number; nextDelayMs: number; reason: unknown };

export function exponentialBackoffDelay(attempt: number, baseDelayMs = 750, maxDelayMs = 8_000): number {
  return Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
}

const sleep = (milliseconds: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, milliseconds));

export async function retrySinglePick<T>(
  action: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; onRetry?: (progress: RetryProgress) => void } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await action();
    } catch (reason) {
      lastError = reason;
      if (attempt >= maxAttempts) break;
      const nextDelayMs = exponentialBackoffDelay(attempt, options.baseDelayMs);
      options.onRetry?.({ attempt, maxAttempts, nextDelayMs, reason });
      await sleep(nextDelayMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "single_pick_aiの再試行に失敗しました"));
}
