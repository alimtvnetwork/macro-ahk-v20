/**
 * Marco Extension — React Popup: Action Log Hook
 *
 * Manages timestamped action log entries shown in the
 * Action Status panel (last 8 entries, color-coded).
 */

import { useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ActionStatus = "success" | "error" | "info";

export interface ActionLogEntry {
    action: string;
    status: ActionStatus;
    detail: string;
    timestamp: Date;
}

const MAX_LOG_ENTRIES = 8;

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useActionLog() {
    const [entries, setEntries] = useState<ActionLogEntry[]>([]);

    const addEntry = useCallback(
        (action: string, status: ActionStatus, detail: string) => {
            setEntries((prev) => {
                const next = [
                    { action, status, detail, timestamp: new Date() },
                    ...prev,
                ];
                const isOverLimit = next.length > MAX_LOG_ENTRIES;
                return isOverLimit ? next.slice(0, MAX_LOG_ENTRIES) : next;
            });
        },
        [],
    );

    const logSuccess = useCallback(
        (action: string, detail: string) => addEntry(action, "success", detail),
        [addEntry],
    );

    const logError = useCallback(
        (action: string, detail: string) => addEntry(action, "error", detail),
        [addEntry],
    );

    const logInfo = useCallback(
        (action: string, detail: string) => addEntry(action, "info", detail),
        [addEntry],
    );

    return { entries, logSuccess, logError, logInfo };
}
