"use client";

import { useState } from "react";

interface Props {
  onSuccess: () => void;
}

export default function PlaidLink({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConsent, setShowConsent] = useState(false);

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
      {/* Consent dialog */}
      {showConsent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-dungeon-900 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-100 mb-3">
              Connect Your Bank Account
            </h3>
            <div className="text-sm text-slate-300 space-y-3 mb-6">
              <p>
                By connecting a bank account, you authorize The Keep to access the following
                data through Plaid:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400">
                <li>Account names, types, and masked numbers</li>
                <li>Account balances</li>
                <li>Transaction history (amounts, dates, merchants)</li>
              </ul>
              <p>
                This data is used to categorize spending, track budgets, and generate financial
                summaries. We do not access your bank login credentials.
              </p>
              <p>
                You can disconnect at any time. See our{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  className="text-gold-400 underline hover:text-gold-300"
                >
                  Privacy Policy
                </a>{" "}
                for full details on data handling, retention, and your rights.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConsent(false);
                  handleLink();
                }}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors"
              >
                I Agree — Connect Account
              </button>
              <button
                onClick={() => setShowConsent(false)}
                className="px-4 py-2.5 text-sm text-slate-400 border border-slate-600 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowConsent(true)}
        disabled={loading}
        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
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
