// A fixed-window counter per address and action, against password guessing
// and sign-up floods. In memory: one server process holds every room anyway.

export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** True if the action is allowed now, counting it. */
  take(key: string, now: number): boolean {
    let w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      w = { start: now, count: 0 };
      this.windows.set(key, w);
      if (this.windows.size > 50_000) this.sweep(now);
    }
    w.count++;
    return w.count <= this.limit;
  }

  private sweep(now: number): void {
    for (const [k, w] of this.windows) if (now - w.start >= this.windowMs) this.windows.delete(k);
  }
}
