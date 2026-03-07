"use client";

import React, { useState, useRef } from "react";
import ActivityTaskBoard from "@/components/activity/ActivityTaskBoard";
import TaskDetail from "@/components/tasks/TaskDetail";
import Modal from "@/components/ui/Modal";
import TaskForm from "@/components/tasks/TaskForm";
import KeyboardShortcutOverlay from "@/components/ui/KeyboardShortcutOverlay";
import SlashCommandMenu from "@/components/ui/SlashCommandMenu";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Task } from "@/lib/types";

export default function TasksPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [viewMode, setViewMode] = useState<string>("list");
  const boardRef = useRef<{ switchView?: (v: string) => void }>(null);

  const handleSelectTask = (id: string) => {
    setSelectedTaskId(id);
  };

  const handleCloseTaskDetail = () => {
    setSelectedTaskId(undefined);
  };

  const handleTaskCreated = (newTask: Task) => {
    setShowCreateModal(false);
    setSelectedTaskId(newTask.id);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleTaskUpdated = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  useKeyboardShortcuts({
    onNewTask: () => {
      // Focus the QuickAddBar input
      const input = document.querySelector('input[placeholder*="Quick add"]') as HTMLInputElement;
      if (input) input.focus();
      else setShowCreateModal(true);
    },
    onToggleShortcuts: () => setShowShortcuts((prev) => !prev),
    onSlashCommand: () => setShowSlashMenu(true),
    onEscape: () => {
      if (showShortcuts) setShowShortcuts(false);
      else if (showSlashMenu) setShowSlashMenu(false);
      else if (selectedTaskId) setSelectedTaskId(undefined);
    },
    onSwitchView: (view) => setViewMode(view),
  });

  return (
    <div>
      {/* Desktop layout: Board + detail sidebar */}
      <div className="hidden md:flex h-[calc(100vh-4rem)]">
        <div className="flex-1 min-w-0 overflow-hidden">
          <ActivityTaskBoard
            onSelectTask={handleSelectTask}
            refreshTrigger={refreshTrigger}
            onCreateTask={() => setShowCreateModal(true)}
          />
        </div>

        {/* Task detail slide-over panel — shrinks on smaller desktops */}
        {selectedTaskId && (
          <div className="w-[360px] xl:w-[480px] flex-shrink-0 overflow-y-auto border-l border-dungeon-800 animate-in slide-in-from-right duration-200">
            <TaskDetail
              taskId={selectedTaskId}
              onClose={handleCloseTaskDetail}
              onTaskUpdated={handleTaskUpdated}
            />
          </div>
        )}
      </div>

      {/* Mobile layout: Full screen board with full-screen task detail */}
      <div className="md:hidden h-[calc(100vh-4rem)]">
        <ActivityTaskBoard
          onSelectTask={handleSelectTask}
          refreshTrigger={refreshTrigger}
          onCreateTask={() => setShowCreateModal(true)}
        />

        {/* Mobile task detail — full-screen slide-up panel */}
        {selectedTaskId && (
          <div
            className="fixed inset-0 z-50 bg-dungeon-950 flex flex-col"
            style={{ animation: "mobileSlideUp 0.3s ease-out" }}
          >
            <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-dungeon-950/95 backdrop-blur-sm border-b border-dungeon-800">
              <button
                onClick={handleCloseTaskDetail}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-dungeon-400 hover:text-slate-200 hover:bg-dungeon-800 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                <span className="text-sm ml-1">Back</span>
              </button>
              <span className="text-sm font-medium text-dungeon-400">Task Details</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <TaskDetail
                taskId={selectedTaskId}
                onClose={handleCloseTaskDetail}
                onTaskUpdated={handleTaskUpdated}
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

      {/* Create task modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Task"
        size="lg"
      >
        <TaskForm
          onSave={handleTaskCreated}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* Keyboard shortcut overlay */}
      <KeyboardShortcutOverlay
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* Slash command menu */}
      <SlashCommandMenu
        isOpen={showSlashMenu}
        onClose={() => setShowSlashMenu(false)}
        onCreateTask={() => setShowCreateModal(true)}
      />
    </div>
  );
}
