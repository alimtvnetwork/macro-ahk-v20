/**
 * Error Drawer — Slide-out panel showing all active errors
 *
 * Opened from the error badge in the sidebar. Shows a chronological
 * list of errors with severity badges, timestamps, collapsible stacks,
 * per-item copy, and bulk actions (copy all / clear).
 */

import { useState, useCallback } from "react";
import { useActivityTimeline, type TimelineEntry } from "@/hooks/use-activity-timeline";
import { sendMessage } from "@/lib/message-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  XCircle,
  Copy,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Clock,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ErrorDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Severity helpers                                                   */
/* ------------------------------------------------------------------ */

const LEVEL_STYLE: Record<string, { icon: typeof XCircle; badgeClass: string; dotClass: string }> = {
  error: {
    icon: XCircle,
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
    dotClass: "bg-destructive",
  },
  warn: {
    icon: AlertTriangle,
    badgeClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    dotClass: "bg-yellow-500",
  },
};

function getLevelStyle(level: string) {
  return LEVEL_STYLE[level] ?? LEVEL_STYLE.warn;
}

/* ------------------------------------------------------------------ */
/*  Error Row                                                          */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function -- error row with collapsible stack trace
function ErrorRow({ entry, isLast }: { entry: TimelineEntry; isLast: boolean }) {
  const [stackOpen, setStackOpen] = useState(false);
  const style = getLevelStyle(entry.level);
  const Icon = style.icon;

  const time = new Date(entry.timestamp).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const handleCopy = useCallback(() => {
    const lines = [
      `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}`,
      entry.detail ? `Detail: ${entry.detail}` : "",
      entry.stack ? `Stack:\n${entry.stack}` : "",
    ].filter(Boolean);
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Copied to clipboard");
  }, [entry]);

  return (
    <div className="flex gap-3 group">
      {/* Timeline connector */}
      <div className="flex flex-col items-center pt-1.5 shrink-0">
        <div className={`h-2 w-2 rounded-full ${style.dotClass} ring-2 ring-background z-10`} />
        {!isLast && <div className="w-px flex-1 bg-border min-h-[16px]" />}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 ${isLast ? "pb-2" : "pb-4"}`}>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Clock className="h-2.5 w-2.5" />
            <span className="font-mono text-[10px]">{time}</span>
          </span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${style.badgeClass}`}>
            {entry.level.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
            {entry.source}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>

        <p className="text-xs mt-1 leading-relaxed break-words">{entry.message}</p>

        {entry.detail && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{entry.detail}</p>
        )}

        {entry.stack && (
          <div className="mt-1">
            <button
              onClick={() => setStackOpen(!stackOpen)}
              className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
            >
              {stackOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Stack trace
            </button>
            {stackOpen && (
              <pre className="mt-1 p-2 rounded bg-muted/50 border border-border text-[10px] text-muted-foreground overflow-x-auto max-h-28 whitespace-pre-wrap break-all">
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
/*  Drawer                                                             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function ErrorDrawer({ open, onOpenChange }: ErrorDrawerProps) {
  const {
    entries,
    stats,
    loading,
    refresh,
  } = useActivityTimeline(300);

  // Filter to only errors + warnings
  const errorEntries = entries.filter(
    (e) => e.level === "error" || e.level === "warn",
  );

  const handleCopyAll = useCallback(() => {
    if (errorEntries.length === 0) {
      toast.info("No errors to copy");
      return;
    }

    const lines = errorEntries.map(
      (e) => `[${e.timestamp}] [${e.level.toUpperCase()}] [${e.source}] ${e.message}`,
    );
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success(`Copied ${errorEntries.length} entries`);
  }, [errorEntries]);

  const handleClearAll = useCallback(async () => {
    try {
      await sendMessage({ type: "CLEAR_ERRORS" });
      toast.success("All errors cleared");
      await refresh();
    } catch {
      toast.error("Failed to clear errors");
    }
  }, [refresh]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[420px] sm:w-[480px] flex flex-col p-0">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <SheetTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-4.5 w-4.5 text-destructive" />
            Errors & Warnings
            {(stats.error + stats.warn) > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                {stats.error + stats.warn}
              </Badge>
            )}
          </SheetTitle>
          <SheetDescription className="text-xs">
            Recent errors and warnings from all extension sources.
          </SheetDescription>
        </SheetHeader>

        {/* Stats strip */}
        <div className="px-5 py-2.5 border-b border-border flex items-center gap-4 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            <span className="text-muted-foreground">{stats.error} errors</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-muted-foreground">{stats.warn} warnings</span>
          </div>
          <div className="ml-auto flex gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopyAll}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Error list */}
        <ScrollArea className="flex-1 px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : errorEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
              <ShieldAlert className="h-10 w-10 opacity-20" />
              <span className="text-xs">No errors or warnings found.</span>
              <span className="text-[11px] text-muted-foreground/60">Everything looks good!</span>
            </div>
          ) : (
            <div className="pl-1">
              {errorEntries.map((entry, idx) => (
                <ErrorRow
                  key={entry.id}
                  entry={entry}
                  isLast={idx === errorEntries.length - 1}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
