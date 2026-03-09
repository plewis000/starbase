"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import GoalDetail from "@/components/goals/GoalDetail";
import ListView from "@/components/activity/views/ListView";
import BoardView from "@/components/activity/views/BoardView";
import GanttView from "@/components/activity/views/GanttView";
import TimelineView from "@/components/activity/views/TimelineView";
import TaskDetail from "@/components/tasks/TaskDetail";
import TaskForm from "@/components/tasks/TaskForm";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { useHouseholdTimezone } from "@/hooks/useHouseholdTimezone";

type ViewMode = "overview" | "list" | "board" | "gantt" | "timeline";

interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  start_date?: string;
  completed_at?: string | null;
  status_id?: string;
  priority_id?: string;
  assigned_to?: string;
  recurrence_rule?: string;
  status?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  priority?: { id: string; name: string; color?: string; icon?: string; sort_order: number };
  assignee?: { id: string; full_name: string; email: string; avatar_url?: string | null };
  tags?: any[];
  checklist_items?: any[];
  subtask_progress?: { done: number; total: number };
}

interface ConfigData {
  statuses: { id: string; name: string; color?: string; sort_order: number }[];
  priorities: { id: string; name: string; color?: string; sort_order: number }[];
  members: any[];
  task_types: any[];
  effort_levels: any[];
  tags: any[];
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const goalId = params.id as string;
  const { timezone } = useHouseholdTimezone();

  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch project tasks
  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks?goal_id=${goalId}&limit=200`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error("Failed to fetch project tasks:", err);
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  // Fetch config
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [configRes, membersRes, tagsRes] = await Promise.all([
          fetch("/api/config"),
          fetch("/api/household/members"),
          fetch("/api/tags"),
        ]);
        const configData = await configRes.json();
        const membersData = await membersRes.json();
        const tagsData = await tagsRes.json();
        setConfig({
          statuses: configData.statuses || [],
          priorities: configData.priorities || [],
          task_types: configData.types || [],
          effort_levels: configData.efforts || [],
          tags: tagsData.tags || [],
          members: membersData.members || [],
        });
      } catch (err) {
        console.error("Config fetch failed:", err);
      }
    };
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, refreshTrigger]);

  const handleQuickComplete = useCallback(async (taskId: string) => {
    if (!config) return;
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const isCompleted = !!task.completed_at;
    const doneStatus = config.statuses.find((s) => s.name === "Done");
    const todoStatus = config.statuses.find((s) => s.name === "To Do");

    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, completed_at: isCompleted ? null : new Date().toISOString(), status: isCompleted ? todoStatus : doneStatus, status_id: isCompleted ? todoStatus?.id : doneStatus?.id }
          : t
      )
    );

    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: isCompleted ? todoStatus?.id : doneStatus?.id }),
      });
    } catch {
      fetchTasks();
    }
  }, [tasks, config, fetchTasks]);

  const handleStatusChange = useCallback(async (taskId: string, newStatusId: string) => {
    const newStatus = config?.statuses.find((s) => s.id === newStatusId);
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, status_id: newStatusId, status: newStatus ? { ...newStatus, sort_order: newStatus.sort_order } : t.status }
          : t
      )
    );
    try {
      await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: newStatusId }),
      });
    } catch {
      fetchTasks();
    }
  }, [config, fetchTasks]);

  const handleTaskCreated = () => {
    setShowCreateModal(false);
    setRefreshTrigger((p) => p + 1);
  };

  const completedCount = tasks.filter((t) => t.completed_at).length;
  const totalCount = tasks.length;

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-dungeon-800 bg-dungeon-950/80 backdrop-blur-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => router.push("/projects")}
            className="text-dungeon-400 hover:text-slate-100 transition-colors text-sm"
          >
            ← Projects
          </button>
          <div className="w-px h-4 bg-dungeon-700" />
          <span className="text-xs text-dungeon-500 font-mono">
            {completedCount}/{totalCount} tasks
          </span>

          <div className="flex items-center gap-0.5 bg-dungeon-900 border border-dungeon-800 rounded-lg p-0.5 ml-auto">
            {([
              { key: "overview" as ViewMode, icon: "📋", label: "Overview" },
              { key: "list" as ViewMode, icon: "☰", label: "List" },
              { key: "board" as ViewMode, icon: "▦", label: "Board" },
              { key: "gantt" as ViewMode, icon: "▐", label: "Gantt" },
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

          {viewMode !== "overview" && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors"
            >
              + Task
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto">
          {viewMode === "overview" ? (
            <div className="max-w-3xl mx-auto p-6">
              <GoalDetail
                goalId={goalId}
                onClose={() => router.push("/projects")}
                onGoalUpdated={() => setRefreshTrigger((p) => p + 1)}
              />
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-48">
              <LoadingSpinner size="lg" />
            </div>
          ) : viewMode === "list" ? (
            <div className="p-4">
              <ListView
                tasks={tasks}
                onQuickComplete={handleQuickComplete}
                completedTaskId={null}
                config={config}
                onSelect={setSelectedTaskId}
                activeTaskId={selectedTaskId}
              />
            </div>
          ) : viewMode === "board" ? (
            <div className="p-4">
              <BoardView
                tasks={tasks}
                onQuickComplete={handleQuickComplete}
                completedTaskId={null}
                config={config}
                onSelect={setSelectedTaskId}
                onStatusChange={handleStatusChange}
              />
            </div>
          ) : viewMode === "gantt" ? (
            <div className="p-4">
              <GanttView
                tasks={tasks}
                onSelect={setSelectedTaskId}
                timezone={timezone}
              />
            </div>
          ) : viewMode === "timeline" ? (
            <div className="p-4">
              <TimelineView
                tasks={tasks}
                onQuickComplete={handleQuickComplete}
                completedTaskId={null}
                onSelect={setSelectedTaskId}
              />
            </div>
          ) : null}
        </div>

        {/* Task detail sidebar */}
        {selectedTaskId && viewMode !== "overview" && (
          <div className="w-[480px] flex-shrink-0 overflow-y-auto border-l border-dungeon-800">
            <TaskDetail
              taskId={selectedTaskId}
              onClose={() => setSelectedTaskId(undefined)}
              onTaskUpdated={() => setRefreshTrigger((p) => p + 1)}
            />
          </div>
        )}
      </div>

      {/* Create task modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add Task to Project" size="lg">
        <TaskForm
          onSave={handleTaskCreated}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>
    </div>
  );
}
