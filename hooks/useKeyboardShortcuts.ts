"use client";

import { useEffect, useCallback } from "react";

interface ShortcutConfig {
  onNewTask?: () => void;
  onToggleShortcuts?: () => void;
  onSlashCommand?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onToggleSelect?: () => void;
  onEscape?: () => void;
  onSwitchView?: (view: string) => void;
}

export function useKeyboardShortcuts(config: ShortcutConfig) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInputFocused = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;

    // Always-active shortcuts
    if (e.key === "Escape") {
      config.onEscape?.();
      return;
    }

    // Meta/Ctrl shortcuts work regardless of focus
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey) {
      switch (e.key.toUpperCase()) {
        case "L": e.preventDefault(); config.onSwitchView?.("list"); return;
        case "B": e.preventDefault(); config.onSwitchView?.("board"); return;
        case "T": e.preventDefault(); config.onSwitchView?.("timeline"); return;
        case "G": e.preventDefault(); config.onSwitchView?.("gantt"); return;
      }
    }

    // Don't handle single-key shortcuts when input is focused
    if (isInputFocused) return;

    switch (e.key) {
      case "n":
        e.preventDefault();
        config.onNewTask?.();
        break;
      case "?":
        e.preventDefault();
        config.onToggleShortcuts?.();
        break;
      case "/":
        e.preventDefault();
        config.onSlashCommand?.();
        break;
      case "j":
        e.preventDefault();
        config.onNavigateDown?.();
        break;
      case "k":
        e.preventDefault();
        config.onNavigateUp?.();
        break;
      case "x":
        e.preventDefault();
        config.onToggleSelect?.();
        break;
    }
  }, [config]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
