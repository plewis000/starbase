"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";

type Tab = "chat" | "commands" | "feedback";
type FeedbackType = "bug" | "wish" | "feedback";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  cost_cents?: number;
}

const FEEDBACK_CONFIG: Record<FeedbackType, { label: string; icon: string; placeholder: string }> = {
  bug: { label: "Bug", icon: "🐛", placeholder: "What went wrong?" },
  wish: { label: "Wish", icon: "⭐", placeholder: "What do you wish the app could do?" },
  feedback: { label: "Feedback", icon: "💬", placeholder: "What's on your mind?" },
};

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "chat", label: "Chat", icon: "Z" },
  { key: "commands", label: "Commands", icon: ">_" },
  { key: "feedback", label: "Feedback", icon: "!" },
];

export default function ChatBubble() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  // Chat state
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Command state
  const [cmdMessages, setCmdMessages] = useState<Message[]>([]);
  const [cmdInput, setCmdInput] = useState("");
  const [cmdLoading, setCmdLoading] = useState(false);
  const cmdEndRef = useRef<HTMLDivElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Feedback state
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("feedback");
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  // Scroll helpers
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);
  useEffect(() => { cmdEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [cmdMessages]);

  // Focus input on tab switch
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "chat") chatInputRef.current?.focus();
    if (activeTab === "commands") cmdInputRef.current?.focus();
  }, [isOpen, activeTab]);

  // Escape to close
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // --- Chat (Zev AI) ---
  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;

    setChatMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversation_id: conversationId, channel: "web" }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      if (data.conversation_id && !conversationId) setConversationId(data.conversation_id);

      setChatMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || data.text || "...",
        timestamp: new Date(),
        cost_cents: data.cost_cents,
      }]);
    } catch {
      setChatMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "Something broke. Try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, conversationId]);

  // --- Commands (free) ---
  const sendCommand = useCallback(async () => {
    let text = cmdInput.trim();
    if (!text || cmdLoading) return;

    // Auto-prefix with / if missing
    if (!text.startsWith("/")) text = `/${text}`;

    setCmdMessages((prev) => [...prev, {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date(),
    }]);
    setCmdInput("");
    setCmdLoading(true);

    try {
      const res = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: text }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      setCmdMessages((prev) => [...prev, {
        id: `system-${Date.now()}`,
        role: "system",
        content: data.response || "No response.",
        timestamp: new Date(),
      }]);
    } catch {
      setCmdMessages((prev) => [...prev, {
        id: `error-${Date.now()}`,
        role: "system",
        content: "Command failed. Try again.",
        timestamp: new Date(),
      }]);
    } finally {
      setCmdLoading(false);
    }
  }, [cmdInput, cmdLoading]);

  // --- Feedback ---
  const submitFeedback = async () => {
    if (!feedbackBody.trim() || feedbackSubmitting) return;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      setFeedbackSubmitted(true);
      setFeedbackBody("");
      setTimeout(() => {
        setFeedbackSubmitted(false);
        setFeedbackType("feedback");
      }, 3000);
    } catch (err) {
      setFeedbackError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  // Shared markdown renderer
  const renderMarkdown = (content: string, variant: "ai" | "system") => {
    const codeClass = variant === "system"
      ? "bg-dungeon-800 px-1 rounded text-emerald-400 text-xs"
      : "bg-dungeon-900 px-1 rounded text-gold-400 text-xs";
    const boldTag = variant === "system"
      ? '<span class="text-slate-100 font-semibold">$1</span>'
      : "<strong>$1</strong>";
    return content
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, boldTag)
      .replace(/`([^`]+)`/g, `<code class="${codeClass}">$1</code>`);
  };

  // Loading dots component
  const LoadingDots = ({ variant }: { variant: "ai" | "system" }) => (
    <div className="flex justify-start">
      <div className={`rounded-2xl rounded-bl-md px-4 py-3 border ${
        variant === "system"
          ? "bg-dungeon-900 border-emerald-900/40"
          : "bg-dungeon-800 border-dungeon-700"
      }`}>
        <div className="flex gap-1.5">
          {[0, 150, 300].map((delay) => (
            <div key={delay} className={`w-2 h-2 rounded-full animate-bounce ${
              variant === "system" ? "bg-emerald-600" : "bg-dungeon-500"
            }`} style={{ animationDelay: `${delay}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );

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
            <button
              onClick={() => setIsOpen(false)}
              className="text-dungeon-500 hover:text-slate-100 p-1 transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-dungeon-700 bg-dungeon-900/60">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-xs font-medium transition-all relative ${
                  activeTab === tab.key
                    ? "text-slate-100"
                    : "text-dungeon-500 hover:text-slate-300"
                }`}
              >
                <span className={`mr-1.5 font-mono ${
                  activeTab === tab.key
                    ? tab.key === "commands" ? "text-emerald-400" : tab.key === "feedback" ? "text-crimson-400" : "text-gold-400"
                    : ""
                }`}>{tab.icon}</span>
                {tab.label}
                {activeTab === tab.key && (
                  <div className={`absolute bottom-0 left-2 right-2 h-0.5 rounded-full ${
                    tab.key === "commands" ? "bg-emerald-500" : tab.key === "feedback" ? "bg-crimson-500" : "bg-gold-500"
                  }`} />
                )}
              </button>
            ))}
          </div>

          {/* === Chat Tab === */}
          {activeTab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
                {chatMessages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="text-3xl mb-2">Z</div>
                    <p className="text-dungeon-500 text-sm">Ask me anything. I&apos;ll try not to be too sarcastic.</p>
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {["What's on my plate?", "Create a task", "How's my budget?"].map((q) => (
                        <button
                          key={q}
                          onClick={() => setChatInput(q)}
                          className="px-3 py-1.5 text-xs bg-dungeon-800 border border-dungeon-700 rounded-full text-slate-300 hover:bg-dungeon-700 hover:text-slate-100 transition-colors font-mono"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {chatMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-crimson-900/30 text-slate-100 rounded-br-md border border-crimson-800/50"
                        : "bg-dungeon-800 text-slate-200 rounded-bl-md border border-dungeon-700"
                    }`}>
                      <div
                        className="whitespace-pre-wrap break-words"
                        dangerouslySetInnerHTML={msg.role === "assistant" ? { __html: renderMarkdown(msg.content, "ai") } : undefined}
                      >
                        {msg.role === "user" ? msg.content : undefined}
                      </div>
                      {msg.cost_cents !== undefined && msg.cost_cents > 0 && (
                        <div className="text-xs text-dungeon-500 mt-1 text-right font-mono">
                          ${(msg.cost_cents / 100).toFixed(4)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {chatLoading && <LoadingDots variant="ai" />}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="border-t border-dungeon-700 p-3">
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                    placeholder="Ask Zev..."
                    disabled={chatLoading}
                    className="dcc-input flex-1 rounded-xl disabled:opacity-50"
                  />
                  <button
                    onClick={sendChat}
                    disabled={!chatInput.trim() || chatLoading}
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

          {/* === Commands Tab === */}
          {activeTab === "commands" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
                {cmdMessages.length === 0 && (
                  <div className="text-center py-6">
                    <div className="text-2xl mb-2 font-mono text-emerald-500">{">_"}</div>
                    <p className="text-dungeon-500 text-sm">Free commands. No AI cost.</p>
                    <p className="text-dungeon-600 text-xs mt-1 font-mono">Type a command or tap one below</p>
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">
                      {["/help", "/tasks today", "/stats", "/streak", "/budget"].map((q) => (
                        <button
                          key={q}
                          onClick={() => { setCmdInput(q); }}
                          className="px-3 py-1.5 text-xs bg-dungeon-900 border border-emerald-900/30 rounded-full text-emerald-400 hover:bg-dungeon-800 hover:text-emerald-300 transition-colors font-mono"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {cmdMessages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "system" ? (
                      <div className="w-full rounded-xl bg-dungeon-900 border border-emerald-900/40 px-4 py-3 text-sm leading-relaxed font-mono">
                        <div
                          className="whitespace-pre-wrap break-words text-slate-300"
                          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content, "system") }}
                        />
                        <div className="text-xs text-emerald-600 mt-1.5 text-right">FREE</div>
                      </div>
                    ) : (
                      <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-emerald-900/20 text-emerald-200 rounded-br-md border border-emerald-900/30 font-mono">
                        {msg.content}
                      </div>
                    )}
                  </div>
                ))}

                {cmdLoading && <LoadingDots variant="system" />}
                <div ref={cmdEndRef} />
              </div>

              {/* Command Input */}
              <div className="border-t border-dungeon-700 p-3">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-mono text-sm">/</span>
                    <input
                      ref={cmdInputRef}
                      type="text"
                      value={cmdInput}
                      onChange={(e) => setCmdInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCommand(); } }}
                      placeholder="help, tasks, budget..."
                      disabled={cmdLoading}
                      className="dcc-input w-full rounded-xl disabled:opacity-50 pl-7 font-mono"
                    />
                  </div>
                  <button
                    onClick={sendCommand}
                    disabled={!cmdInput.trim() || cmdLoading}
                    className="px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-dungeon-700 disabled:text-dungeon-500 text-white rounded-xl transition-colors font-medium text-sm font-mono"
                  >
                    Run
                  </button>
                </div>
              </div>
            </>
          )}

          {/* === Feedback Tab === */}
          {activeTab === "feedback" && (
            feedbackSubmitted ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-3">✅</div>
                <p className="text-slate-100 font-medium">Got it!</p>
                <p className="text-dungeon-500 text-sm mt-1 font-mono">Logged. Thanks for the feedback.</p>
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
                {feedbackError && (
                  <div className="text-xs text-crimson-400 bg-crimson-900/20 border border-crimson-800/30 rounded-lg px-3 py-2">
                    {feedbackError}
                  </div>
                )}
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
