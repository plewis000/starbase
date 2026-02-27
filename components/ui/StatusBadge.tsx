import React from "react";

interface StatusBadgeProps {
  status: {
    name: string;
    color?: string;
    icon?: string;
  } | null;
}

const colorMap: Record<string, string> = {
  "To Do": "bg-slate-700 text-slate-200",
  "In Progress": "bg-blue-500/20 text-blue-300",
  Done: "bg-red-500/20 text-green-300",
  Blocked: "bg-red-500/20 text-red-300",
  Someday: "bg-purple-500/20 text-purple-300",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-200">
        Unknown
      </span>
    );
  }

  const colorClass =
    colorMap[status.name] || "bg-slate-700 text-slate-200";

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}
    >
      {status.icon && <span>{status.icon}</span>}
      {status.name}
    </span>
  );
}
