import type { Clock } from "../infrastructure/time";

export interface RateRule {
  /** Tokens added per second. */
  refillPerSecond: number;
  /** Bucket size (max burst). */
  burst: number;
}

/** Keyed token-bucket limiter. Memory is bounded by pruning idle buckets. */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();

  constructor(
    private readonly rule: RateRule,
    private readonly clock: Clock,
    private readonly maxKeys = 50_000,
  ) {}

  take(key: string, cost = 1): boolean {
    const now = this.clock.now();
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) this.prune(now);
      b = { tokens: this.rule.burst, updated: now };
      this.buckets.set(key, b);
    } else {
      const elapsed = (now - b.updated) / 1000;
      b.tokens = Math.min(this.rule.burst, b.tokens + elapsed * this.rule.refillPerSecond);
      b.updated = now;
    }
    if (b.tokens < cost) return false;
    b.tokens -= cost;
    return true;
  }

  /** Drop buckets that have fully refilled (they behave like new ones). */
  prune(now = this.clock.now()) {
    const fullAfter = (this.rule.burst / this.rule.refillPerSecond) * 1000;
    for (const [k, b] of this.buckets) if (now - b.updated >= fullAfter) this.buckets.delete(k);
  }
}

export const RATE_RULES = {
  httpCreateRoom: { refillPerSecond: 5 / 60, burst: 5 },
  httpJoinRoom: { refillPerSecond: 20 / 60, burst: 10 },
  httpLookup: { refillPerSecond: 1, burst: 30 },
  wsMessages: { refillPerSecond: 20, burst: 40 },
  gameActions: { refillPerSecond: 2, burst: 8 },
} satisfies Record<string, RateRule>;
