"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface SlashCommand {
  command: string;
  label: string;
  description: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSwitchView?: (view: string) => void;
  onCreateTask?: () => void;
}

export default function SlashCommandMenu({ isOpen, onClose, onSwitchView, onCreateTask }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: SlashCommand[] = [
    { command: "/task", label: "New Task", description: "Create a new task", action: () => { onCreateTask?.(); onClose(); } },
    { command: "/list", label: "List View", description: "Switch to list view", action: () => { onSwitchView?.("list"); onClose(); } },
    { command: "/board", label: "Board View", description: "Switch to board view", action: () => { onSwitchView?.("board"); onClose(); } },
    { command: "/timeline", label: "Timeline View", description: "Switch to timeline view", action: () => { onSwitchView?.("timeline"); onClose(); } },
    { command: "/gantt", label: "Gantt View", description: "Switch to Gantt chart", action: () => { onSwitchView?.("gantt"); onClose(); } },
    { command: "/filter:overdue", label: "Overdue Tasks", description: "Filter to overdue tasks", action: () => { onClose(); } },
    { command: "/chat", label: "Chat with Zev", description: "Open AI assistant", action: () => { router.push("/chat"); onClose(); } },
    { command: "/settings", label: "Settings", description: "Open settings page", action: () => { router.push("/settings"); onClose(); } },
    { command: "/goals", label: "Goals", description: "Open goals page", action: () => { router.push("/goals"); onClose(); } },
    { command: "/habits", label: "Habits", description: "Open habits page", action: () => { router.push("/habits"); onClose(); } },
  ];

  const filtered = commands.filter(
    (c) => c.command.includes(search.toLowerCase()) || c.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh] bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-slate-800">
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-500">No commands found</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.command}
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-colors ${
                  i === selectedIndex ? "bg-slate-800" : "hover:bg-slate-800/50"
                }`}
              >
                <span className="text-xs font-mono text-red-400/70 w-24 flex-shrink-0">{cmd.command}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200">{cmd.label}</p>
                  <p className="text-[10px] text-slate-500">{cmd.description}</p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
