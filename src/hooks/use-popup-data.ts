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
  pipelineDurationMs?: number;
  budgetMs?: number;
  verification?: {
    marcoSdk: boolean;
    extRoot: boolean;
    mcClass: boolean;
    mcInstance: boolean;
    uiContainer: boolean;
    markerEl: boolean;
    verifiedAt: string;
  };
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
  bootStep?: string;
}

interface OpfsStatusData {
  sessionId: string | null;
  dirExists: boolean;
  files: Array<{ name: string; absolutePath: string; sizeBytes: number; exists: boolean }>;
  healthy: boolean;
}

interface HealthData {
  state: string;
  details: string[];
}

export type { ActiveProjectData, InjectionStatus, PopupScript, StatusData, HealthData, OpfsStatusData };

// eslint-disable-next-line max-lines-per-function
export function usePopupData() {
  const [projectData, setProjectData] = useState<ActiveProjectData | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [opfsStatus, setOpfsStatus] = useState<OpfsStatusData | null>(null);
  const [injections, setInjections] = useState<InjectionStatus | null>(null);
  const [scripts, setScripts] = useState<PopupScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugMode, setDebugMode] = useState(false);

  const refresh = useCallback(async () => {
    const t0 = performance.now();
    const [statusRes, healthRes, projRes, scriptsRes, settingsRes] = await Promise.all([
      sendMessage<StatusData>({ type: "GET_STATUS" }),
      sendMessage<HealthData>({ type: "GET_HEALTH_STATUS" }),
      sendMessage<ActiveProjectData>({ type: "GET_ACTIVE_PROJECT" }),
      sendMessage<{ scripts: PopupScript[] }>({ type: "GET_ALL_SCRIPTS" }),
      sendMessage<{ settings?: { debugMode?: boolean } }>({ type: "GET_SETTINGS" }).catch(() => ({ settings: undefined })),
    ]);
    const latencyMs = Math.round(performance.now() - t0);

    setStatus({ ...statusRes, latencyMs });
    setHealth(healthRes);
    setProjectData(projRes);
    setDebugMode(settingsRes.settings?.debugMode === true);

    const enrichedScripts = scriptsRes.scripts.map((s) => ({
      ...s,
      isEnabled: s.isEnabled !== false,
    }));
    setScripts(enrichedScripts);
    setLoading(false);

    // Non-critical fetches off the critical path — UI is already visible
    sendMessage<OpfsStatusData>({ type: "GET_OPFS_STATUS" })
      .then((res) => setOpfsStatus(res))
      .catch(() => setOpfsStatus(null));

    sendMessage<{ injections: Record<number, InjectionStatus> }>({
      type: "GET_TAB_INJECTIONS",
      tabId: 0,
    })
      .then((res) => setInjections(Object.values(res.injections)[0] ?? null))
      .catch(() => setInjections(null));
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
    opfsStatus,
    injections,
    scripts,
    loading,
    debugMode,
    refresh,
    setActiveProject,
    toggleScript,
  };
}
