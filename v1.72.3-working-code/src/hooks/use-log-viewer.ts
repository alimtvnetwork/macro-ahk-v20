/**
 * React hook for T-8 Log Viewer with filtering.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { sendMessage } from "@/lib/message-client";

export interface LogEntry {
    id: number;
    timestamp: string;
    level: string;
    source: string;
    category: string;
    action?: string;
    detail?: string;
    message?: string;
}

export type LogLevel = "all" | "info" | "warn" | "error";

export function useLogViewer(limit = 200) {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [levelFilter, setLevelFilter] = useState<LogLevel>("all");
    const [search, setSearch] = useState("");
    const [cleared, setCleared] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setCleared(false);
        const result = await sendMessage<{ logs: LogEntry[] }>({
            type: "GET_RECENT_LOGS",
            limit,
        });
        setEntries(result.logs ?? []);
        setLoading(false);
    }, [limit]);

    useEffect(() => { void refresh(); }, [refresh]);

    const clearView = useCallback(() => {
        setCleared(true);
    }, []);

    const filtered = useMemo(() => {
        if (cleared) return [];
        let result = entries;
        if (levelFilter !== "all") {
            result = result.filter(e => {
                const lvl = e.level?.toLowerCase() ?? "info";
                if (levelFilter === "info") return lvl === "info" || lvl === "log" || lvl === "debug";
                if (levelFilter === "warn") return lvl === "warn" || lvl === "warning";
                if (levelFilter === "error") return lvl === "error" || lvl === "fatal";
                return true;
            });
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(e =>
                (e.message ?? "").toLowerCase().includes(q) ||
                (e.detail ?? "").toLowerCase().includes(q) ||
                (e.action ?? "").toLowerCase().includes(q) ||
                (e.source ?? "").toLowerCase().includes(q) ||
                (e.category ?? "").toLowerCase().includes(q)
            );
        }
        return result;
    }, [entries, levelFilter, search, cleared]);

    return {
        entries: filtered,
        totalCount: entries.length,
        filteredCount: filtered.length,
        loading,
        levelFilter,
        setLevelFilter,
        search,
        setSearch,
        clearView,
        refresh,
    };
}
