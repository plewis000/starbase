"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

interface CommandResult {
  type: "navigate" | "create" | "action";
  label: string;
  description?: string;
  icon: string;
  action: () => void;
}

export default function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const toast = useToast();

  // Open with Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Quick-create handlers
  const quickCreateTask = useCallback(async (title: string) => {
    setCreating(true);
    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const defaultStatus = configData.task_statuses?.[0]?.id;

      await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, status_id: defaultStatus }),
      });
      setIsOpen(false);
      router.push("/tasks");
    } catch { toast.error("Failed to create"); }
    setCreating(false);
  }, [router]);

  const quickCreateHabit = useCallback(async (title: string) => {
    setCreating(true);
    try {
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const dailyFreq = configData.habit_frequencies?.find((f: { name: string }) => f.name.toLowerCase() === "daily");

      await fetch("/api/habits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, frequency_id: dailyFreq?.id }),
      });
      setIsOpen(false);
      router.push("/habits");
    } catch { toast.error("Failed to create"); }
    setCreating(false);
  }, [router]);

  const quickAddShopping = useCallback(async (items: string) => {
    setCreating(true);
    try {
      // Get default list
      const listRes = await fetch("/api/shopping");
      const listData = await listRes.json();
      let listId = listData.lists?.[0]?.id;

      if (!listId) {
        const newList = await fetch("/api/shopping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Shopping List" }),
        });
        const nl = await newList.json();
        listId = nl.id;
      }

      const itemNames = items.split(",").map((s) => s.trim()).filter(Boolean);
      for (const name of itemNames) {
        await fetch(`/api/shopping/${listId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
      }
      setIsOpen(false);
      router.push("/shopping");
    } catch { toast.error("Failed to create"); }
    setCreating(false);
  }, [router]);

  // Build results based on query
  const getResults = useCallback((): CommandResult[] => {
    const q = query.toLowerCase().trim();
    const results: CommandResult[] = [];

    // Quick-create shortcuts (highest priority when prefix matches)
    if (q.startsWith("task:") || q.startsWith("t:")) {
      const title = query.replace(/^(task|t):\s*/i, "").trim();
      if (title) {
        results.push({
          type: "create",
          label: `Create task: "${title}"`,
          icon: "📋",
          description: "Creates with default status",
          action: () => quickCreateTask(title),
        });
      }
    }

    if (q.startsWith("habit:") || q.startsWith("h:")) {
      const title = query.replace(/^(habit|h):\s*/i, "").trim();
      if (title) {
        results.push({
          type: "create",
          label: `Create habit: "${title}"`,
          icon: "🔄",
          description: "Creates as daily habit",
          action: () => quickCreateHabit(title),
        });
      }
    }

    if (q.startsWith("shop:") || q.startsWith("s:") || q.startsWith("buy:")) {
      const items = query.replace(/^(shop|s|buy):\s*/i, "").trim();
      if (items) {
        results.push({
          type: "create",
          label: `Add to shopping: ${items}`,
          icon: "🛒",
          description: "Comma-separated for multiple items",
          action: () => quickAddShopping(items),
        });
      }
    }

    // Navigation
    const navItems = [
      { label: "Dashboard", icon: "🏠", path: "/dashboard", keywords: ["home", "overview", "dash"] },
      { label: "Tasks", icon: "📋", path: "/tasks", keywords: ["todo", "task"] },
      { label: "Goals", icon: "🎯", path: "/goals", keywords: ["goal", "objective"] },
      { label: "Habits", icon: "🔄", path: "/habits", keywords: ["habit", "routine", "streak"] },
      { label: "Budget", icon: "💰", path: "/budget", keywords: ["budget", "money", "spend", "finance"] },
      { label: "Shopping", icon: "🛒", path: "/shopping", keywords: ["shop", "grocery", "list", "buy"] },
      { label: "Notifications", icon: "🔔", path: "/notifications", keywords: ["notification", "alert", "bell"] },
      { label: "Admin", icon: "⚙️", path: "/admin", keywords: ["admin", "config", "setting"] },
    ];

    for (const item of navItems) {
      if (!q || item.label.toLowerCase().includes(q) || item.keywords.some((k) => k.includes(q))) {
        results.push({
          type: "navigate",
          label: item.label,
          icon: item.icon,
          description: `Go to ${item.label}`,
          action: () => { router.push(item.path); setIsOpen(false); },
        });
      }
    }

    // Quick-create hints (show when no prefix typed)
    if (!q || "create".includes(q) || "new".includes(q) || "add".includes(q)) {
      if (!q.startsWith("task:") && !q.startsWith("t:")) {
        results.push({
          type: "create",
          label: "Create task...",
          icon: "➕",
          description: 'Type "task: Buy groceries" to quick-create',
          action: () => { setQuery("task: "); },
        });
      }
      if (!q.startsWith("shop:") && !q.startsWith("s:") && !q.startsWith("buy:")) {
        results.push({
          type: "create",
          label: "Add to shopping...",
          icon: "🛒",
          description: 'Type "shop: milk, eggs, bread"',
          action: () => { setQuery("shop: "); },
        });
      }
    }

    return results.slice(0, 8);
  }, [query, quickCreateTask, quickCreateHabit, quickAddShopping, router]);

  const results = getResults();

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      results[selectedIndex].action();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[90%] max-w-[560px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-[70] overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500 flex-shrink-0">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-slate-100 placeholder-slate-500 text-sm focus:outline-none"
            disabled={creating}
          />
          <kbd className="hidden sm:inline-block px-2 py-0.5 text-xs bg-slate-800 text-slate-400 rounded border border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-2">
          {creating ? (
            <div className="px-4 py-6 text-center text-slate-400 text-sm">Creating...</div>
          ) : results.length === 0 ? (
            <div className="px-4 py-6 text-center text-slate-500 text-sm">
              No results. Try &quot;task: Buy milk&quot; or &quot;shop: eggs, bread&quot;
            </div>
          ) : (
            results.map((result, index) => (
              <button
                key={`${result.type}-${result.label}-${index}`}
                onClick={result.action}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  index === selectedIndex ? "bg-slate-800" : "hover:bg-slate-800/50"
                }`}
              >
                <span className="text-lg flex-shrink-0">{result.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-100 truncate">{result.label}</div>
                  {result.description && (
                    <div className="text-xs text-slate-500 truncate">{result.description}</div>
                  )}
                </div>
                {result.type === "create" && (
                  <span className="text-xs bg-green-600/20 text-green-400 px-2 py-0.5 rounded flex-shrink-0">
                    Create
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="border-t border-slate-800 px-4 py-2 flex items-center gap-4 text-xs text-slate-500">
          <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">↑↓</kbd> navigate</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">↵</kbd> select</span>
          <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 border border-slate-700">esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}
