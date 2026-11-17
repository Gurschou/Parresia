export interface RetryOptions {
  /** Antal genforsøg efter første forsøg. */
  retries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry: (err: unknown, attempt: number) => boolean;
  /** Server-angivet ventetid (retry-after), hvis den findes. */
  retryAfterMs?: (err: unknown) => number | undefined;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/** Eksponentiel backoff med "equal jitter"; respekterer retry-after når den gives. */
export function backoffDelay(attempt: number, base: number, max: number, random = Math.random): number {
  const exp = Math.min(max, base * 2 ** attempt);
  return Math.round(exp / 2 + random() * (exp / 2));
}

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions): Promise<T> {
  const base = opts.baseDelayMs ?? 2000;
  const max = opts.maxDelayMs ?? 60_000;
  const doSleep = opts.sleep ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= opts.retries || !opts.shouldRetry(err, attempt) || opts.signal?.aborted) throw err;
      const hinted = opts.retryAfterMs?.(err);
      const delayMs = hinted !== undefined ? Math.min(max, Math.max(0, hinted)) : backoffDelay(attempt, base, max, opts.random);
      opts.onRetry?.({ attempt: attempt + 1, delayMs, error: err });
      await doSleep(delayMs, opts.signal);
    }
  }
}
