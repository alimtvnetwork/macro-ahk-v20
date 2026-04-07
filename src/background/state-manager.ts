/**
 * Marco Extension — State Manager
 *
 * Manages transient state that survives service worker termination
 * via chrome.storage.session. See spec 19-opfs-persistence-strategy.md.
 */

import type { ScriptBindingResolved } from "../shared/types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** Per-tab injection tracking record. */
export interface TabInjectionRecord {
    scriptIds: string[];
    timestamp: string;
    projectId: string;
    matchedRuleId: string;
    /** Last known good script bindings for SPA re-injection (P-009). */
    lastGoodBindings?: ScriptBindingResolved[];
    /** Which injection path was used: main-blob, userScripts, isolated-blob, or MAIN/ISOLATED. */
    injectionPath?: string;
    /** Which DOM element was used as insertion target: body or documentElement. */
    domTarget?: string;
    /** Total pipeline duration in milliseconds. */
    pipelineDurationMs?: number;
    /** Performance budget threshold in milliseconds. */
    budgetMs?: number;
    /** Post-injection verification results — confirms globals landed in MAIN world. */
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

/** Full transient state persisted to chrome.storage.session. */
export interface TransientState {
    activeProjectId: string | null;
    tabInjections: Record<number, TabInjectionRecord>;
    healthState: "HEALTHY" | "DEGRADED" | "ERROR" | "FATAL";
    currentSessionId: string;
    persistenceMode: "opfs" | "storage" | "memory";
    lastFlushTimestamp: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SESSION_KEY = "marco_transient_state";

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let activeProjectId: string | null = null;
let tabInjections: Record<number, TabInjectionRecord> = {};
let healthState: TransientState["healthState"] = "HEALTHY";
let currentSessionId = "";
let persistenceMode: TransientState["persistenceMode"] = "memory";

/* ------------------------------------------------------------------ */
/*  Getters                                                            */
/* ------------------------------------------------------------------ */

/** Returns the currently active project ID. */
export function getActiveProjectId(): string | null {
    return activeProjectId;
}

/** Returns the tab injection records. */
export function getTabInjections(): Record<number, TabInjectionRecord> {
    return tabInjections;
}

/** Returns the current health state. */
export function getHealthState(): TransientState["healthState"] {
    return healthState;
}

/** Returns the current session ID. */
export function getCurrentSessionId(): string {
    return currentSessionId;
}

/* ------------------------------------------------------------------ */
/*  Setters                                                            */
/* ------------------------------------------------------------------ */

/** Updates the active project ID. */
export function setActiveProjectId(id: string | null): void {
    activeProjectId = id;
}

/** Records a script injection for a tab. */
export function setTabInjection(tabId: number, record: TabInjectionRecord): void {
    tabInjections[tabId] = record;
}

/** Removes injection tracking for a closed tab. */
export function removeTabInjection(tabId: number): void {
    delete tabInjections[tabId];
}

/** Updates the health state. */
export function setHealthState(state: TransientState["healthState"]): void {
    healthState = state;
}

/** Updates the current session ID. */
export function setCurrentSessionId(id: string): void {
    currentSessionId = id;
}

/** Updates the persistence mode. */
export function setPersistenceMode(mode: TransientState["persistenceMode"]): void {
    persistenceMode = mode;
}

/* ------------------------------------------------------------------ */
/*  Rehydration                                                        */
/* ------------------------------------------------------------------ */

/** Restores transient state from chrome.storage.session on wake. */
export async function rehydrateState(): Promise<void> {
    const stored = await chrome.storage.session.get(SESSION_KEY);
    const state: TransientState = stored[SESSION_KEY] ?? getDefaultState();

    activeProjectId = state.activeProjectId;
    tabInjections = state.tabInjections;
    healthState = state.healthState;
    currentSessionId = state.currentSessionId;
    persistenceMode = state.persistenceMode;

    await pruneClosedTabs();
    console.log("[state-manager] State rehydrated");
}

/** Returns the default empty transient state. */
function getDefaultState(): TransientState {
    return {
        activeProjectId: null,
        tabInjections: {},
        healthState: "HEALTHY",
        currentSessionId: "",
        persistenceMode: "memory",
        lastFlushTimestamp: new Date().toISOString(),
    };
}

/** Removes injection entries for tabs that no longer exist. */
async function pruneClosedTabs(): Promise<void> {
    const tabs = await chrome.tabs.query({});
    const validTabIds = new Set(tabs.map((t) => t.id));

    for (const tabIdStr of Object.keys(tabInjections)) {
        const tabId = Number(tabIdStr);
        const isTabClosed = !validTabIds.has(tabId);

        if (isTabClosed) {
            delete tabInjections[tabId];
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

/** Saves all transient state to chrome.storage.session. */
export async function saveTransientState(): Promise<void> {
    const state: TransientState = {
        activeProjectId,
        tabInjections,
        healthState,
        currentSessionId,
        persistenceMode,
        lastFlushTimestamp: new Date().toISOString(),
    };

    await chrome.storage.session.set({ [SESSION_KEY]: state });
}
