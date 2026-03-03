"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const code = inviteCode.trim();
    if (!code) {
      setError("Please enter an invite code.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/household/invite/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invite_code: code,
          display_name: displayName.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dungeon-950 relative overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-crimson-glow opacity-50 pointer-events-none" />

      <div className="w-full max-w-sm px-6 relative z-10">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">🏰</div>
          <h1 className="dcc-heading text-3xl tracking-wider text-slate-100">
            Join Household
          </h1>
          <p className="mt-3 text-dungeon-500 text-sm italic font-mono">
            Enter your invite code to join the crew.
          </p>
        </div>

        {/* Join card */}
        <form onSubmit={handleSubmit}>
          <div className="dcc-card p-8 border-crimson-900/40">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Invite Code
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="XXXXXX"
              maxLength={20}
              autoFocus
              className="dcc-input w-full text-center text-2xl tracking-[0.3em] font-mono uppercase mb-5"
            />

            <label className="block text-sm font-medium text-slate-300 mb-2">
              Display Name{" "}
              <span className="text-dungeon-500 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="What should we call you?"
              maxLength={50}
              className="dcc-input w-full mb-6"
            />

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-crimson-900/30 border border-crimson-800/50 text-crimson-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !inviteCode.trim()}
              className="w-full dcc-btn-primary py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            >
              {loading ? "Joining..." : "Join Household"}
            </button>
          </div>
        </form>

        <p className="text-center text-dungeon-600 text-xs mt-6 font-mono">
          Don&apos;t have a code? Ask your household admin.
        </p>
      </div>
    </div>
  );
}
