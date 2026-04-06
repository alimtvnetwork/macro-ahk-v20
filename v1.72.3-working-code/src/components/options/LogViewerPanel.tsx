/**
 * Log Viewer Panel — Spec 15 T-8
 *
 * Scrollable log list with level icons, filter buttons,
 * search box, and clear button.
 */

import { useLogViewer, type LogLevel, type LogEntry } from "@/hooks/use-log-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    RefreshCw,
    Trash2,
    ScrollText,
    Info,
    AlertTriangle,
    XCircle,
    Search,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Level config                                                       */
/* ------------------------------------------------------------------ */

const LEVEL_CONFIG: Record<string, { icon: typeof Info; colorClass: string; label: string }> = {
    info: { icon: Info, colorClass: "text-blue-500", label: "INFO" },
    log: { icon: Info, colorClass: "text-blue-500", label: "LOG" },
    debug: { icon: Info, colorClass: "text-blue-400", label: "DEBUG" },
    warn: { icon: AlertTriangle, colorClass: "text-yellow-500", label: "WARN" },
    warning: { icon: AlertTriangle, colorClass: "text-yellow-500", label: "WARN" },
    error: { icon: XCircle, colorClass: "text-destructive", label: "ERROR" },
    fatal: { icon: XCircle, colorClass: "text-destructive", label: "FATAL" },
};

function getLevelConfig(level: string) {
    return LEVEL_CONFIG[level?.toLowerCase()] ?? LEVEL_CONFIG.info;
}

/* ------------------------------------------------------------------ */
/*  Filter buttons                                                     */
/* ------------------------------------------------------------------ */

const FILTER_OPTIONS: Array<{ value: LogLevel; label: string }> = [
    { value: "all", label: "All" },
    { value: "info", label: "Info" },
    { value: "warn", label: "Warn" },
    { value: "error", label: "Error" },
];

/* ------------------------------------------------------------------ */
/*  Log Row                                                            */
/* ------------------------------------------------------------------ */

function LogRow({ entry }: { entry: LogEntry }) {
    const cfg = getLevelConfig(entry.level);
    const Icon = cfg.icon;
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const text = entry.message || entry.detail || entry.action || "—";

    return (
        <div className="flex items-start gap-2 py-1.5 px-2 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors text-xs">
            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.colorClass}`} />
            <span className="text-muted-foreground shrink-0 w-16 font-mono">{time}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0 h-4">
                {entry.source}
            </Badge>
            <span className="truncate">{text}</span>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

export function LogViewerPanel() {
    const {
        entries,
        totalCount,
        filteredCount,
        loading,
        levelFilter,
        setLevelFilter,
        search,
        setSearch,
        clearView,
        refresh,
    } = useLogViewer(200);

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-primary" />
                    Log Viewer
                    <span className="text-xs text-muted-foreground font-normal ml-1">
                        {filteredCount}/{totalCount}
                    </span>
                </CardTitle>
                <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={clearView}>
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Filter bar */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Level filters */}
                    <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                        {FILTER_OPTIONS.map(opt => (
                            <Button
                                key={opt.value}
                                variant={levelFilter === opt.value ? "default" : "ghost"}
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => setLevelFilter(opt.value)}
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 min-w-[140px]">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Filter logs..."
                            className="h-7 text-xs pl-7"
                        />
                    </div>
                </div>

                {/* Log list */}
                <ScrollArea className="h-[300px] rounded-md border border-border bg-muted/20">
                    {entries.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                            {loading ? "Loading..." : "No log entries."}
                        </div>
                    ) : (
                        <div>
                            {entries.map(entry => (
                                <LogRow key={entry.id} entry={entry} />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
