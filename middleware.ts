import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Discord Activities load at root "/" via the discordsays.com proxy.
  // Detect Discord iframe context and redirect to /activity.
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

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api/plaid/webhook|api/discord|api/pipeline|api/cron|api/activity|activity|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
