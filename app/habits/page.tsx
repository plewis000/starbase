"use client";

import React, { useState } from "react";
import HabitList from "@/components/habits/HabitList";
import HabitDetail from "@/components/habits/HabitDetail";
import HabitForm from "@/components/habits/HabitForm";
import Modal from "@/components/ui/Modal";

export default function HabitsPage() {
  const [selectedHabitId, setSelectedHabitId] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleHabitCreated = (habit: Record<string, unknown>) => {
    setShowCreateModal(false);
    setSelectedHabitId(habit.id as string);
    setRefreshTrigger((p) => p + 1);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="hidden lg:flex h-screen">
        <div className="flex-1 overflow-hidden border-r border-slate-800">
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <HabitList
                onSelectHabit={setSelectedHabitId}
                onCreateHabit={() => setShowCreateModal(true)}
                selectedHabitId={selectedHabitId}
                key={refreshTrigger}
              />
            </div>
          </div>
        </div>
        {selectedHabitId && (
          <div className="w-[480px] overflow-hidden">
            <HabitDetail
              habitId={selectedHabitId}
              onClose={() => setSelectedHabitId(undefined)}
              onHabitUpdated={() => setRefreshTrigger((p) => p + 1)}
            />
          </div>
        )}
      </div>

      <div className="lg:hidden min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <HabitList
            onSelectHabit={setSelectedHabitId}
            onCreateHabit={() => setShowCreateModal(true)}
            selectedHabitId={selectedHabitId}
            key={refreshTrigger}
          />
        </div>
        {selectedHabitId && (
          <Modal isOpen={true} onClose={() => setSelectedHabitId(undefined)} title="" size="lg">
            <HabitDetail
              habitId={selectedHabitId}
              onClose={() => setSelectedHabitId(undefined)}
              onHabitUpdated={() => setRefreshTrigger((p) => p + 1)}
            />
          </Modal>
        )}
      </div>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Habit" size="lg">
        <HabitForm onSave={handleHabitCreated} onCancel={() => setShowCreateModal(false)} />
      </Modal>
    </div>
  );
}
