"use client";

import React, { useState } from "react";
import GoalList from "@/components/goals/GoalList";
import GoalDetail from "@/components/goals/GoalDetail";
import GoalForm from "@/components/goals/GoalForm";
import Modal from "@/components/ui/Modal";

export default function GoalsPage() {
  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>();
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false);
  const [goalRefresh, setGoalRefresh] = useState(0);

  const handleGoalCreated = (goal: Record<string, unknown>) => {
    setShowCreateGoalModal(false);
    setSelectedGoalId(goal.id as string);
    setGoalRefresh((p) => p + 1);
  };

  return (
    <div>
      {/* Desktop */}
      <div className="hidden lg:flex h-[calc(100vh-4rem)]">
        <div className="flex-1 overflow-hidden border-r border-dungeon-700">
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto">
              <GoalList
                onSelectGoal={setSelectedGoalId}
                onCreateGoal={() => setShowCreateGoalModal(true)}
                selectedGoalId={selectedGoalId}
                key={goalRefresh}
              />
            </div>
          </div>
        </div>
        {selectedGoalId && (
          <div className="w-[480px] overflow-y-auto">
            <GoalDetail
              goalId={selectedGoalId}
              onClose={() => setSelectedGoalId(undefined)}
              onGoalUpdated={() => setGoalRefresh((p) => p + 1)}
            />
          </div>
        )}
      </div>

      {/* Mobile */}
      <div className="lg:hidden min-h-screen p-6">
        <div className="max-w-6xl mx-auto">
          <GoalList
            onSelectGoal={setSelectedGoalId}
            onCreateGoal={() => setShowCreateGoalModal(true)}
            selectedGoalId={selectedGoalId}
            key={goalRefresh}
          />
        </div>
        {selectedGoalId && (
          <Modal isOpen={true} onClose={() => setSelectedGoalId(undefined)} title="" size="lg">
            <GoalDetail
              goalId={selectedGoalId}
              onClose={() => setSelectedGoalId(undefined)}
              onGoalUpdated={() => setGoalRefresh((p) => p + 1)}
            />
          </Modal>
        )}
      </div>

      <Modal isOpen={showCreateGoalModal} onClose={() => setShowCreateGoalModal(false)} title="Create New Goal" size="lg">
        <GoalForm onSave={handleGoalCreated} onCancel={() => setShowCreateGoalModal(false)} />
      </Modal>
    </div>
  );
}
