import { createServerClient } from "@supabase/ssr";
import { createClient as createBareClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";

export async function createClient() {
  // Check for Bearer token from mobile clients
  const headerStore = await headers();
  const authHeader = headerStore.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const client = createBareClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    return client;
  }

  // Default: cookie-based auth (web app)
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Partial<ResponseCookie> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — cookies can't be set; middleware handles this
          }
        },
      },
    }
  );
}
