"use client";

import React, { useEffect, useState, useRef } from "react";
import ActivityProvider from "@/components/activity/ActivityProvider";
import ActivityTaskBoard from "@/components/activity/ActivityTaskBoard";

type SDKState = "loading" | "ready" | "error";

export default function ActivityPage() {
  const [state, setState] = useState<SDKState>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string>("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const sdkRef = useRef<any>(null);

  const log = (msg: string) => {
    console.log(`[activity] ${msg}`);
    setDebugLog((prev) => [...prev.slice(-9), msg]);
  };

  useEffect(() => {
    async function initDiscord() {
      try {
        const appId = process.env.NEXT_PUBLIC_DISCORD_APP_ID;
        log(`App ID: ${appId ? appId.slice(0, 8) + "..." : "MISSING"}`);

        if (!appId) {
          throw new Error("NEXT_PUBLIC_DISCORD_APP_ID is not set");
        }

        // Dynamic import to avoid SSR issues
        log("Importing Discord SDK...");
        const { DiscordSDK } = await import("@discord/embedded-app-sdk");

        log("Creating SDK instance...");
        const sdk = new DiscordSDK(appId);
        sdkRef.current = sdk;

        log("Waiting for SDK ready...");
        await sdk.ready();
        log("SDK ready!");

        log("Requesting authorization...");
        const { code } = await sdk.commands.authorize({
          client_id: appId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify"],
        });
        log(`Got auth code: ${code.slice(0, 8)}...`);

        log("Exchanging token...");
        const tokenRes = await fetch("/api/activity/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          const data = await tokenRes.json().catch(() => ({}));
          throw new Error(data.error || `Token exchange failed (${tokenRes.status})`);
        }

        const { access_token } = await tokenRes.json();
        log("Token received, authenticating...");

        await sdk.commands.authenticate({ access_token });
        log("Authenticated! Loading task board...");

        setToken(access_token);
        setState("ready");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to initialize";
        console.error("Discord Activity init failed:", err);
        log(`ERROR: ${msg}`);
        setError(msg);
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
          {debugLog.length > 0 && (
            <div className="mt-2">
              {debugLog.map((l, i) => (
                <p key={i} className="text-[10px] text-slate-600 font-mono">{l}</p>
              ))}
            </div>
          )}
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
          {debugLog.length > 0 && (
            <div className="mt-4 p-3 bg-slate-900 rounded text-left">
              <p className="text-[10px] text-slate-600 font-mono mb-1">Debug log:</p>
              {debugLog.map((l, i) => (
                <p key={i} className="text-[10px] text-slate-500 font-mono">{l}</p>
              ))}
            </div>
          )}
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
