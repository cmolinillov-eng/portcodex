type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterMs: number; resetAt: number };

type GlobalRateLimitStore = {
  __portfolioRateLimitStore?: Map<string, RateLimitState>;
};

function getStore(): Map<string, RateLimitState> {
  const globalStore = globalThis as typeof globalThis & GlobalRateLimitStore;
  if (!globalStore.__portfolioRateLimitStore) {
    globalStore.__portfolioRateLimitStore = new Map<string, RateLimitState>();
  }
  return globalStore.__portfolioRateLimitStore;
}

function pruneExpiredEntries(now: number, store: Map<string, RateLimitState>): void {
  for (const [key, state] of store.entries()) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const store = getStore();
  pruneExpiredEntries(now, store);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    store.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, config.limit - 1),
      resetAt,
    };
  }

  if (existing.count >= config.limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(0, existing.resetAt - now),
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  store.set(key, existing);
  return {
    allowed: true,
    remaining: Math.max(0, config.limit - existing.count),
    resetAt: existing.resetAt,
  };
}

