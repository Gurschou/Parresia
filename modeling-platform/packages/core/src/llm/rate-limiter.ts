/**
 * Klient-side rate-limiter mod LLM-API'et:
 *  - højst `maxConcurrent` samtidige kald
 *  - højst `maxRequests` kald-starter pr. glidende vindue (`windowMs`)
 * Kald køes FIFO; et AbortSignal fjerner et ventende kald fra køen.
 */
export interface RateLimiterOptions {
  maxConcurrent: number;
  maxRequests: number;
  windowMs?: number;
}

interface Waiter {
  resolve: () => void;
  reject: (e: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export class RateLimiter {
  private active = 0;
  private starts: number[] = [];
  private queue: Waiter[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly maxConcurrent: number;
  readonly maxRequests: number;
  readonly windowMs: number;

  constructor(opts: RateLimiterOptions) {
    this.maxConcurrent = Math.max(1, opts.maxConcurrent);
    this.maxRequests = Math.max(1, opts.maxRequests);
    this.windowMs = opts.windowMs ?? 60_000;
  }

  /** Antal kald der venter på en plads. */
  get pending(): number {
    return this.queue.length;
  }

  get running(): number {
    return this.active;
  }

  async schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.active--;
      this.drain();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    return new Promise<void>((resolve, reject) => {
      const w: Waiter = { resolve, reject, signal };
      if (signal) {
        w.onAbort = () => {
          this.queue = this.queue.filter((x) => x !== w);
          reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        };
        signal.addEventListener("abort", w.onAbort, { once: true });
      }
      this.queue.push(w);
      this.drain();
    });
  }

  private drain() {
    const now = Date.now();
    this.starts = this.starts.filter((t) => now - t < this.windowMs);
    while (this.queue.length && this.active < this.maxConcurrent && this.starts.length < this.maxRequests) {
      const w = this.queue.shift()!;
      if (w.signal && w.onAbort) w.signal.removeEventListener("abort", w.onAbort);
      this.active++;
      this.starts.push(now);
      w.resolve();
    }
    if (this.queue.length && this.active < this.maxConcurrent && this.starts.length >= this.maxRequests && !this.timer) {
      const wait = this.windowMs - (now - this.starts[0]!) + 5;
      this.timer = setTimeout(() => {
        this.timer = null;
        this.drain();
      }, wait);
    }
  }
}
