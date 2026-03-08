"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CompletionCelebration from "@/components/ui/CompletionCelebration";

export default function WelcomePage() {
  const router = useRouter();
  const [showConfetti, setShowConfetti] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [householdName, setHouseholdName] = useState("");

  useEffect(() => {
    // Trigger celebration on mount
    setShowConfetti(true);

    // Fetch user and household info
    async function loadContext() {
      try {
        const [userRes, householdRes] = await Promise.all([
          fetch("/api/user"),
          fetch("/api/household"),
        ]);
        if (userRes.ok) {
          const userData = await userRes.json();
          setDisplayName(userData.full_name?.split(" ")[0] || "");
        }
        if (householdRes.ok) {
          const householdData = await householdRes.json();
          setHouseholdName(householdData.household?.name || "the household");
        }
      } catch {
        // Non-critical
      }
    }
    loadContext();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden p-6">
      <CompletionCelebration
        show={showConfetti}
        onComplete={() => setShowConfetti(false)}
      />

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-crimson-glow opacity-50 pointer-events-none" />

      <div className="w-full max-w-md relative z-10 text-center space-y-8">
        {/* Welcome header */}
        <div className="animate-celebrate-pop">
          <div className="text-6xl mb-4">🏰</div>
          <h1 className="dcc-heading text-3xl tracking-wider text-slate-100">
            Welcome{displayName ? `, ${displayName}` : ""}!
          </h1>
          <p className="mt-3 text-dungeon-500 text-sm font-mono">
            You&apos;re now part of {householdName}.
          </p>
        </div>

        {/* What to do next */}
        <div className="dcc-card p-6 space-y-4 text-left">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider font-mono">
            Here&apos;s how it works
          </h2>

          <div className="space-y-3">
            <WelcomeStep
              number={1}
              title="Browse Tasks"
              description="See shared tasks and claim ones you want to handle."
            />
            <WelcomeStep
              number={2}
              title="Complete a task"
              description="Check it off and earn XP. Yes, there are levels."
            />
            <WelcomeStep
              number={3}
              title="Talk to Zev"
              description="Tap the gold Z button for help, feedback, or to report bugs."
            />
          </div>
        </div>

        {/* CTA buttons */}
        <div className="space-y-3">
          <Link
            href="/welcome/setup"
            className="block w-full dcc-btn-primary py-3 text-base text-center"
          >
            Set Up Your Household
          </Link>
          <Link
            href="/tasks"
            className="block w-full py-3 text-sm text-dungeon-500 hover:text-slate-300 transition-colors font-mono text-center"
          >
            Skip — I&apos;ll explore on my own &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full border border-crimson-700 bg-crimson-900/30 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-crimson-400 font-mono">
          {number}
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-100">{title}</p>
        <p className="text-xs text-dungeon-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
