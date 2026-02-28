// ============================================================
// FILE: components/FeedbackButton.tsx
// PURPOSE: Floating feedback button — always visible on every page
//          Opens a minimal modal: type (bug/wish/feedback) + free text
//          Auto-captures page URL. Minimal friction.
// PART OF: Desperado Club
// ============================================================

"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";

type FeedbackType = "bug" | "wish" | "feedback";

const TYPE_CONFIG: Record<FeedbackType, { label: string; icon: string; placeholder: string }> = {
  bug: {
    label: "Bug",
    icon: "🐛",
    placeholder: "What went wrong? What did you expect to happen?",
  },
  wish: {
    label: "Wish",
    icon: "⭐",
    placeholder: "What do you wish the app could do?",
  },
  feedback: {
    label: "Feedback",
    icon: "💬",
    placeholder: "What's on your mind?",
  },
};

export default function FeedbackButton() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<FeedbackType>("feedback");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!body.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: selectedType,
          body: body.trim(),
          page_url: pathname,
          source: "web_form",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      setSubmitted(true);
      setBody("");

      // Auto-close after 2 seconds
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setSelectedType("feedback");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setBody("");
    setError(null);
    setSubmitted(false);
    setSelectedType("feedback");
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-30 w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 hover:border-red-500/50 hover:bg-zinc-700 text-zinc-400 hover:text-white shadow-lg transition-all flex items-center justify-center group"
        title="Send feedback"
      >
        <span className="text-lg group-hover:scale-110 transition-transform">💬</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60"
            onClick={handleClose}
          />

          {/* Modal content */}
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden">
            {submitted ? (
              // Success state
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-white font-medium">Got it!</p>
                <p className="text-zinc-400 text-sm mt-1">
                  {selectedType === "bug" ? "Bug logged. We'll look into it." :
                   selectedType === "wish" ? "Wish captured." :
                   "Thanks for the feedback!"}
                </p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                  <h3 className="text-white font-medium">Send Feedback</h3>
                  <button
                    onClick={handleClose}
                    className="text-zinc-500 hover:text-white text-xl leading-none"
                  >
                    ×
                  </button>
                </div>

                {/* Type selector */}
                <div className="flex gap-2 p-4 pb-2">
                  {(Object.entries(TYPE_CONFIG) as [FeedbackType, typeof TYPE_CONFIG[FeedbackType]][]).map(
                    ([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                          selectedType === type
                            ? "bg-red-600/20 border border-red-500/50 text-red-400"
                            : "bg-zinc-800 border border-zinc-700 text-zinc-400 hover:border-zinc-600"
                        }`}
                      >
                        {config.icon} {config.label}
                      </button>
                    )
                  )}
                </div>

                {/* Body input */}
                <div className="px-4 pb-2">
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder={TYPE_CONFIG[selectedType].placeholder}
                    className="w-full h-28 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-red-500/50 resize-none"
                    autoFocus
                  />
                </div>

                {/* Error */}
                {error && (
                  <div className="px-4 pb-2">
                    <p className="text-red-400 text-xs">{error}</p>
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between p-4 pt-2 border-t border-zinc-800">
                  <span className="text-zinc-600 text-xs">
                    Page: {pathname}
                  </span>
                  <button
                    onClick={handleSubmit}
                    disabled={!body.trim() || submitting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {submitting ? "Sending..." : "Submit"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
