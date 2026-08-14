/**
 * 简单限流器：保证两次放行之间至少间隔 minIntervalMs。
 * 官方市集 API 建议约 1 req/s；本工具保守起见默认 3000ms（3s），
 * 可传参调整（如 --delay 2000）。
 */
export class RateLimiter {
  private last = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs = 3000) {
    this.minIntervalMs = minIntervalMs;
  }

  /** 等待直到允许下一次请求。 */
  async wait(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.last;
    if (elapsed < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - elapsed));
    }
    this.last = Date.now();
  }

  /** 强制把下一次请求推迟到 now + ms 之后（用于 429 退避）。 */
  backoff(ms: number): void {
    const until = Date.now() + ms;
    if (until > this.last) this.last = until;
  }
}