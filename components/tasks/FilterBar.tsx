"use client";

import React, { useState, useCallback, useEffect } from "react";

interface MemberOption {
  user_id: string;
  display_name?: string;
  user?: { full_name?: string } | null;
}

export interface TaskFilters {
  status?: string;
  priority?: string;
  due?: string;
  owner?: string;
  search?: string;
  sort?: string;
  direction?: "asc" | "desc";
}

interface FilterBarProps {
  onFilterChange: (filters: TaskFilters) => void;
}

// Status and priority filter values are display NAMES because the API
// does a name-to-ID lookup: config.task_statuses.select("id").in("name", slugs)
const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "All", value: "All" },
  { label: "To Do", value: "To Do" },
  { label: "In Progress", value: "In Progress" },
  { label: "Blocked", value: "Blocked" },
  { label: "Done", value: "Done" },
  { label: "Someday", value: "Someday" },
];
const PRIORITY_OPTIONS: { label: string; value: string }[] = [
  { label: "All", value: "All" },
  { label: "Urgent", value: "Urgent" },
  { label: "High", value: "High" },
  { label: "Medium", value: "Medium" },
  { label: "Low", value: "Low" },
];
const DUE_DATE_OPTIONS: { label: string; value: string }[] = [
  { label: "All", value: "All" },
  { label: "Today", value: "today" },
  { label: "This Week", value: "this_week" },
  { label: "Overdue", value: "overdue" },
  { label: "Upcoming", value: "upcoming" },
  { label: "No Date", value: "none" },
];
const SORT_OPTIONS: { label: string; value: string }[] = [
  { label: "Due Date", value: "due_date" },
  { label: "Priority", value: "priority_id" },
  { label: "Created", value: "created_at" },
  { label: "Title", value: "title" },
];

export default function FilterBar({ onFilterChange }: FilterBarProps) {
  const [filters, setFilters] = useState<TaskFilters>({
    status: "All",
    priority: "All",
    due: "All",
    owner: "All",
    search: "",
    sort: "due_date",
    direction: "asc",
  });

  const [householdMembers, setHouseholdMembers] = useState<MemberOption[]>([]);

  useEffect(() => {
    fetch("/api/household/members")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.members) setHouseholdMembers(data.members);
      })
      .catch(() => {});
  }, []);

  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Debounced search handler
  const handleSearchChange = useCallback(
    (value: string) => {
      setFilters((prev) => ({ ...prev, search: value }));

      if (searchTimeout) clearTimeout(searchTimeout);

      const timeout = setTimeout(() => {
        onFilterChange({ ...filters, search: value });
      }, 300);

      setSearchTimeout(timeout);
    },
    [filters, searchTimeout, onFilterChange]
  );

  // Update filter and notify parent
  const updateFilter = useCallback(
    (key: keyof TaskFilters, value: string) => {
      const newFilters: TaskFilters = { ...filters, [key]: value };
      setFilters(newFilters);
      onFilterChange(newFilters);
    },
    [filters, onFilterChange]
  );

  const toggleDirection = useCallback(() => {
    const newDirection: "asc" | "desc" = filters.direction === "asc" ? "desc" : "asc";
    const newFilters: TaskFilters = { ...filters, direction: newDirection };
    setFilters(newFilters);
    onFilterChange(newFilters);
  }, [filters, onFilterChange]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2 items-center">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search tasks..."
            value={filters.search || ""}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full px-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors"
          />
          <svg
            className="absolute right-3 top-2.5 w-4 h-4 text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        {/* Mobile filters toggle */}
        <button
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="lg:hidden px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 hover:bg-slate-800 transition-colors"
        >
          ⚙️
        </button>
      </div>

      {/* Filters container */}
      <div
        className={`grid gap-3 ${
          showMobileFilters
            ? "grid-cols-2 sm:grid-cols-3"
            : "hidden lg:grid lg:grid-cols-6 lg:gap-2"
        }`}
      >
        {/* Status filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Status
          </label>
          <select
            value={filters.status || "All"}
            onChange={(e) => updateFilter("status", e.target.value)}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors cursor-pointer"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Priority
          </label>
          <select
            value={filters.priority || "All"}
            onChange={(e) => updateFilter("priority", e.target.value)}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors cursor-pointer"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Due date filter */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Due Date
          </label>
          <select
            value={filters.due || "All"}
            onChange={(e) => updateFilter("due", e.target.value)}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors cursor-pointer"
          >
            {DUE_DATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Owner filter */}
        {householdMembers.length > 1 && (
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Owner
            </label>
            <select
              value={filters.owner || "All"}
              onChange={(e) => updateFilter("owner", e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors cursor-pointer"
            >
              <option value="All">All</option>
              <option value="me">My Tasks</option>
              {householdMembers.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.display_name || m.user?.full_name || "Member"}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Sort dropdown */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-1.5">
            Sort
          </label>
          <select
            value={filters.sort || "due_date"}
            onChange={(e) => updateFilter("sort", e.target.value)}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400/30 transition-colors cursor-pointer"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Direction toggle */}
        <div className="flex items-end">
          <button
            onClick={toggleDirection}
            className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-sm hover:bg-slate-800 hover:border-slate-700 transition-colors flex items-center justify-center gap-1"
            title={`Sort ${filters.direction === "asc" ? "ascending" : "descending"}`}
          >
            {filters.direction === "asc" ? "↑" : "↓"}
          </button>
        </div>

        {/* Close button on mobile */}
        {showMobileFilters && (
          <button
            onClick={() => setShowMobileFilters(false)}
            className="lg:hidden col-span-2 sm:col-span-3 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 text-sm hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
        )}
      </div>
    </div>
  );
}
