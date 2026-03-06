import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Simple edge-compatible rate limiter (per-instance, best-effort on Vercel)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMITS: Record<string, number> = {
  agent: 20,    // AI calls cost money
  write: 60,    // POST/PATCH/DELETE
  read: 120,    // GET
};

function checkEdgeRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  entry.count++;
  if (entry.count > limit) return false;
  return true;
}

// Periodic cleanup to prevent memory leak
let lastCleanup = Date.now();
function cleanupRateLimits() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) rateLimitStore.delete(key);
  }
}

export async function middleware(request: NextRequest) {
  // Discord Activities load at root "/" via the discordsays.com proxy.
  // Rewrite (not redirect) to /activity so content is served without URL change.
  const url = request.nextUrl;
  if (url.pathname === "/") {
    const params = url.searchParams;
    if (params.has("frame_id") || params.has("instance_id") || params.has("platform")) {
      const activityUrl = url.clone();
      activityUrl.pathname = "/activity";
      return NextResponse.rewrite(activityUrl);
    }
  }

  // Rate limit API routes
  if (url.pathname.startsWith("/api/")) {
    cleanupRateLimits();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim()
      || request.headers.get("x-real-ip")
      || "unknown";

    const isAgent = url.pathname.startsWith("/api/agent");
    const isWrite = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
    const tier = isAgent ? "agent" : isWrite ? "write" : "read";
    const limit = RATE_LIMITS[tier];

    if (!checkEdgeRateLimit(`${tier}:${ip}`, limit)) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api/plaid/webhook|api/discord|api/pipeline|api/cron|api/activity|activity|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
