/**
 * AuthDiagnosticsBar — Compact auth diagnostics for the extension popup.
 *
 * Shows token source, JWT TTL countdown, and last refresh outcome
 * in a single collapsible row below the status bar.
 */

import { useState } from "react";
import { useTokenWatchdog } from "@/hooks/use-token-watchdog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Key,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

export function AuthDiagnosticsBar() {
  const [expanded, setExpanded] = useState(false);
  const w = useTokenWatchdog();

  const dotColor = w.isExpired
    ? "bg-destructive"
    : w.isWarning
      ? "bg-warning"
      : w.ttlSec !== null
        ? "bg-success"
        : "bg-muted-foreground";

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Key className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
        <span className="text-[11px] font-medium truncate flex-1 text-left">
          {w.isExpired ? "Token Expired" : w.isWarning ? "Token Expiring" : "Auth"}
        </span>
        <Badge
          variant="outline"
          className={`text-[10px] font-mono px-1.5 py-0 h-4 shrink-0 ${
            w.isExpired
              ? "border-destructive text-destructive"
              : w.isWarning
                ? "border-warning text-warning animate-pulse"
                : ""
          }`}
        >
          <Clock className="h-2.5 w-2.5 mr-0.5" />
          {w.ttlDisplay}
        </Badge>
        <span className="text-[10px] text-muted-foreground capitalize shrink-0">{w.source}</span>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1.5 bg-muted/10">
          {/* Subject */}
          {w.subject && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Subject</span>
              <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded truncate max-w-[220px]">
                {w.subject}
              </code>
            </div>
          )}

          {/* Token preview */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Token</span>
            <code className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">
              {w.maskedToken}
            </code>
          </div>

          {/* Times */}
          {w.issuedAt && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Issued</span>
              <span className="text-[10px]">{new Date(w.issuedAt).toLocaleTimeString()}</span>
            </div>
          )}
          {w.expiresAt && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Expires</span>
              <span className="text-[10px]">{new Date(w.expiresAt).toLocaleTimeString()}</span>
            </div>
          )}

          {/* Refresh status */}
          {w.lastRefreshResult && (
            <div className="flex items-center gap-1 text-[10px]">
              {w.lastRefreshResult === "success" && (
                <><CheckCircle2 className="h-3 w-3 text-success" /><span className="text-success">Refreshed</span></>
              )}
              {w.lastRefreshResult === "failed" && (
                <><XCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">Failed</span></>
              )}
              {w.lastRefreshResult === "pending" && (
                <><RefreshCw className="h-3 w-3 animate-spin text-primary" /><span className="text-primary">Refreshing…</span></>
              )}
            </div>
          )}

          {/* Warning banners */}
          {w.isWarning && !w.refreshing && (
            <div className="rounded bg-warning/10 border border-warning/20 px-2 py-1 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
              <span className="text-[10px] text-warning-foreground">Auto-refresh triggered ({w.ttlDisplay} left)</span>
            </div>
          )}
          {w.isExpired && (
            <div className="rounded bg-destructive/10 border border-destructive/20 px-2 py-1 flex items-center gap-1.5">
              <XCircle className="h-3 w-3 text-destructive shrink-0" />
              <span className="text-[10px] text-destructive">Expired — refresh manually</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5 pt-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={w.reload}>
                  Read
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Read current token</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={w.forceRefresh} disabled={w.refreshing}>
                  <RefreshCw className={`h-2.5 w-2.5 ${w.refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">Force token refresh</p></TooltipContent>
            </Tooltip>
          </div>

          <p className="text-[9px] text-muted-foreground">Auto-refresh at &lt;5 min · Polls 10s</p>
        </div>
      )}
    </div>
  );
}
