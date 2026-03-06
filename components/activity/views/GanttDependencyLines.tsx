"use client";

import React from "react";

interface Dependency {
  from_task_id: string;
  to_task_id: string;
}

interface TaskPosition {
  taskId: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface GanttDependencyLinesProps {
  dependencies: Dependency[];
  taskPositions: Map<string, TaskPosition>;
}

export default function GanttDependencyLines({ dependencies, taskPositions }: GanttDependencyLinesProps) {
  if (dependencies.length === 0) return null;

  const lines = dependencies.map((dep, i) => {
    const from = taskPositions.get(dep.from_task_id);
    const to = taskPositions.get(dep.to_task_id);
    if (!from || !to) return null;

    // Draw from right edge of "from" to left edge of "to"
    const x1 = from.left + from.width;
    const y1 = from.top + from.height / 2;
    const x2 = to.left;
    const y2 = to.top + to.height / 2;

    // Right-angle connector
    const midX = (x1 + x2) / 2;
    const path = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;

    return (
      <g key={i}>
        <path
          d={path}
          fill="none"
          stroke="#ef4444"
          strokeWidth="1.5"
          strokeOpacity="0.4"
          markerEnd="url(#arrowhead)"
        />
      </g>
    );
  });

  // Calculate SVG dimensions
  let maxX = 0, maxY = 0;
  taskPositions.forEach((pos) => {
    maxX = Math.max(maxX, pos.left + pos.width + 20);
    maxY = Math.max(maxY, pos.top + pos.height + 20);
  });

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={maxX}
      height={maxY}
      style={{ overflow: "visible" }}
    >
      <defs>
        <marker
          id="arrowhead"
          markerWidth="6"
          markerHeight="4"
          refX="6"
          refY="2"
          orient="auto"
        >
          <polygon points="0 0, 6 2, 0 4" fill="#ef4444" fillOpacity="0.5" />
        </marker>
      </defs>
      {lines}
    </svg>
  );
}
