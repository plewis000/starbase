import { NextRequest, NextResponse } from "next/server";
import { withUser } from "@/lib/api/withAuth";
import { plaidClient } from "@/lib/plaid";
import { CountryCode, Products } from "plaid";

// POST /api/plaid/link-token — Generate a Plaid Link token for the frontend
export const POST = withUser(async (_request: NextRequest, { supabase: _supabase, user }) => {
  try {
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: user.id },
      client_name: "The Keep",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
      webhook: `${process.env.NEXT_PUBLIC_APP_URL}/api/plaid/webhook`,
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create link token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
