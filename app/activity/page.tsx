"use client";

import React, { useEffect, useState, useRef } from "react";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import ActivityProvider from "@/components/activity/ActivityProvider";
import ActivityTaskBoard from "@/components/activity/ActivityTaskBoard";

type SDKState = "loading" | "ready" | "error";

export default function ActivityPage() {
  const [state, setState] = useState<SDKState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const sdkRef = useRef<DiscordSDK | null>(null);

  useEffect(() => {
    async function initDiscord() {
      try {
        const appId = process.env.NEXT_PUBLIC_DISCORD_APP_ID;
        if (!appId) {
          throw new Error("NEXT_PUBLIC_DISCORD_APP_ID is not set");
        }

        // Initialize Discord SDK
        const sdk = new DiscordSDK(appId);
        sdkRef.current = sdk;

        // Wait for SDK to be ready
        await sdk.ready();

        // Authorize — request identify scope
        const { code } = await sdk.commands.authorize({
          client_id: appId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });

        // Exchange code for access token via our backend
        const tokenRes = await fetch("/api/activity/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          const data = await tokenRes.json().catch(() => ({}));
          throw new Error(data.error || "Token exchange failed");
        }

        const { access_token } = await tokenRes.json();

        // Authenticate with Discord SDK
        await sdk.commands.authenticate({ access_token });

        setToken(access_token);
        setState("ready");
      } catch (err) {
        console.error("Discord Activity init failed:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize");
        setState("error");
      }
    }

    initDiscord();
  }, []);

  if (state === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center space-y-4">
          <div className="animate-spin w-10 h-10 border-2 border-slate-700 border-t-crimson-500 rounded-full mx-auto" />
          <p className="text-sm text-slate-500 font-mono">Connecting to Discord...</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-4xl">⚠</div>
          <h2 className="text-lg font-bold text-slate-100">Connection Failed</h2>
          <p className="text-sm text-slate-400">{error}</p>
          <p className="text-xs text-slate-600">
            Make sure your Discord account is linked using <code className="text-crimson-400">/link</code> in Discord.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ActivityProvider token={token!}>
      <ActivityTaskBoard />
    </ActivityProvider>
  );
}
