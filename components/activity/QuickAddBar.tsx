"use client";

import React, { useState, useRef, useMemo } from "react";

// NLP date extraction from task title
function parseQuickAddDate(input: string): { title: string; dueDate: string | null } {
  const today = new Date();
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  const patterns: [RegExp, () => Date][] = [
    [/\b(today)\b/i, () => today],
    [/\b(tonight)\b/i, () => today],
    [/\b(tomorrow)\b/i, () => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }],
    ...dayNames.map((day, i) => [
      new RegExp(`\\b(${day})\\b`, "i"),
      () => {
        const d = new Date(today);
        const diff = (i - today.getDay() + 7) % 7 || 7;
        d.setDate(d.getDate() + diff);
        return d;
      },
    ] as [RegExp, () => Date]),
  ];

  for (const [pattern, getDate] of patterns) {
    if (pattern.test(input)) {
      const title = input.replace(pattern, "").replace(/\s+/g, " ").trim();
      const date = getDate();
      const dueDate = date.toISOString().split("T")[0];
      return { title: title || input, dueDate };
    }
  }

  return { title: input, dueDate: null };
}

interface ParsedToken {
  type: "priority" | "assignee" | "tag" | "recurrence";
  raw: string;
  value: string;
  resolvedId?: string;
}

interface ConfigData {
  statuses?: { id: string; name: string }[];
  priorities?: { id: string; name: string }[];
  members?: { user_id: string; display_name?: string; user?: { full_name: string } | null }[];
  tags?: { id: string; name: string }[];
  [key: string]: any;
}

function parseTokens(input: string, config?: ConfigData | null): { cleanTitle: string; tokens: ParsedToken[] } {
  const tokens: ParsedToken[] = [];
  let remaining = input;

  // Parse !priority (e.g., !high, !urgent, !medium, !low)
  const priorityMatch = remaining.match(/\!(\w+)/g);
  if (priorityMatch) {
    for (const match of priorityMatch) {
      const val = match.slice(1).toLowerCase();
      const priorityNames = config?.priorities?.map(p => p.name.toLowerCase()) || [];
      if (priorityNames.includes(val)) {
        const resolved = config?.priorities?.find(
          (p) => p.name.toLowerCase() === val
        );
        tokens.push({
          type: "priority",
          raw: match,
          value: val,
          resolvedId: resolved?.id,
        });
        remaining = remaining.replace(match, "");
      }
    }
  }

  // Parse @name (e.g., @parker)
  const assigneeMatches = remaining.match(/@(\w+)/g);
  if (assigneeMatches) {
    for (const match of assigneeMatches) {
      const name = match.slice(1).toLowerCase();
      const member = config?.members?.find(
        (m) =>
          m.display_name?.toLowerCase().includes(name) ||
          m.user?.full_name?.toLowerCase().includes(name)
      );
      tokens.push({
        type: "assignee",
        raw: match,
        value: name,
        resolvedId: member?.user_id,
      });
      remaining = remaining.replace(match, "");
    }
  }

  // Parse #tag (e.g., #backend, #frontend)
  const tagMatches = remaining.match(/#(\w+)/g);
  if (tagMatches) {
    for (const match of tagMatches) {
      const tagName = match.slice(1).toLowerCase();
      const tag = (config?.tags as { id: string; name: string }[] | undefined)?.find(
        (t) => t.name.toLowerCase() === tagName
      );
      tokens.push({
        type: "tag",
        raw: match,
        value: tagName,
        resolvedId: tag?.id,
      });
      remaining = remaining.replace(match, "");
    }
  }

  const cleanTitle = remaining.replace(/\s+/g, " ").trim();
  return { cleanTitle, tokens };
}

const TOKEN_COLORS: Record<string, string> = {
  priority: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  assignee: "bg-blue-500/20 text-blue-300 border-blue-500/40",
  tag: "bg-purple-500/20 text-purple-300 border-purple-500/40",
  recurrence: "bg-green-500/20 text-green-300 border-green-500/40",
};

interface QuickAddBarProps {
  onAdd: (title: string, dueDate?: string, extra?: { priority_id?: string; assigned_to?: string; tag_ids?: string[] }) => Promise<boolean>;
  config?: ConfigData | null;
  onOpenFullForm?: () => void;
}

export default function QuickAddBar({ onAdd, config, onOpenFullForm }: QuickAddBarProps) {
  const [value, setValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<"success" | "error" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => {
    if (!value.trim()) return null;
    const { cleanTitle, tokens } = parseTokens(value.trim(), config);
    const { title, dueDate } = parseQuickAddDate(cleanTitle);
    return { title, dueDate, tokens };
  }, [value, config]);

  const handleSubmit = async () => {
    if (!value.trim() || adding || !parsed) return;

    setAdding(true);

    const extra: { priority_id?: string; assigned_to?: string; tag_ids?: string[] } = {};
    for (const token of parsed.tokens) {
      if (token.type === "priority" && token.resolvedId) extra.priority_id = token.resolvedId;
      if (token.type === "assignee" && token.resolvedId) extra.assigned_to = token.resolvedId;
      if (token.type === "tag" && token.resolvedId) {
        extra.tag_ids = extra.tag_ids || [];
        extra.tag_ids.push(token.resolvedId);
      }
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const ok = await onAdd(parsed.title, parsed.dueDate || todayStr, extra);

    if (ok) {
      setValue("");
      setFlash("success");
    } else {
      setFlash("error");
    }

    setTimeout(() => setFlash(null), 1500);
    setAdding(false);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-1">
      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder='Quick add — "Fix bug !high @parker tomorrow #backend"'
            disabled={adding}
            className={`w-full bg-dungeon-900/80 border rounded-lg px-4 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none transition-all disabled:opacity-50 ${
              flash === "success"
                ? "border-green-500/50 ring-1 ring-green-500/20"
                : flash === "error"
                ? "border-red-500/50 ring-1 ring-red-500/20"
                : "border-dungeon-800 focus:border-crimson-500/50 focus:ring-1 focus:ring-crimson-500/20"
            }`}
          />
          {/* Detected date hint */}
          {parsed?.dueDate && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-400/70 font-mono pointer-events-none">
              {parsed.dueDate}
            </span>
          )}
        </div>
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || adding}
          className="px-3 py-2 bg-crimson-600 hover:bg-crimson-500 disabled:bg-dungeon-800 disabled:text-slate-600 text-white text-sm font-medium rounded-lg transition-all flex-shrink-0"
        >
          {adding ? "..." : "Add"}
        </button>
        {onOpenFullForm && (
          <button
            onClick={onOpenFullForm}
            type="button"
            className="px-2 py-2 text-dungeon-400 hover:text-slate-200 text-sm transition-colors flex-shrink-0"
            title="Open full task form"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Parsed token pills */}
      {parsed && parsed.tokens.length > 0 && (
        <div className="flex gap-1.5 flex-wrap px-1">
          {parsed.tokens.map((token, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${TOKEN_COLORS[token.type]}`}
            >
              {token.type === "priority" && "!"}
              {token.type === "assignee" && "@"}
              {token.type === "tag" && "#"}
              {token.value}
              {!token.resolvedId && <span className="ml-1 text-slate-500">?</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
