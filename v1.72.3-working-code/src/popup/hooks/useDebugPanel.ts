/**
 * Marco Extension — React Popup: Debug Panel Hook
 *
 * Tracks per-action debug state (OK or error) for
 * Run, Re-inject, Logs, Export actions.
 */

import { useState, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DebugAction = string;

export interface DebugEntry {
    action: DebugAction;
    error: string | null;
    timestamp: Date;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useDebugPanel() {
    const [entries, setEntries] = useState<Map<string, DebugEntry>>(new Map());
    const [isVisible, setIsVisible] = useState(false);

    const debugOk = useCallback((action: string) => {
        setEntries((prev) => {
            const next = new Map(prev);
            next.set(action, { action, error: null, timestamp: new Date() });
            return next;
        });
        setIsVisible(true);
    }, []);

    const debugError = useCallback((action: string, errorMessage: string) => {
        setEntries((prev) => {
            const next = new Map(prev);
            next.set(action, { action, error: errorMessage, timestamp: new Date() });
            return next;
        });
        setIsVisible(true);
    }, []);

    const clear = useCallback(() => {
        setEntries(new Map());
        setIsVisible(false);
    }, []);

    return { entries, isVisible, debugOk, debugError, clear };
}
