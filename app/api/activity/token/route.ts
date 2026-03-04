// POST /api/activity/token — Exchange Discord OAuth code for access token
// This keeps DISCORD_CLIENT_SECRET server-side

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { code } = body;
  if (!code || typeof code !== "string") {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }

  const clientId = process.env.NEXT_PUBLIC_DISCORD_APP_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("Missing DISCORD_APP_ID or DISCORD_CLIENT_SECRET");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Exchange code for access token with Discord
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text().catch(() => "");
    console.error("[activity/token] Discord token exchange failed:", tokenRes.status, err);
    return NextResponse.json({ error: "Token exchange failed" }, { status: 401 });
  }

  const tokenData = await tokenRes.json();

  return NextResponse.json({
    access_token: tokenData.access_token,
  });
}
