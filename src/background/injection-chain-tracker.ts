/**
 * Marco Extension — Injection Chain Tracker
 *
 * Records the dependency chain for each injection pipeline run.
 * Stores the last pipeline's per-script tracking data in memory
 * so the popup can query it without parsing logs.
 *
 * Each entry records: script name, role (global-dep / explicit-dep / target),
 * whether it was resolved, fetched (code loaded), and executed successfully,
 * plus its position in the dependency-ordered chain.
 */

export interface ChainEntry {
    /** Script seed ID */
    scriptId: string;
    /** Human-readable script name (e.g., "marco-sdk.js") */
    scriptName: string;
    /** Role in the chain */
    role: "global-dep" | "explicit-dep" | "target";
    /** 0-based position in resolved injection order */
    order: number;
    /** Whether the script was found in the store */
    resolved: boolean;
    /** Whether script code was fetched/loaded (from cache or filePath) */
    fetched: boolean;
    /** Whether chrome.scripting.executeScript succeeded */
    executed: boolean;
    /** Duration of the execute step in ms (null if not executed) */
    executeMs: number | null;
    /** Source of the code: "cache" | "fetch" | "stub" | null */
    codeSource: string | null;
    /** Error message if any step failed */
    error: string | null;
}

export interface ChainSnapshot {
    /** ISO timestamp of this pipeline run */
    timestamp: string;
    /** Tab ID the scripts were injected into */
    tabId: number;
    /** Total pipeline duration in ms */
    totalMs: number;
    /** Ordered chain entries */
    chain: ChainEntry[];
}

/** In-memory storage for the last N pipeline chain snapshots. */
const MAX_SNAPSHOTS = 5;
const _snapshots: ChainSnapshot[] = [];

/** Record a new chain snapshot from a completed injection pipeline. */
export function recordChainSnapshot(snapshot: ChainSnapshot): void {
    _snapshots.unshift(snapshot);
    if (_snapshots.length > MAX_SNAPSHOTS) {
        _snapshots.length = MAX_SNAPSHOTS;
    }
}

/** Get the most recent chain snapshot (or null). */
export function getLatestChainSnapshot(): ChainSnapshot | null {
    return _snapshots[0] ?? null;
}

/** Get all stored chain snapshots (most recent first). */
export function getAllChainSnapshots(): ChainSnapshot[] {
    return _snapshots.slice();
}