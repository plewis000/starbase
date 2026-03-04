"use client";

import React, { useState } from "react";
import ActivityTaskBoard from "@/components/activity/ActivityTaskBoard";
import TaskDetail from "@/components/tasks/TaskDetail";
import Modal from "@/components/ui/Modal";
import TaskForm from "@/components/tasks/TaskForm";
import { Task } from "@/lib/types";

export default function TasksPage() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  return (
    <div>
      {/* Desktop layout: Board + detail sidebar */}
      <div className="hidden lg:flex h-[calc(100vh-4rem)]">
        <div className="flex-1 overflow-hidden">
          <ActivityTaskBoard
            onSelectTask={handleSelectTask}
            refreshTrigger={refreshTrigger}
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

      {/* Create task modal (kept for standalone creation) */}
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
    </div>
  );
}
