import React from "react";

interface PriorityBadgeProps {
  priority: {
    name: string;
    color?: string;
    icon?: string;
  } | null;
}

const colorMap: Record<string, string> = {
  Critical: "text-red-500",
  High: "text-amber-500",
  Medium: "text-blue-400",
  Low: "text-slate-400",
  None: "text-transparent",
};

export default function PriorityBadge({ priority }: PriorityBadgeProps) {
  if (!priority) {
    return null;
  }

  const colorClass = colorMap[priority.name] || "text-slate-400";

  return (
    <span className="inline-flex items-center gap-1">
      {priority.icon ? (
        <span>{priority.icon}</span>
      ) : (
        <span className={`w-2 h-2 rounded-full bg-current ${colorClass}`} />
      )}
    </span>
  );
}
