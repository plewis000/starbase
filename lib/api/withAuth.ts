/**
 * API route wrapper that handles auth + household context boilerplate.
 * Eliminates ~12 lines of repeated code per route handler.
 *
 * Usage:
 *   export const GET = withAuth(async (request, { supabase, user, ctx }) => {
 *     // user and ctx are already verified
 *     return NextResponse.json({ data: "..." });
 *   });
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdContext, HouseholdContext } from "@/lib/household";
import { SupabaseClient } from "@supabase/supabase-js";
import { User } from "@supabase/supabase-js";

export interface AuthContext {
  supabase: SupabaseClient;
  user: User;
  ctx: HouseholdContext;
}

type RouteHandler = (
  request: NextRequest,
  auth: AuthContext,
  params?: Record<string, string>
) => Promise<NextResponse>;

/**
 * Wraps an API route handler with authentication and household context.
 * Returns 401 if not authenticated, 404 if no household found.
 */
export function withAuth(handler: RouteHandler) {
  return async (request: NextRequest, context?: { params?: Promise<Record<string, string>> }) => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ctx = await getHouseholdContext(supabase, user.id);
    if (!ctx) {
      return NextResponse.json({ error: "No household found" }, { status: 404 });
    }

    const params = context?.params ? await context.params : undefined;
    return handler(request, { supabase, user, ctx }, params);
  };
}

/**
 * Like withAuth but requires admin role.
 */
export function withAdmin(handler: RouteHandler) {
  return withAuth(async (request, auth, params) => {
    if (auth.ctx.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    return handler(request, auth, params);
  });
}
