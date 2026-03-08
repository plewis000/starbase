"use client";

import React, { useState } from "react";
import { useSearchParams } from "next/navigation";
import GoalList from "@/components/goals/GoalList";
import GoalDetail from "@/components/goals/GoalDetail";
import GoalForm from "@/components/goals/GoalForm";
import HabitList from "@/components/habits/HabitList";
import HabitDetail from "@/components/habits/HabitDetail";
import HabitForm from "@/components/habits/HabitForm";
import Modal from "@/components/ui/Modal";

type Tab = "goals" | "habits";

export default function GoalsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") === "habits" ? "habits" : "goals";
  const [tab, setTab] = useState<Tab>(initialTab);

  const [selectedGoalId, setSelectedGoalId] = useState<string | undefined>();
  const [showCreateGoalModal, setShowCreateGoalModal] = useState(false);
  const [goalRefresh, setGoalRefresh] = useState(0);

  const [selectedHabitId, setSelectedHabitId] = useState<string | undefined>();
  const [showCreateHabitModal, setShowCreateHabitModal] = useState(false);
  const [habitRefresh, setHabitRefresh] = useState(0);

  const handleGoalCreated = (goal: Record<string, unknown>) => {
    setShowCreateGoalModal(false);
    setSelectedGoalId(goal.id as string);
    setGoalRefresh((p) => p + 1);
  };

  const handleHabitCreated = (habit: Record<string, unknown>) => {
    setShowCreateHabitModal(false);
    setSelectedHabitId(habit.id as string);
    setHabitRefresh((p) => p + 1);
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    if (t === "goals") setSelectedHabitId(undefined);
    if (t === "habits") setSelectedGoalId(undefined);
  };

  const tabs = [
    { id: "goals" as Tab, label: "Goals", icon: "🎯" },
    { id: "habits" as Tab, label: "Habits", icon: "🔄" },
  ];

  return (
    <div>
      {/* Tab switcher — always visible */}
      <div className="px-6 pt-4 pb-0">
        <div className="max-w-4xl mx-auto flex gap-2 border-b border-dungeon-700">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`px-4 py-3 font-medium transition-colors border-b-2 whitespace-nowrap text-sm ${
                tab === t.id
                  ? "text-crimson-400 border-crimson-500"
                  : "text-dungeon-500 border-transparent hover:text-slate-100"
              }`}
            >
              <span className="mr-2">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Goals tab */}
      {tab === "goals" && (
        <>
          {/* Desktop */}
          <div className="hidden lg:flex h-[calc(100vh-7rem)]">
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
        </>
      )}

      {/* Habits tab */}
      {tab === "habits" && (
        <>
          {/* Desktop */}
          <div className="hidden lg:flex h-[calc(100vh-7rem)]">
            <div className="flex-1 overflow-hidden border-r border-dungeon-700">
              <div className="h-full overflow-y-auto p-6">
                <div className="max-w-4xl mx-auto">
                  <HabitList
                    onSelectHabit={setSelectedHabitId}
                    onCreateHabit={() => setShowCreateHabitModal(true)}
                    selectedHabitId={selectedHabitId}
                    key={habitRefresh}
                  />
                </div>
              </div>
            </div>
            {selectedHabitId && (
              <div className="w-[480px] overflow-y-auto">
                <HabitDetail
                  habitId={selectedHabitId}
                  onClose={() => setSelectedHabitId(undefined)}
                  onHabitUpdated={() => setHabitRefresh((p) => p + 1)}
                />
              </div>
            )}
          </div>

          {/* Mobile */}
          <div className="lg:hidden min-h-screen p-6">
            <div className="max-w-6xl mx-auto">
              <HabitList
                onSelectHabit={setSelectedHabitId}
                onCreateHabit={() => setShowCreateHabitModal(true)}
                selectedHabitId={selectedHabitId}
                key={habitRefresh}
              />
            </div>
            {selectedHabitId && (
              <Modal isOpen={true} onClose={() => setSelectedHabitId(undefined)} title="" size="lg">
                <HabitDetail
                  habitId={selectedHabitId}
                  onClose={() => setSelectedHabitId(undefined)}
                  onHabitUpdated={() => setHabitRefresh((p) => p + 1)}
                />
              </Modal>
            )}
          </div>

          <Modal isOpen={showCreateHabitModal} onClose={() => setShowCreateHabitModal(false)} title="Create New Habit" size="lg">
            <HabitForm onSave={handleHabitCreated} onCancel={() => setShowCreateHabitModal(false)} />
          </Modal>
        </>
      )}
    </div>
  );
}
