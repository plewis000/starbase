"use client";

import React from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ["n"], desc: "Focus QuickAddBar / New task" },
  { keys: ["?"], desc: "Toggle this shortcut reference" },
  { keys: ["/"], desc: "Open slash commands" },
  { keys: ["j"], desc: "Navigate down" },
  { keys: ["k"], desc: "Navigate up" },
  { keys: ["x"], desc: "Toggle task selection" },
  { keys: ["Esc"], desc: "Clear selection / close panels" },
  { keys: ["Cmd", "Shift", "L"], desc: "Switch to List view" },
  { keys: ["Cmd", "Shift", "B"], desc: "Switch to Board view" },
  { keys: ["Cmd", "Shift", "T"], desc: "Switch to Timeline view" },
  { keys: ["Cmd", "Shift", "G"], desc: "Switch to Gantt view" },
];

export default function KeyboardShortcutOverlay({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-100">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors">
            ✕
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between py-1">
              <span className="text-sm text-slate-300">{s.desc}</span>
              <div className="flex items-center gap-1">
                {s.keys.map((key, j) => (
                  <React.Fragment key={j}>
                    {j > 0 && <span className="text-slate-600 text-xs">+</span>}
                    <kbd className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-300">
                      {key}
                    </kbd>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-slate-600 mt-4 text-center">
          Press <kbd className="px-1 bg-slate-800 border border-slate-700 rounded text-[10px]">?</kbd> to toggle
        </p>
      </div>
    </div>
  );
}
