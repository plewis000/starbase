"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import CompletionCelebration from "@/components/ui/CompletionCelebration";

// Household task templates organized by room/area
const ROOM_TEMPLATES: Record<string, { icon: string; tasks: string[] }> = {
  Kitchen: {
    icon: "🍳",
    tasks: [
      "Do the dishes",
      "Wipe down counters",
      "Clean the stovetop",
      "Take out the trash",
      "Clean out the fridge",
      "Mop the floor",
    ],
  },
  Bathroom: {
    icon: "🚿",
    tasks: [
      "Clean the toilet",
      "Scrub the shower",
      "Wipe the sink and mirror",
      "Mop the floor",
      "Restock toiletries",
    ],
  },
  "Living Room": {
    icon: "🛋️",
    tasks: [
      "Vacuum / sweep",
      "Dust surfaces",
      "Tidy up clutter",
      "Wipe TV and electronics",
    ],
  },
  Bedroom: {
    icon: "🛏️",
    tasks: [
      "Change the sheets",
      "Vacuum / sweep",
      "Tidy nightstands",
      "Organize the closet",
    ],
  },
  Laundry: {
    icon: "👕",
    tasks: [
      "Wash clothes",
      "Fold and put away laundry",
      "Iron if needed",
    ],
  },
  Yard: {
    icon: "🌿",
    tasks: [
      "Mow the lawn",
      "Water plants",
      "Pull weeds",
      "Take out recycling / bins",
    ],
  },
  Errands: {
    icon: "🚗",
    tasks: [
      "Grocery shopping",
      "Pick up prescriptions",
      "Return packages",
      "Get gas",
    ],
  },
};

const FREQUENCY_OPTIONS = [
  {
    label: "Tidy daily, deep clean weekly",
    value: "balanced",
    description: "Regular small tasks + weekly bigger ones",
  },
  {
    label: "Clean as needed",
    value: "flexible",
    description: "Tasks appear when they need doing",
  },
  {
    label: "I'll set it up myself",
    value: "manual",
    description: "No automatic scheduling — you decide",
  },
];

const SPLIT_OPTIONS = [
  {
    label: "Claim from a shared pool",
    value: "pool",
    description: "Both of you see all tasks and grab what you want",
    recommended: true,
  },
  {
    label: "Take turns automatically",
    value: "rotate",
    description: "The app alternates who's up next",
  },
  {
    label: "Assign tasks to specific people",
    value: "assign",
    description: "Each task has a designated owner",
  },
];

type Step = "rooms" | "tasks" | "frequency" | "split" | "done";

interface StepConfig {
  id: Step;
  number: number;
  title: string;
  subtitle: string;
}

const STEPS: StepConfig[] = [
  { id: "rooms", number: 1, title: "Your spaces", subtitle: "Which areas do you want to manage?" },
  { id: "tasks", number: 2, title: "Your tasks", subtitle: "Uncheck anything that doesn't apply." },
  { id: "frequency", number: 3, title: "How often?", subtitle: "Pick a rhythm that works for you." },
  { id: "split", number: 4, title: "How you work together", subtitle: "Choose how tasks get divvied up." },
  { id: "done", number: 5, title: "All set!", subtitle: "" },
];

export default function SetupPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<Step>("rooms");
  const [selectedRooms, setSelectedRooms] = useState<string[]>([
    "Kitchen",
    "Bathroom",
    "Living Room",
    "Bedroom",
    "Laundry",
  ]);
  const [selectedTasks, setSelectedTasks] = useState<Record<string, string[]>>({});
  const [frequency, setFrequency] = useState("balanced");
  const [splitMode, setSplitMode] = useState("pool");
  const [creating, setCreating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [taskCount, setTaskCount] = useState(0);

  // Pre-select all tasks for selected rooms
  useEffect(() => {
    const initial: Record<string, string[]> = {};
    for (const room of selectedRooms) {
      if (ROOM_TEMPLATES[room]) {
        initial[room] = [...ROOM_TEMPLATES[room].tasks];
      }
    }
    setSelectedTasks(initial);
  }, []);

  const stepIndex = STEPS.findIndex((s) => s.id === currentStep);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  const toggleRoom = (room: string) => {
    setSelectedRooms((prev) => {
      const next = prev.includes(room)
        ? prev.filter((r) => r !== room)
        : [...prev, room];

      // Sync tasks
      setSelectedTasks((prevTasks) => {
        const updated = { ...prevTasks };
        if (!prev.includes(room) && ROOM_TEMPLATES[room]) {
          updated[room] = [...ROOM_TEMPLATES[room].tasks];
        } else {
          delete updated[room];
        }
        return updated;
      });

      return next;
    });
  };

  const toggleTask = (room: string, task: string) => {
    setSelectedTasks((prev) => {
      const roomTasks = prev[room] || [];
      const updated = roomTasks.includes(task)
        ? roomTasks.filter((t) => t !== task)
        : [...roomTasks, task];
      return { ...prev, [room]: updated };
    });
  };

  const totalTaskCount = Object.values(selectedTasks).reduce(
    (sum, tasks) => sum + tasks.length,
    0
  );

  const handleNext = () => {
    const steps: Step[] = ["rooms", "tasks", "frequency", "split", "done"];
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) {
      // When moving from rooms to tasks, sync task selections
      if (currentStep === "rooms") {
        setSelectedTasks((prev) => {
          const updated: Record<string, string[]> = {};
          for (const room of selectedRooms) {
            updated[room] = prev[room] || ROOM_TEMPLATES[room]?.tasks || [];
          }
          return updated;
        });
      }
      setCurrentStep(steps[idx + 1]);
    }
  };

  const handleBack = () => {
    const steps: Step[] = ["rooms", "tasks", "frequency", "split", "done"];
    const idx = steps.indexOf(currentStep);
    if (idx > 0) {
      setCurrentStep(steps[idx - 1]);
    }
  };

  const handleCreateTasks = async () => {
    setCreating(true);
    try {
      // Fetch config to get "To Do" status ID
      const configRes = await fetch("/api/config");
      const configData = await configRes.json();
      const todoStatus = configData.statuses?.find(
        (s: { name: string }) => s.name === "To Do"
      );
      const medPriority = configData.priorities?.find(
        (p: { name: string }) => p.name === "Medium"
      );

      // Determine recurrence based on frequency choice
      const getRecurrence = (task: string): string | null => {
        if (frequency === "manual") return null;
        // Simple heuristic: some tasks are daily, most are weekly
        const dailyTasks = [
          "Do the dishes",
          "Wipe down counters",
          "Take out the trash",
          "Tidy up clutter",
        ];
        if (frequency === "balanced") {
          return dailyTasks.some((d) => task.toLowerCase().includes(d.toLowerCase()))
            ? "FREQ=DAILY;INTERVAL=1"
            : "FREQ=WEEKLY;INTERVAL=1";
        }
        return null;
      };

      // Create all selected tasks
      let created = 0;
      const allTasks: { room: string; task: string }[] = [];
      for (const [room, tasks] of Object.entries(selectedTasks)) {
        for (const task of tasks) {
          allTasks.push({ room, task });
        }
      }

      // Batch create — send them in parallel batches of 5
      for (let i = 0; i < allTasks.length; i += 5) {
        const batch = allTasks.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(({ room, task }) =>
            fetch("/api/tasks", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: task,
                description: `${room} — seeded during household setup`,
                status_id: todoStatus?.id || null,
                priority_id: medPriority?.id || null,
                recurrence_rule: getRecurrence(task),
              }),
            })
          )
        );
        created += results.filter((r) => r.ok).length;
      }

      setTaskCount(created);
      setShowConfetti(true);
      setCurrentStep("done");
    } catch {
      // If task creation fails, still show done screen
      setCurrentStep("done");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden p-6">
      <CompletionCelebration
        show={showConfetti}
        onComplete={() => setShowConfetti(false)}
      />

      {/* Background */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold-glow opacity-50 pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Progress bar */}
        {currentStep !== "done" && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-dungeon-500 font-mono">
                Step {stepIndex + 1} of {STEPS.length - 1}
              </span>
              <span className="text-xs text-dungeon-500 font-mono">
                {totalTaskCount} tasks selected
              </span>
            </div>
            <div className="h-1 bg-dungeon-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold-400 transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Step header */}
        <div className="text-center mb-6">
          <h1 className="dcc-heading text-2xl tracking-wider text-slate-100">
            {STEPS[stepIndex]?.title}
          </h1>
          {STEPS[stepIndex]?.subtitle && (
            <p className="mt-2 text-dungeon-500 text-sm font-mono">
              {STEPS[stepIndex].subtitle}
            </p>
          )}
        </div>

        {/* Step content */}
        {currentStep === "rooms" && (
          <div className="dcc-card p-6">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(ROOM_TEMPLATES).map(([room, { icon }]) => {
                const isSelected = selectedRooms.includes(room);
                return (
                  <button
                    key={room}
                    onClick={() => toggleRoom(room)}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                      isSelected
                        ? "bg-gold-900/20 border-gold-700 text-slate-100"
                        : "bg-dungeon-850 border-dungeon-700 text-dungeon-500 hover:border-dungeon-600"
                    }`}
                  >
                    <span className="text-xl">{icon}</span>
                    <span className="text-sm font-medium">{room}</span>
                    {isSelected && (
                      <span className="ml-auto text-gold-400 text-sm">✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {currentStep === "tasks" && (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {selectedRooms.map((room) => {
              const template = ROOM_TEMPLATES[room];
              if (!template) return null;
              const roomTasks = selectedTasks[room] || [];

              return (
                <div key={room} className="dcc-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">{template.icon}</span>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {room}
                    </h3>
                    <span className="text-xs text-dungeon-500 ml-auto font-mono">
                      {roomTasks.length}/{template.tasks.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {template.tasks.map((task) => {
                      const isSelected = roomTasks.includes(task);
                      return (
                        <label
                          key={task}
                          className="flex items-center gap-3 cursor-pointer group"
                        >
                          <div
                            className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                              isSelected
                                ? "bg-gold-400 border-gold-400"
                                : "border-dungeon-600 group-hover:border-dungeon-500"
                            }`}
                          >
                            {isSelected && (
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                className="text-dungeon-950"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`text-sm ${
                              isSelected ? "text-slate-200" : "text-dungeon-500"
                            }`}
                            onClick={() => toggleTask(room, task)}
                          >
                            {task}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {currentStep === "frequency" && (
          <div className="space-y-3">
            {FREQUENCY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFrequency(opt.value)}
                className={`w-full dcc-card p-5 text-left transition-all ${
                  frequency === opt.value
                    ? "border-gold-700 bg-gold-900/20"
                    : "hover:border-dungeon-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-100">
                    {opt.label}
                  </span>
                  {frequency === opt.value && (
                    <span className="text-gold-400 text-sm">✓</span>
                  )}
                </div>
                <p className="text-xs text-dungeon-500 mt-1">
                  {opt.description}
                </p>
              </button>
            ))}
          </div>
        )}

        {currentStep === "split" && (
          <div className="space-y-3">
            {SPLIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSplitMode(opt.value)}
                className={`w-full dcc-card p-5 text-left transition-all ${
                  splitMode === opt.value
                    ? "border-gold-700 bg-gold-900/20"
                    : "hover:border-dungeon-600"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">
                      {opt.label}
                    </span>
                    {opt.recommended && (
                      <span className="px-1.5 py-0.5 text-[10px] font-mono bg-gold-900/30 text-gold-400 border border-gold-800 rounded">
                        recommended
                      </span>
                    )}
                  </div>
                  {splitMode === opt.value && (
                    <span className="text-gold-400 text-sm">✓</span>
                  )}
                </div>
                <p className="text-xs text-dungeon-500 mt-1">
                  {opt.description}
                </p>
              </button>
            ))}
          </div>
        )}

        {currentStep === "done" && (
          <div className="text-center space-y-6">
            <div className="animate-celebrate-pop">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-xl font-bold text-slate-100">
                {taskCount > 0
                  ? `${taskCount} tasks created across ${selectedRooms.length} areas!`
                  : "Your household is set up!"}
              </h2>
              <p className="text-dungeon-500 text-sm font-mono mt-2">
                Your task board is ready. Claim a task and start earning XP.
              </p>
            </div>

            <button
              onClick={() => router.push("/tasks")}
              className="w-full dcc-btn-primary py-3 text-base"
            >
              Go to Task Board
            </button>
          </div>
        )}

        {/* Navigation buttons */}
        {currentStep !== "done" && (
          <div className="flex gap-3 mt-8">
            {currentStep !== "rooms" && (
              <button
                onClick={handleBack}
                className="px-6 py-3 bg-dungeon-800 border border-dungeon-700 rounded-lg text-slate-300 hover:bg-dungeon-700 transition-colors text-sm font-medium"
              >
                Back
              </button>
            )}
            {currentStep === "split" ? (
              <button
                onClick={handleCreateTasks}
                disabled={creating || totalTaskCount === 0}
                className="flex-1 dcc-btn-primary py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating
                  ? "Setting up..."
                  : `Create ${totalTaskCount} Tasks`}
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={currentStep === "rooms" && selectedRooms.length === 0}
                className="flex-1 dcc-btn-primary py-3 text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            )}
          </div>
        )}

        {/* Skip option */}
        {currentStep !== "done" && (
          <button
            onClick={() => router.push("/tasks")}
            className="w-full mt-4 text-center text-xs text-dungeon-600 hover:text-dungeon-500 transition-colors font-mono"
          >
            Skip setup — I&apos;ll add tasks myself
          </button>
        )}
      </div>
    </div>
  );
}
