/**
 * In-memory fixed-window rate limiter, keyed by user id + operation.
 *
 * Scope note: per-process memory — on multi-instance/serverless deployments
 * this bounds abuse per instance (a strong default); for exact cross-instance
 * quotas swap the storage for Upstash/Redis without changing call sites.
 * Auth-endpoint limiting is additionally provided by Supabase itself.
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

const HOUR = 3_600_000;

export const RULES: Record<string, RateLimitRule> = {
  scan: { limit: 10, windowMs: HOUR },        // expensive vision calls
  recipes: { limit: 30, windowMs: HOUR },     // LLM generation
  nutrition: { limit: 60, windowMs: HOUR },   // LLM calls
  "pantry-confirm": { limit: 30, windowMs: HOUR },
  "save-recipe": { limit: 60, windowMs: HOUR },
  "grocery-add": { limit: 60, windowMs: HOUR },
};

const windows = new Map<string, { count: number; resetAt: number }>();

function prune(now: number) {
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

/** Returns true when the call is allowed. `now` is injectable for tests. */
export function rateLimit(
  uid: string,
  route: keyof typeof RULES | string,
  now: number = Date.now(),
): boolean {
  const rule = RULES[route];
  if (!rule) return true; // unknown operation → not limited
  prune(now);
  const key = `${route}:${uid}`;
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + rule.windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= rule.limit;
}
