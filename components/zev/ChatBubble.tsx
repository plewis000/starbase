"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

type Mode = "chat" | "feedback";
type FeedbackType = "bug" | "wish" | "feedback";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  cost_cents?: number;
  free?: boolean;
}

const FEEDBACK_CONFIG: Record<FeedbackType, { label: string; icon: string; placeholder: string }> = {
  bug: { label: "Bug", icon: "🐛", placeholder: "What went wrong?" },
  wish: { label: "Wish", icon: "⭐", placeholder: "What do you wish the app could do?" },
  feedback: { label: "Feedback", icon: "💬", placeholder: "What's on your mind?" },
};

export default function ChatBubble() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Feedback state
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("feedback");
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current && mode === "chat") {
      inputRef.current.focus();
    }
  }, [isOpen, mode]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    const isCommand = text.startsWith("/");

    try {
      const res = await fetch(isCommand ? "/api/commands" : "/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isCommand
            ? { command: text }
            : { message: text, conversation_id: conversationId, channel: "web" }
        ),
      });

      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      if (!isCommand && data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      setMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || data.text || "...",
        timestamp: new Date(),
        cost_cents: isCommand ? undefined : data.cost_cents,
        free: isCommand || data.free,
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Something broke. Try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const submitFeedback = async () => {
    if (!feedbackBody.trim() || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: feedbackType,
          body: feedbackBody.trim(),
          page_url: pathname,
          source: "web_form",
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setFeedbackSubmitted(true);
      setFeedbackBody("");
      setTimeout(() => {
        setMode("chat");
        setFeedbackSubmitted(false);
        setFeedbackType("feedback");
      }, 2000);
    } catch {
      // silently fail
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <>
      {/* Panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 w-[380px] max-h-[520px] bg-dungeon-850 border border-dungeon-700 rounded-2xl shadow-dungeon-lg z-50 flex flex-col overflow-hidden md:bottom-6 md:right-6 md:w-[420px] md:max-h-[600px]">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-dungeon-700 bg-dungeon-900/95">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gold-900/30 flex items-center justify-center text-sm font-bold text-gold-400 border border-gold-800 dcc-glow-gold">
                Z
              </div>
              <div>
                <span className="text-sm font-semibold text-slate-100">Zev</span>
                <span className="text-xs text-dungeon-500 ml-2 font-mono">Household AI</span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {/* Mode toggle */}
              <button
                onClick={() => setMode(mode === "chat" ? "feedback" : "chat")}
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  mode === "feedback"
                    ? "bg-crimson-900/30 text-crimson-400"
                    : "text-dungeon-500 hover:text-slate-100 hover:bg-dungeon-800"
                }`}
                title={mode === "chat" ? "Send feedback" : "Back to chat"}
              >
                {mode === "chat" ? "🐛" : "💬"}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="text-dungeon-500 hover:text-slate-100 p-1 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {mode === "feedback" ? (
            /* Feedback Mode */
            feedbackSubmitted ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-slate-100 font-medium">Got it!</p>
                <p className="text-dungeon-500 text-sm mt-1 font-mono">Logged. Switching back to chat...</p>
              </div>
            ) : (
              <div className="flex flex-col flex-1 p-4 gap-3">
                <div className="text-sm text-slate-100 font-medium">Send Feedback</div>
                {/* Type selector */}
                <div className="flex gap-2">
                  {(Object.entries(FEEDBACK_CONFIG) as [FeedbackType, typeof FEEDBACK_CONFIG[FeedbackType]][]).map(
                    ([type, config]) => (
                      <button
                        key={type}
                        onClick={() => setFeedbackType(type)}
                        className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                          feedbackType === type
                            ? "bg-crimson-900/30 border border-crimson-800 text-crimson-400"
                            : "bg-dungeon-800 border border-dungeon-700 text-dungeon-500 hover:text-slate-100"
                        }`}
                      >
                        {config.icon} {config.label}
                      </button>
                    )
                  )}
                </div>
                <textarea
                  value={feedbackBody}
                  onChange={(e) => setFeedbackBody(e.target.value)}
                  placeholder={FEEDBACK_CONFIG[feedbackType].placeholder}
                  className="dcc-input flex-1 rounded-xl resize-none min-h-[100px] text-sm"
                  autoFocus
                />
                <div className="flex items-center justify-between">
                  <span className="text-dungeon-600 text-xs font-mono">{pathname}</span>
                  <button
                    onClick={submitFeedback}
                    disabled={!feedbackBody.trim() || feedbackSubmitting}
                    className="dcc-btn-primary disabled:opacity-50 disabled:transform-none text-xs px-3 py-2"
                  >
                    {feedbackSubmitting ? "Sending..." : "Submit"}
                  </button>
                </div>
              </div>
            )
          ) : (
            /* Chat Mode */
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2">Z</div>
                    <p className="text-dungeon-500 text-sm">Ask me anything. I&apos;ll try not to be too sarcastic.</p>
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {["/help", "/tasks today", "/stats", "What's on my plate?"].map((q) => (
                        <button
                          key={q}
                          onClick={() => { setInput(q); }}
                          className="px-3 py-1.5 text-xs bg-dungeon-800 border border-dungeon-700 rounded-full text-slate-300 hover:bg-dungeon-700 hover:text-slate-100 transition-colors font-mono"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-crimson-900/30 text-slate-100 rounded-br-md border border-crimson-800/50"
                          : "bg-dungeon-800 text-slate-200 rounded-bl-md border border-dungeon-700"
                      }`}
                    >
                      <div
                        className="whitespace-pre-wrap break-words"
                        dangerouslySetInnerHTML={msg.role === "assistant" ? {
                          __html: msg.content
                            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                            .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                            .replace(/`([^`]+)`/g, '<code class="bg-dungeon-900 px-1 rounded text-gold-400 text-xs">$1</code>')
                        } : undefined}
                      >
                        {msg.role === "user" ? msg.content : undefined}
                      </div>
                      {msg.free && (
                        <div className="text-xs text-emerald-500 mt-1 text-right font-mono">FREE</div>
                      )}
                      {!msg.free && msg.cost_cents !== undefined && msg.cost_cents > 0 && (
                        <div className="text-xs text-dungeon-500 mt-1 text-right font-mono">
                          ${(msg.cost_cents / 100).toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-dungeon-800 border border-dungeon-700 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-dungeon-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 bg-dungeon-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 bg-dungeon-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-dungeon-700 p-3">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Zev..."
                    disabled={loading}
                    className="dcc-input flex-1 rounded-xl disabled:opacity-50"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    className="px-3 py-2.5 bg-gold-500 hover:bg-gold-400 disabled:bg-dungeon-700 disabled:text-dungeon-500 text-dungeon-950 rounded-xl transition-colors font-medium text-sm"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 rounded-full shadow-lg z-50 flex items-center justify-center transition-all duration-200 ${
          isOpen
            ? "bg-dungeon-700 hover:bg-dungeon-600 scale-90"
            : "bg-gold-500 hover:bg-gold-400 hover:scale-105 dcc-glow-gold"
        }`}
      >
        {isOpen ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <span className="text-dungeon-950 font-bold text-xl">Z</span>
        )}
      </button>
    </>
  );
}
