"use client";

import React from "react";

interface Tab {
  id: string;
  label: string;
  icon?: string;
  count?: number;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  variant?: "pill" | "underline";
}

export default function TabBar({
  tabs,
  activeTab,
  onTabChange,
  variant = "pill",
}: TabBarProps) {
  if (variant === "underline") {
    return (
      <div className="flex gap-1 border-b border-dungeon-700">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors relative ${
                isActive
                  ? "text-crimson-400"
                  : "text-dungeon-500 hover:text-slate-100"
              }`}
            >
              <span className="flex items-center gap-2">
                {tab.icon && <span>{tab.icon}</span>}
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                      isActive
                        ? "bg-crimson-900/30 text-crimson-400"
                        : "bg-dungeon-800 text-dungeon-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
              {isActive && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-crimson-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // Pill variant (default)
  return (
    <div className="dcc-card inline-flex p-1 gap-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
              isActive
                ? "bg-dungeon-800 text-crimson-400 shadow-sm"
                : "text-dungeon-500 hover:text-slate-100 hover:bg-dungeon-800/50"
            }`}
          >
            <span className="flex items-center gap-2">
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-mono ${
                    isActive
                      ? "bg-crimson-900/30 text-crimson-400"
                      : "bg-dungeon-700 text-dungeon-500"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
