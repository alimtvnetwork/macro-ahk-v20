/**
 * React hook for T-7 Run Statistics Dashboard.
 */

import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

export interface CycleMetric {
    cycleNumber: number;
    startTime: string;
    endTime: string;
    durationMs: number;
    status: "success" | "error" | "skipped";
    errorMessage?: string;
}

export interface RunStats {
    totalCycles: number;
    successCount: number;
    errorCount: number;
    skippedCount: number;
    successRate: number;
    avgDurationMs: number;
    lastErrorMessage: string | null;
    recentCycles: CycleMetric[];
}

export function useRunStats() {
    const [stats, setStats] = useState<RunStats | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true);
        const s = await sendMessage<RunStats>({ type: "GET_RUN_STATS" });
        setStats(s);
        setLoading(false);
    }, []);

    const clear = useCallback(async () => {
        await sendMessage({ type: "CLEAR_RUN_STATS" });
        setStats({
            totalCycles: 0,
            successCount: 0,
            errorCount: 0,
            skippedCount: 0,
            successRate: 0,
            avgDurationMs: 0,
            lastErrorMessage: null,
            recentCycles: [],
        });
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    return { stats, loading, refresh, clear };
}
