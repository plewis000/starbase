"use client";

import React, { useState } from "react";
import TaskList from "@/components/tasks/TaskList";
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

  const handleCreateTask = () => {
    setShowCreateModal(true);
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
    <div className="min-h-screen bg-slate-950">
      {/* Desktop layout: List on left, detail on right */}
      <div className="hidden lg:flex h-screen">
        {/* Task list */}
        <div className="flex-1 overflow-hidden border-r border-slate-800">
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <TaskList
                onSelectTask={handleSelectTask}
                onCreateTask={handleCreateTask}
                selectedTaskId={selectedTaskId}
                key={refreshTrigger}
              />
            </div>
          </div>
        </div>

        {/* Task detail panel */}
        {selectedTaskId && (
          <div className="w-[480px] overflow-hidden">
            <TaskDetail
              taskId={selectedTaskId}
              onClose={handleCloseTaskDetail}
              onTaskUpdated={handleTaskUpdated}
            />
          </div>
        )}
      </div>

      {/* Mobile layout: Full screen list with modal detail */}
      <div className="lg:hidden min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <TaskList
            onSelectTask={handleSelectTask}
            onCreateTask={handleCreateTask}
            selectedTaskId={selectedTaskId}
            key={refreshTrigger}
          />
        </div>

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
    </div>
  );
}
