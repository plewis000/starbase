"use client";

import { useState, useEffect, useCallback } from "react";

export interface ConfigOption {
  id: string;
  name: string;
  slug?: string;
  display_color?: string;
  icon?: string;
  sort_order?: number;
  active?: boolean;
}

export interface HouseholdMember {
  user_id: string;
  display_name?: string;
  role?: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
    avatar_url?: string | null;
  } | null;
}

export interface TaskConfig {
  statuses: ConfigOption[];
  priorities: ConfigOption[];
  task_types: ConfigOption[];
  effort_levels: ConfigOption[];
  locations: ConfigOption[];
  tags: ConfigOption[];
  members: HouseholdMember[];
}

let cachedConfig: TaskConfig | null = null;
let fetchPromise: Promise<TaskConfig> | null = null;

async function fetchConfig(): Promise<TaskConfig> {
  if (cachedConfig) return cachedConfig;
  if (fetchPromise) return fetchPromise;

  fetchPromise = (async () => {
    const [configRes, membersRes, tagsRes] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/household/members"),
      fetch("/api/tags"),
    ]);

    const configData = configRes.ok ? await configRes.json() : {};
    const membersData = membersRes.ok ? await membersRes.json() : {};
    const tagsData = tagsRes.ok ? await tagsRes.json() : {};

    cachedConfig = {
      statuses: configData.statuses || [],
      priorities: configData.priorities || [],
      task_types: configData.task_types || configData.types || [],
      effort_levels: configData.effort_levels || [],
      locations: configData.locations || [],
      tags: tagsData.tags || [],
      members: membersData.members || [],
    };
    fetchPromise = null;
    return cachedConfig;
  })();

  return fetchPromise;
}

export function useTaskConfig() {
  const [config, setConfig] = useState<TaskConfig | null>(cachedConfig);
  const [loading, setLoading] = useState(!cachedConfig);

  useEffect(() => {
    if (cachedConfig) {
      setConfig(cachedConfig);
      setLoading(false);
      return;
    }
    fetchConfig().then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  const refresh = useCallback(async () => {
    cachedConfig = null;
    fetchPromise = null;
    const c = await fetchConfig();
    setConfig(c);
    return c;
  }, []);

  const resolveStatusName = useCallback((id?: string) => {
    if (!id || !config) return undefined;
    return config.statuses.find((s) => s.id === id)?.name;
  }, [config]);

  const resolvePriorityName = useCallback((id?: string) => {
    if (!id || !config) return undefined;
    return config.priorities.find((p) => p.id === id)?.name;
  }, [config]);

  const resolveMemberName = useCallback((id?: string) => {
    if (!id || !config) return undefined;
    const m = config.members.find((m) => m.user_id === id || m.user?.id === id);
    return m?.user?.full_name || m?.display_name;
  }, [config]);

  return { config, loading, refresh, resolveStatusName, resolvePriorityName, resolveMemberName };
}
