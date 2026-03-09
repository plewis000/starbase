"use client";

import React, { useState, useCallback } from "react";
import RoutineWeeklyGrid from "@/components/routines/RoutineWeeklyGrid";
import RoutineMonthlyDots from "@/components/routines/RoutineMonthlyDots";
import RoutineTimeline from "@/components/routines/RoutineTimeline";
import RoutineDetail from "@/components/routines/RoutineDetail";

type ViewMode = "grid" | "dots" | "timeline";

export default function RoutinesPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedRoutineId, setSelectedRoutineId] = useState<string | undefined>();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleRoutineUpdated = useCallback(() => {
    setRefreshTrigger((p) => p + 1);
  }, []);

  return (
    <div>
      {/* Desktop */}
      <div className="hidden md:flex h-[calc(100vh-4rem)]">
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-dungeon-800 bg-dungeon-950/80 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-slate-100 tracking-wide">Routines</h1>
              <div className="flex items-center gap-0.5 bg-dungeon-900 border border-dungeon-800 rounded-lg p-0.5">
                {([
                  { key: "grid" as ViewMode, icon: "▦", label: "Grid" },
                  { key: "dots" as ViewMode, icon: "●", label: "Dots" },
                  { key: "timeline" as ViewMode, icon: "═", label: "Timeline" },
                ]).map(({ key, icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setViewMode(key)}
                    title={label}
                    className={`px-2 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
                      viewMode === key
                        ? "bg-red-500 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    <span className="mr-0.5">{icon}</span>
                    <span className="hidden xl:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-auto p-4">
            {viewMode === "grid" && (
              <RoutineWeeklyGrid
                onSelectRoutine={setSelectedRoutineId}
                selectedRoutineId={selectedRoutineId}
                refreshTrigger={refreshTrigger}
              />
            )}
            {viewMode === "dots" && (
              <RoutineMonthlyDots
                onSelectRoutine={setSelectedRoutineId}
                refreshTrigger={refreshTrigger}
              />
            )}
            {viewMode === "timeline" && (
              <RoutineTimeline
                onSelectRoutine={setSelectedRoutineId}
                refreshTrigger={refreshTrigger}
              />
            )}
          </div>
        </div>

        {/* Detail sidebar */}
        {selectedRoutineId && (
          <div className="w-[480px] xl:w-[560px] flex-shrink-0 overflow-y-auto border-l border-dungeon-800 animate-in slide-in-from-right duration-200">
            <RoutineDetail
              routineId={selectedRoutineId}
              onClose={() => setSelectedRoutineId(undefined)}
              onUpdated={handleRoutineUpdated}
            />
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="md:hidden min-h-screen">
        {/* Header */}
        <div className="px-4 py-3 border-b border-dungeon-800 bg-dungeon-950/80 backdrop-blur-sm sticky top-16 z-10">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-100 tracking-wide">Routines</h1>
            <div className="flex items-center gap-0.5 bg-dungeon-900 border border-dungeon-800 rounded-lg p-0.5">
              {([
                { key: "grid" as ViewMode, icon: "▦", label: "Grid" },
                { key: "dots" as ViewMode, icon: "●", label: "Dots" },
                { key: "timeline" as ViewMode, icon: "═", label: "Timeline" },
              ]).map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-2 py-1.5 rounded-md text-sm font-medium transition-all ${
                    viewMode === key
                      ? "bg-red-500 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <span className="mr-0.5">{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-4">
          {viewMode === "grid" && (
            <RoutineWeeklyGrid
              onSelectRoutine={setSelectedRoutineId}
              selectedRoutineId={selectedRoutineId}
              refreshTrigger={refreshTrigger}
            />
          )}
          {viewMode === "dots" && (
            <RoutineMonthlyDots
              onSelectRoutine={setSelectedRoutineId}
              refreshTrigger={refreshTrigger}
            />
          )}
          {viewMode === "timeline" && (
            <RoutineTimeline
              onSelectRoutine={setSelectedRoutineId}
              refreshTrigger={refreshTrigger}
            />
          )}
        </div>

        {/* Mobile detail overlay */}
        {selectedRoutineId && (
          <div
            className="fixed inset-0 z-50 bg-dungeon-950 flex flex-col"
            style={{ animation: "mobileSlideUp 0.3s ease-out" }}
          >
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-dungeon-950/95 backdrop-blur-sm border-b border-dungeon-800">
              <button
                onClick={() => setSelectedRoutineId(undefined)}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-dungeon-400 hover:text-slate-200 hover:bg-dungeon-800 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="text-sm ml-1">Back</span>
              </button>
              <span className="text-sm font-medium text-dungeon-400">Routine Details</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <RoutineDetail
                routineId={selectedRoutineId}
                onClose={() => setSelectedRoutineId(undefined)}
                onUpdated={handleRoutineUpdated}
              />
            </div>
            <style jsx>{`
              @keyframes mobileSlideUp {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
