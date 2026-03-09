"use client";

import React, { useState } from "react";
import GoalList from "@/components/goals/GoalList";
import GoalForm from "@/components/goals/GoalForm";
import Modal from "@/components/ui/Modal";
import { useRouter } from "next/navigation";

export default function ProjectsPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();

  const handleGoalCreated = (goal: Record<string, unknown>) => {
    setShowCreateModal(false);
    setRefreshKey((p) => p + 1);
    router.push(`/projects/${goal.id}`);
  };

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-100 dcc-heading tracking-wide">Projects</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            + New Project
          </button>
        </div>

        <GoalList
          onSelectGoal={(id) => router.push(`/projects/${id}`)}
          onCreateGoal={() => setShowCreateModal(true)}
          key={refreshKey}
        />
      </div>

      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Project" size="lg">
        <GoalForm onSave={handleGoalCreated} onCancel={() => setShowCreateModal(false)} />
      </Modal>
    </div>
  );
}
