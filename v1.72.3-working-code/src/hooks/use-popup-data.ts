import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

interface ActiveProjectData {
  activeProject: {
    id: string;
    name: string;
    version: string;
    description?: string;
    isGlobal?: boolean;
  } | null;
  allProjects: Array<{
    id: string;
    name: string;
    version: string;
    description?: string;
    isGlobal?: boolean;
  }>;
}

interface InjectionStatus {
  scriptIds: string[];
  timestamp: string;
  projectId: string;
  injectionPath?: string;
  domTarget?: string;
}

interface PopupScript {
  id: string;
  name: string;
  order: number;
  isEnabled: boolean;
  runAt?: string;
}

interface StatusData {
  connection: string;
  token: { status: string; expiresIn: string | null };
  config: { status: string; source: string; lastSyncAt?: string | null };
  loggingMode: string;
  version: string;
  latencyMs?: number;
}

interface HealthData {
  state: string;
  details: string[];
}

export type { ActiveProjectData, InjectionStatus, PopupScript, StatusData, HealthData };

export function usePopupData() {
  const [projectData, setProjectData] = useState<ActiveProjectData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [injections, setInjections] = useState<InjectionStatus | null>(null);
  const [scripts, setScripts] = useState<PopupScript[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);

    const t0 = performance.now();
    const [statusRes, healthRes, projRes, scriptsRes] = await Promise.all([
      sendMessage<StatusData>({ type: "GET_STATUS" }),
      sendMessage<HealthData>({ type: "GET_HEALTH_STATUS" }),
      sendMessage<ActiveProjectData>({ type: "GET_ACTIVE_PROJECT" }),
      sendMessage<{ scripts: PopupScript[] }>({ type: "GET_ALL_SCRIPTS" }),
    ]);
    const latencyMs = Math.round(performance.now() - t0);

    setStatus({ ...statusRes, latencyMs });
    setHealth(healthRes);
    setProjectData(projRes);

    const enrichedScripts = scriptsRes.scripts.map((s) => ({
      ...s,
      isEnabled: s.isEnabled !== false,
    }));
    setScripts(enrichedScripts);

    // Try to get injection status for current tab
    try {
      const tabInjections = await sendMessage<{ injections: Record<number, InjectionStatus> }>({
        type: "GET_TAB_INJECTIONS",
        tabId: 0,
      });
      const firstTab = Object.values(tabInjections.injections)[0] ?? null;
      setInjections(firstTab);
    } catch {
      setInjections(null);
    }

    setLoading(false);
  }, []);

  const setActiveProject = useCallback(async (projectId: string) => {
    await sendMessage({ type: "SET_ACTIVE_PROJECT", projectId });
    await refresh();
  }, [refresh]);

  const toggleScript = useCallback(async (scriptId: string) => {
    setScripts((prev) =>
      prev.map((s) => {
        const isTarget = s.id === scriptId;
        return isTarget ? { ...s, isEnabled: !s.isEnabled } : s;
      }),
    );

    await sendMessage({ type: "TOGGLE_SCRIPT", id: scriptId });
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return {
    projectData,
    status,
    health,
    injections,
    scripts,
    loading,
    refresh,
    setActiveProject,
    toggleScript,
  };
}
