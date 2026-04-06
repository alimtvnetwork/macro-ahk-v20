import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

interface CookieRule {
  id: string;
  name: string;
  domain: string;
  matchStrategy: "exact" | "prefix" | "contains" | "regex";
  bindTo: string;
}

/** Canonical cookie binding — matches StoredProject.cookies[] in shared/project-types.ts */
interface CookieBinding {
  cookieName: string;
  url: string;
  role: "session" | "refresh" | "custom";
  description?: string;
}

interface StoredProject {
  id: string;
  schemaVersion: number;
  name: string;
  slug?: string;
  version: string;
  description?: string;
  targetUrls: Array<{ pattern: string; matchType: string }>;
  scripts: Array<{ path: string; order: number; runAt?: string; configBinding?: string; code?: string }>;
  configs?: Array<{ path: string; description?: string }>;
  cookies?: CookieBinding[];
  /** @deprecated Use cookies[] instead */
  cookieRules?: CookieRule[];
  settings?: { isolateScripts?: boolean; logLevel?: string; retryOnNavigate?: boolean; chatBoxXPath?: string; variables?: string; [key: string]: unknown };
  dependencies?: Array<{ projectId: string; version: string }>;
  isGlobal?: boolean;
  isRemovable?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StoredScript {
  id: string;
  name: string;
  description?: string;
  code: string;
  order: number;
  runAt?: string;
  configBinding?: string;
  isIife?: boolean;
  hasDomUsage?: boolean;
  updateUrl?: string;
  lastUpdateCheck?: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredConfig {
  id: string;
  name: string;
  description?: string;
  json: string;
  createdAt: string;
  updatedAt: string;
}

export type { StoredProject, StoredScript, StoredConfig, CookieRule, CookieBinding };

export function useProjects() {
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ projects: StoredProject[] }>({
      type: "GET_ALL_PROJECTS",
    });
    setProjects(result.projects);
    setLoading(false);
  }, []);

  const save = useCallback(async (project: Partial<StoredProject>) => {
    await sendMessage({ type: "SAVE_PROJECT", project });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (projectId: string) => {
    await sendMessage({ type: "DELETE_PROJECT", projectId });
    await refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { projects, loading, refresh, save, remove };
}

export function useScripts() {
  const [scripts, setScripts] = useState<StoredScript[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ scripts: StoredScript[] }>({
      type: "GET_ALL_SCRIPTS",
    });
    setScripts(result.scripts);
    setLoading(false);
  }, []);

  const save = useCallback(async (script: Partial<StoredScript>) => {
    await sendMessage({ type: "SAVE_SCRIPT", script });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await sendMessage({ type: "DELETE_SCRIPT", id });
    await refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { scripts, loading, refresh, save, remove };
}

export function useConfigs() {
  const [configs, setConfigs] = useState<StoredConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await sendMessage<{ configs: StoredConfig[] }>({
      type: "GET_ALL_CONFIGS",
    });
    setConfigs(result.configs);
    setLoading(false);
  }, []);

  const save = useCallback(async (config: Partial<StoredConfig>) => {
    await sendMessage({ type: "SAVE_CONFIG", config });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await sendMessage({ type: "DELETE_CONFIG", id });
    await refresh();
  }, [refresh]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { configs, loading, refresh, save, remove };
}
