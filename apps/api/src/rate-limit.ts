/**
 * A fixed-window rate limit, in memory: N requests per minute and per key. Each API replica counts
 * on its own, so the limit holds per replica; enough for scripts and home automation.
 */
export interface RateLimiter {
  /** Counts a request; says whether it may go, and when the window resets. */
  hit(key: string, now: Date): { allowed: boolean; remaining: number; resetSeconds: number };
}

const WINDOW_MS = 60_000;
/** Beyond it, old windows are dropped, so that random keys cannot fill the memory. */
const MAX_KEYS = 10_000;

export function createRateLimiter(limit: number): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();
  return {
    hit(key, now) {
      const time = now.getTime();
      let window = windows.get(key);
      if (!window || time - window.start >= WINDOW_MS) {
        if (windows.size >= MAX_KEYS) {
          for (const [other, value] of windows) {
            if (time - value.start >= WINDOW_MS) windows.delete(other);
          }
          if (windows.size >= MAX_KEYS) windows.clear();
        }
        window = { start: time, count: 0 };
        windows.set(key, window);
      }
      window.count += 1;
      return {
        allowed: window.count <= limit,
        remaining: Math.max(0, limit - window.count),
        resetSeconds: Math.max(1, Math.ceil((window.start + WINDOW_MS - time) / 1000)),
      };
    },
  };
}
