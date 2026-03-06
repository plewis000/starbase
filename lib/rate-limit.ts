/**
 * Simple in-memory rate limiter for Vercel serverless.
 * Works within warm instances — not perfect but catches rapid-fire abuse.
 * For production at scale, replace with Upstash Redis or Vercel KV.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 60s to prevent memory leaks
let lastCleanup = Date.now();
function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

/**
 * Check rate limit for a given key.
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: true } | { allowed: false; retryAfter: number } {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  entry.count++;
  if (entry.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { allowed: true };
}

/**
 * Get client IP from request headers (Vercel sets x-forwarded-for).
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Preset rate limit configs
export const RATE_LIMITS = {
  // API routes: 60 requests per minute per IP
  api: { limit: 60, windowMs: 60_000 },
  // Auth routes: 10 requests per minute per IP
  auth: { limit: 10, windowMs: 60_000 },
  // Agent (AI) routes: 20 requests per minute per IP (costs money)
  agent: { limit: 20, windowMs: 60_000 },
  // Write operations: 30 per minute per IP
  write: { limit: 30, windowMs: 60_000 },
} as const;
