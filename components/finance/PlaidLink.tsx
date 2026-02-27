"use client";

import { useState } from "react";

interface Props {
  onSuccess: () => void;
}

export default function PlaidLink({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLink = async () => {
    setLoading(true);
    setError(null);

    try {
      // Get link token from our API
      const tokenRes = await fetch("/api/plaid/link-token", { method: "POST" });
      if (!tokenRes.ok) {
        const data = await tokenRes.json();
        setError(data.error || "Failed to create link token");
        setLoading(false);
        return;
      }

      const { link_token } = await tokenRes.json();

      // Load Plaid Link script dynamically
      if (!document.getElementById("plaid-link-script")) {
        const script = document.createElement("script");
        script.id = "plaid-link-script";
        script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
        document.head.appendChild(script);
        await new Promise<void>((resolve) => {
          script.onload = () => resolve();
        });
      }

      // Open Plaid Link
      const handler = (window as unknown as PlaidWindow).Plaid.create({
        token: link_token,
        onSuccess: async (public_token: string, metadata: PlaidMetadata) => {
          // Exchange token
          const exchangeRes = await fetch("/api/plaid/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              public_token,
              institution: metadata.institution,
            }),
          });

          if (exchangeRes.ok) {
            onSuccess();
          } else {
            const data = await exchangeRes.json();
            setError(data.error || "Failed to link account");
          }
        },
        onExit: () => {
          setLoading(false);
        },
      });

      handler.open();
    } catch {
      setError("Failed to initialize Plaid Link");
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleLink}
        disabled={loading}
        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-red-500 transition-colors disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Link Bank Account"}
      </button>
      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
    </div>
  );
}

interface PlaidWindow {
  Plaid: {
    create: (config: {
      token: string;
      onSuccess: (public_token: string, metadata: PlaidMetadata) => void;
      onExit: () => void;
    }) => { open: () => void };
  };
}

interface PlaidMetadata {
  institution: { name: string; institution_id: string };
}
