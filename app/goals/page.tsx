"use client";

import React, { useState } from "react";
import GoalList from "@/components/goals/GoalList";
import GoalDetail from "@/components/goals/GoalDetail";
import GoalForm from "@/components/goals/GoalForm";
import Modal from "@/components/ui/Modal";

export default function GoalsPage() {
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleGoalCreated = (goal: Record<string, unknown>) => {
    setShowCreateModal(false);
    setSelectedGoalId(goal.id as string);
    setRefreshTrigger((p) => p + 1);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Desktop */}
      <div className="hidden lg:flex h-screen">
        <div className="flex-1 overflow-hidden border-r border-slate-800">
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <GoalList
                onSelectGoal={setSelectedGoalId}
                onCreateGoal={() => setShowCreateModal(true)}
                selectedGoalId={selectedGoalId}
                key={refreshTrigger}
              />
            </div>
          </div>
        </div>
        {selectedGoalId && (
          <div className="w-[480px] overflow-hidden">
            <GoalDetail
              goalId={selectedGoalId}
              onClose={() => setSelectedGoalId(undefined)}
              onGoalUpdated={() => setRefreshTrigger((p) => p + 1)}
            />
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="lg:hidden min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <GoalList
            onSelectGoal={setSelectedGoalId}
            onCreateGoal={() => setShowCreateModal(true)}
            selectedGoalId={selectedGoalId}
            key={refreshTrigger}
          />
        </div>
        {selectedGoalId && (
          <Modal isOpen={true} onClose={() => setSelectedGoalId(undefined)} title="" size="lg">
            <GoalDetail
              goalId={selectedGoalId}
              onClose={() => setSelectedGoalId(undefined)}
              onGoalUpdated={() => setRefreshTrigger((p) => p + 1)}
            />
          </Modal>
        )}
      </div>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Goal" size="lg">
        <GoalForm onSave={handleGoalCreated} onCancel={() => setShowCreateModal(false)} />
      </Modal>
    </div>
  );
}
