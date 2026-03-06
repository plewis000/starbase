"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-dungeon-800 rounded ${className}`}
    />
  );
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`dcc-card p-5 space-y-3 ${className}`}>
      <Skeleton className="h-4 w-2/3 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
      <Skeleton className="h-8 w-full rounded" />
    </div>
  );
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="dcc-card p-4 flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4 rounded" />
            <Skeleton className="h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Greeting */}
      <div>
        <Skeleton className="h-8 w-64 rounded" />
        <Skeleton className="h-4 w-40 mt-2 rounded" />
      </div>

      {/* Crawler card */}
      <div className="dcc-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-3 w-24 rounded" />
          </div>
          <Skeleton className="h-6 w-20 rounded" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>

      {/* Outcomes */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-32 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>

      {/* Tasks */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-28 rounded" />
        <SkeletonList rows={3} />
      </div>
    </div>
  );
}
