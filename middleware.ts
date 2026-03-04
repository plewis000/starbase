import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // Discord Activities load at root "/" via the discordsays.com proxy.
  // Detect Discord iframe context and redirect to /activity.
  const url = request.nextUrl;
  if (url.pathname === "/") {
    const params = url.searchParams;
    if (params.has("frame_id") || params.has("instance_id") || params.has("platform")) {
      const activityUrl = new URL("/activity", request.url);
      // Preserve Discord's query params
      params.forEach((value, key) => activityUrl.searchParams.set(key, value));
      return NextResponse.redirect(activityUrl);
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|icons|api/plaid/webhook|api/discord|api/pipeline|api/cron|api/activity|activity|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
