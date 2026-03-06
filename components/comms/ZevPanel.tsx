"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  cost_cents?: number;
}

export default function ZevPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [resumedConversation, setResumedConversation] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load most recent web conversation on mount (within 2 hours)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const recent = (data.conversations || []).find(
          (c: { channel: string; last_message_at: string }) =>
            c.channel === "web" &&
            new Date(c.last_message_at).getTime() > twoHoursAgo,
        );
        if (recent) {
          setConversationId(recent.id);
          setResumedConversation(true);
          fetch(`/api/agent?conversation_id=${recent.id}`)
            .then((r) => r.json())
            .then((d) => {
              if (cancelled) return;
              const loaded = (d.messages || [])
                .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
                .map((m: { role: string; content: string; created_at: string; cost_cents?: number }, i: number) => ({
                  id: `history-${i}`,
                  role: m.role as "user" | "assistant",
                  content: m.content,
                  timestamp: new Date(m.created_at),
                  cost_cents: m.cost_cents,
                }));
              setMessages(loaded);
            });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 100) + "px";
    }
  }, [input]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    setConversationId(null);
    setResumedConversation(false);
  }, []);

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

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          channel: "web",
        }),
      });

      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();

      if (data.conversation_id && !conversationId) {
        setConversationId(data.conversation_id);
      }

      setMessages((prev) => [...prev, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response || data.text || "...",
        timestamp: new Date(),
        cost_cents: data.cost_cents,
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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-slate-800">
        <div className="w-7 h-7 rounded-full bg-amber-600/20 flex items-center justify-center text-xs font-bold text-amber-400">
          Z
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-100">Zev</p>
          <p className="text-[10px] text-slate-500">AI Assistant</p>
        </div>
        {(messages.length > 0 || resumedConversation) && (
          <button
            onClick={startNewChat}
            className="text-[10px] text-slate-500 hover:text-slate-300 px-2 py-1 rounded border border-slate-700 hover:border-slate-600 transition-colors"
          >
            New Chat
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-amber-600/20 flex items-center justify-center text-lg font-bold text-amber-400 mx-auto mb-3">
              Z
            </div>
            <p className="text-sm text-slate-400">Ask Zev anything</p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
              msg.role === "user"
                ? "bg-green-600/20 text-green-100"
                : "bg-slate-800 text-slate-200"
            }`}>
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask Zev..."
            disabled={loading}
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 disabled:opacity-50 resize-none"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="px-3 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded-lg transition-colors self-end"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
