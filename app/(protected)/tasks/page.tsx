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
      <div className="hidden lg:flex h-[calc(100vh-4rem)]">
        <div className="flex-1 overflow-hidden">
          <ActivityTaskBoard
            onSelectTask={handleSelectTask}
            refreshTrigger={refreshTrigger}
            onCreateTask={() => setShowCreateModal(true)}
          />
        </div>

        {/* Task detail slide-over panel */}
        {selectedTaskId && (
          <div className="w-[480px] flex-shrink-0 overflow-y-auto border-l border-slate-800 animate-in slide-in-from-right duration-200">
            <TaskDetail
              taskId={selectedTaskId}
              onClose={handleCloseTaskDetail}
              onTaskUpdated={handleTaskUpdated}
            />
          </div>
        )}
      </div>

      {/* Mobile layout: Full screen board with modal detail */}
      <div className="lg:hidden h-[calc(100vh-4rem)]">
        <ActivityTaskBoard
          onSelectTask={handleSelectTask}
          refreshTrigger={refreshTrigger}
          onCreateTask={() => setShowCreateModal(true)}
        />

        {/* Mobile task detail modal */}
        {selectedTaskId && (
          <Modal
            isOpen={true}
            onClose={handleCloseTaskDetail}
            title=""
            size="lg"
          >
            <TaskDetail
              taskId={selectedTaskId}
              onClose={handleCloseTaskDetail}
              onTaskUpdated={handleTaskUpdated}
            />
          </Modal>
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
