/**
 * Marco Extension — React Popup: Popup Data Hook
 *
 * Fetches status, health, project, and error data from
 * the background service worker via PlatformAdapter.
 */

import { useState, useEffect, useCallback } from "react";
import { getPlatform } from "../../platform";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StatusData {
    connection: "online" | "offline" | "degraded";
    token: { status: string; expiresIn: string | null };
    config: { status: string; source: string };
    loggingMode: string;
    version: string;
    bootStep: string;
    persistenceMode: string;
    bootTimings: Array<{ step: string; durationMs: number }>;
    totalBootMs: number;
}

export interface HealthData {
    state: string;
    details: string[];
}

export interface ScriptEntry {
    id?: string;
    name?: string;
    path: string;
    order: number;
    isEnabled?: boolean;
    configBinding?: string | null;
    runAt?: string;
}

export interface ProjectData {
    activeProject: {
        id: string;
        name: string;
        version: string;
        scripts?: ScriptEntry[];
    } | null;
    matchedRule: { name: string; matchMode: string } | null;
    allProjects: Array<{ id: string; name: string; version: string }>;
    injectedScripts: Record<string, { status: string }>;
    scriptStates?: Record<string, { id: string; isEnabled: boolean }>;
}

export interface ErrorData {
    errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function usePopupData() {
    const [status, setStatus] = useState<StatusData | null>(null);
    const [health, setHealth] = useState<HealthData | null>(null);
    const [project, setProject] = useState<ProjectData | null>(null);
    const [errors, setErrors] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [fatalError, setFatalError] = useState<string | null>(null);

    const platform = getPlatform();

    const loadData = useCallback(async () => {
        try {
            const [statusRes, healthRes, projectRes, errorsRes] =
                await Promise.all([
                    platform.sendMessage<StatusData>({ type: "GET_STATUS" }),
                    platform.sendMessage<HealthData>({ type: "GET_HEALTH_STATUS" }),
                    platform.sendMessage<ProjectData>({ type: "GET_ACTIVE_PROJECT" }),
                    platform.sendMessage<ErrorData>({ type: "GET_ACTIVE_ERRORS" }),
                ]);

            setStatus(statusRes);
            setHealth(healthRes);
            setProject(projectRes);
            setErrors(errorsRes.errors ?? []);
            setFatalError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setFatalError(message);
        } finally {
            setIsLoading(false);
        }
    }, [platform]);

    useEffect(() => {
        void loadData();
        const interval = setInterval(() => void loadData(), 30_000);
        return () => clearInterval(interval);
    }, [loadData]);

    return {
        status,
        health,
        project,
        errors,
        isLoading,
        fatalError,
        reload: loadData,
    };
}
