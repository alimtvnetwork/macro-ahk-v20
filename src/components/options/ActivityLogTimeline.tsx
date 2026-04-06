/**
 * Activity Log Timeline — Chronological event viewer
 *
 * Merges logs and errors into a unified timeline with:
 * - Color-coded severity indicators (info/warn/error)
 * - Timeline connector lines between events
 * - Collapsible stack traces for errors
 * - Filter by severity, source, and text search
 * - Stats summary bar
 * - Session history picker to browse & download past sessions
 */

import { useState, useEffect, useCallback } from "react";
import {
  useActivityTimeline,
  type TimelineEntry,
  type SeverityFilter,
  type SourceFilter,
} from "@/hooks/use-activity-timeline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  Search,
  Activity,
  Info,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Clock,
  ClipboardCopy,
  Download,
  Loader2,
  History,
  Trash2,
} from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Severity config                                                    */
/* ------------------------------------------------------------------ */

const SEVERITY_CONFIG: Record<string, {
  icon: typeof Info;
  dotClass: string;
  lineClass: string;
  badgeClass: string;
  label: string;
}> = {
  info: {
    icon: Info,
    dotClass: "bg-blue-500",
    lineClass: "bg-blue-500/20",
    badgeClass: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    label: "INFO",
  },
  log: {
    icon: Info,
    dotClass: "bg-blue-400",
    lineClass: "bg-blue-400/20",
    badgeClass: "bg-blue-400/10 text-blue-400 border-blue-400/20",
    label: "LOG",
  },
  debug: {
    icon: Info,
    dotClass: "bg-purple-400",
    lineClass: "bg-purple-400/20",
    badgeClass: "bg-purple-400/10 text-purple-400 border-purple-400/20",
    label: "DEBUG",
  },
  warn: {
    icon: AlertTriangle,
    dotClass: "bg-yellow-500",
    lineClass: "bg-yellow-500/20",
    badgeClass: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
    label: "WARN",
  },
  error: {
    icon: XCircle,
    dotClass: "bg-destructive",
    lineClass: "bg-destructive/20",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    label: "ERROR",
  },
};

function getSeverityConfig(level: string) {
  return SEVERITY_CONFIG[level] ?? SEVERITY_CONFIG.info;
}

/* ------------------------------------------------------------------ */
/*  Stats Bar                                                          */
/* ------------------------------------------------------------------ */

function StatsBar({ stats }: { stats: { total: number; info: number; warn: number; error: number } }) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-blue-500" />
        <span className="text-muted-foreground">{stats.info} info</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-yellow-500" />
        <span className="text-muted-foreground">{stats.warn} warn</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        <span className="text-muted-foreground">{stats.error} error</span>
      </div>
      <span className="text-muted-foreground/60 ml-auto">{stats.total} total</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Timeline Entry Row                                                 */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- timeline row with collapsible stack trace
function TimelineRow({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const [stackOpen, setStackOpen] = useState(false);
  const cfg = getSeverityConfig(entry.level);
  const Icon = cfg.icon;
  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handleCopy = () => {
    const lines = [
      `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`,
      entry.stack ? `Stack: ${entry.stack}` : "",
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied to clipboard");
  };

  return (
    <div className="flex gap-3 group">
      {/* Timeline connector */}
      <div className="flex flex-col items-center pt-1">
        <div className={`h-2.5 w-2.5 rounded-full ${cfg.dotClass} ring-2 ring-background shrink-0 z-10`} />
        {!isLast && (
          <div className={`w-px flex-1 ${cfg.lineClass} min-h-[20px]`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 pb-4 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
            <Clock className="h-3 w-3" />
            <span className="font-mono text-[11px]">{time}</span>
          </div>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${cfg.badgeClass}`}>
            {cfg.label}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {entry.source}
          </Badge>
          {entry.kind === "error" && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-destructive/5 text-destructive border-destructive/20">
              error record
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>

        {/* Message */}
        <p className="text-xs mt-1 leading-relaxed break-words">
          {entry.message}
        </p>

        {/* Detail */}
        {entry.detail && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {entry.detail}
          </p>
        )}

        {/* Stack trace (collapsible) */}
        {entry.stack && (
          <div className="mt-1.5">
            <button
              onClick={() => setStackOpen(!stackOpen)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
            >
              {stackOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Stack trace
            </button>
            {stackOpen && (
              <pre className="mt-1 p-2 rounded bg-muted/50 border border-border text-[10px] text-muted-foreground overflow-x-auto max-h-32 whitespace-pre-wrap break-all">
                {entry.stack}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter bar                                                         */
/* ------------------------------------------------------------------ */

const SEVERITY_OPTIONS: Array<{ value: SeverityFilter; label: string }> = [
  { value: "all", label: "All Levels" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warnings" },
  { value: "error", label: "Errors" },
];

const SOURCE_OPTIONS: Array<{ value: SourceFilter; label: string }> = [
  { value: "all", label: "All Sources" },
  { value: "background", label: "Background" },
  { value: "content", label: "Content" },
  { value: "user-script", label: "User Script" },
  { value: "macro", label: "Macro" },
];

/* ------------------------------------------------------------------ */
/*  Session History Picker                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- session picker with fetch + dropdown UI
function SessionHistoryPicker({
  selectedSession,
  onSelect,
}: {
  selectedSession: string | null;
  onSelect: (sid: string | null) => void;
}) {
  const [sessions, setSessions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ report: string; sessionId: string; sessions: string[] }>({
        type: "GET_SESSION_REPORT",
      });
      setSessions(result.sessions ?? []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleCopySession = async (sid: string) => {
    try {
      const result = await sendMessage<{ report: string }>({
        type: "GET_SESSION_REPORT",
        sessionId: sid,
      });
      await navigator.clipboard.writeText(result.report);
      toast.success(`Session #${sid} report copied`);
    } catch {
      toast.error("Failed to copy session report");
    }
  };

  const currentLabel = selectedSession
    ? `Session #${selectedSession}`
    : "Current Session";

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <History className="h-3.5 w-3.5" />
            Session History
          </div>

          <Select
            value={selectedSession ?? "__current__"}
            onValueChange={(v) => onSelect(v === "__current__" ? null : v)}
          >
            <SelectTrigger className="h-7 w-[180px] text-xs">
              <SelectValue placeholder="Select session…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__current__" className="text-xs">
                Current Session
              </SelectItem>
              {sessions.map((sid) => (
                <SelectItem key={sid} value={sid} className="text-xs">
                  Session #{sid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedSession && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => handleCopySession(selectedSession)}
              >
                <ClipboardCopy className="h-3 w-3" />
                Copy Report
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-primary"
                onClick={() => onSelect(null)}
              >
                ← Back to current
              </Button>
            </>
          )}

          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}

          <span className="text-[11px] text-muted-foreground ml-auto">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} available
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Historical Session Viewer                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- loading + report + copy button states
function HistoricalSessionView({ sessionId }: { sessionId: string }) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    sendMessage<{ report: string }>({
      type: "GET_SESSION_REPORT",
      sessionId,
    })
      .then((r) => setReport(r.report))
      .catch(() => setReport("[Failed to load session report]"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const handleCopy = async () => {
    if (!report) return;
    await navigator.clipboard.writeText(report);
    toast.success("Report copied to clipboard");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading session #{sessionId}…
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          Session #{sessionId} — Full Report
          <Button variant="outline" size="sm" className="ml-auto h-6 gap-1 text-xs" onClick={handleCopy}>
            <ClipboardCopy className="h-3 w-3" />
            Copy
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px]">
          <pre className="text-[11px] font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
            {report}
          </pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function ActivityLogTimeline() {
  const {
    entries,
    stats,
    loading,
    severityFilter,
    setSeverityFilter,
    sourceFilter,
    setSourceFilter,
    search,
    setSearch,
    refresh,
  } = useActivityTimeline(500);

  const [copyLoading, setCopyLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const handleCopyAll = async () => {
    setCopyLoading(true);
    try {
      // Try file-based full session report first
      let report: string;
      try {
        const result = await sendMessage<{ report: string }>({
          type: "GET_SESSION_REPORT",
        });
        report = result.report;
      } catch {
        // Fallback: build from in-memory entries
        const lines = entries.map((e) => {
          const ts = e.timestamp;
          const lvl = e.level.toUpperCase().padEnd(5);
          const src = e.source;
          const msg = e.message;
          const detail = e.detail ? ` | ${e.detail}` : "";
          const stack = e.stack ? `\n    Stack: ${e.stack}` : "";
          return `${ts}  ${lvl}  [${src}]  ${msg}${detail}${stack}`;
        });

        const version = (() => {
          try {
            const g = globalThis as { chrome?: { runtime?: { getManifest?: () => { version?: string } } } };
            return g.chrome?.runtime?.getManifest?.().version ?? "?";
          } catch { return "?"; }
        })();

        report = [
          "═══════════════════════════════════════════",
          `  Marco Activity Report`,
          `  Generated: ${new Date().toISOString()}`,
          `  Version: ${version}`,
          `  Events: ${entries.length} (${stats.info} info, ${stats.warn} warn, ${stats.error} error)`,
          "═══════════════════════════════════════════",
          "",
          ...lines,
          "",
        ].join("\n");
      }

      await navigator.clipboard.writeText(report);
      toast.success("Full session report copied to clipboard");
    } catch {
      toast.error("Failed to copy");
    } finally {
      setCopyLoading(false);
    }
  };

  const handleExportZip = async () => {
    setExportLoading(true);
    try {
      const result = await sendMessage<{ isOk: boolean }>({ type: "EXPORT_ZIP" });
      if (result.isOk) {
        toast.success("ZIP bundle downloaded");
      }
    } catch {
      toast.error("Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Activity Timeline
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chronological log of all events, warnings, and errors across the extension.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={handleCopyAll} disabled={copyLoading || entries.length === 0} className="gap-1.5">
            {copyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
            Copy Report
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportZip} disabled={exportLoading} className="gap-1.5">
            {exportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export ZIP
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive hover:bg-destructive/10"
            onClick={async () => {
              try {
                await Promise.all([
                  sendMessage({ type: "CLEAR_ERRORS" }),
                  sendMessage({ type: "PURGE_LOGS", olderThanDays: 0 }),
                ]);
                toast.success("All logs and errors cleared");
                refresh();
              } catch {
                toast.error("Failed to clear logs");
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear All
          </Button>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Session History Picker */}
      <SessionHistoryPicker
        selectedSession={selectedSession}
        onSelect={setSelectedSession}
      />

      {/* Show historical session view OR current timeline */}
      {selectedSession ? (
        <HistoricalSessionView sessionId={selectedSession} />
      ) : (
        <>
          {/* Stats */}
          <Card>
            <CardContent className="py-3">
              <StatsBar stats={stats} />
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Severity filter */}
                <div className="flex gap-0.5 rounded-md border border-border p-0.5">
                  {SEVERITY_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={severityFilter === opt.value ? "default" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setSeverityFilter(opt.value)}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>

                {/* Source filter */}
                <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
                  <SelectTrigger className="h-7 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Search */}
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search events..."
                    className="h-7 text-xs pl-7"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Events
                <span className="text-xs text-muted-foreground font-normal">
                  {entries.length} of {stats.total}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Loading events…
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                    <Activity className="h-8 w-8 opacity-30" />
                    <span className="text-xs">No events match your filters.</span>
                  </div>
                ) : (
                  <div className="pl-1">
                    {entries.map((entry, idx) => (
                      <TimelineRow
                        key={entry.id}
                        entry={entry}
                        isLast={idx === entries.length - 1}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
