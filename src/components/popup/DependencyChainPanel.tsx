/**
 * DependencyChainPanel — Shows the dependency chain from the last injection run.
 *
 * Displays whether marco-sdk, xpath, and macro-looping were resolved, fetched,
 * and executed in the correct dependency order.
 */

import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from "lucide-react";

interface ChainEntry {
  scriptId: string;
  scriptName: string;
  role: "global-dep" | "explicit-dep" | "target";
  order: number;
  resolved: boolean;
  fetched: boolean;
  executed: boolean;
  executeMs: number | null;
  codeSource: string | null;
  error: string | null;
}

interface ChainSnapshot {
  timestamp: string;
  tabId: number;
  totalMs: number;
  chain: ChainEntry[];
}

const ROLE_LABELS: Record<string, string> = {
  "global-dep": "Global",
  "explicit-dep": "Dep",
  target: "Target",
};

const ROLE_COLORS: Record<string, string> = {
  "global-dep": "border-[hsl(var(--accent-foreground))]/30 text-[hsl(var(--accent-foreground))]",
  "explicit-dep": "border-[hsl(var(--primary))]/30 text-[hsl(var(--primary))]",
  target: "border-[hsl(var(--foreground))]/30 text-foreground",
};

function StepDot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
  ) : (
    <XCircle className="h-3 w-3 text-[hsl(var(--destructive))] shrink-0" />
  );
}

// eslint-disable-next-line max-lines-per-function -- self-contained collapsible panel
export function DependencyChainPanel() {
  const [expanded, setExpanded] = useState(false);
  const [snapshot, setSnapshot] = useState<ChainSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchChain = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ latest: ChainSnapshot | null }>({
        type: "GET_INJECTION_CHAIN",
      });
      setSnapshot(result?.latest ?? null);
    } catch {
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expanded) {
      fetchChain();
    }
  }, [expanded, fetchChain]);

  const allOk = snapshot?.chain.every((c) => c.resolved && c.fetched && c.executed) ?? false;
  const hasErrors = snapshot?.chain.some((c) => c.error) ?? false;

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Link2 className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium truncate flex-1 text-left">
          Dependency Chain
        </span>
        {snapshot && (
          <Badge
            variant="outline"
            className={`text-[10px] px-1.5 py-0 h-4 shrink-0 ${
              allOk
                ? "border-emerald-500/50 text-emerald-500"
                : hasErrors
                  ? "border-[hsl(var(--destructive))]/50 text-[hsl(var(--destructive))]"
                  : "border-[hsl(var(--warning))]/50 text-[hsl(var(--warning))]"
            }`}
          >
            {allOk ? "✓ OK" : hasErrors ? "✗ Error" : "⚠ Partial"}
          </Badge>
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2 bg-muted/10">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">
              Last injection chain
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={fetchChain}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {!snapshot && !loading && (
            <p className="text-[10px] text-muted-foreground py-1">
              No injection chain recorded yet. Run scripts to see the dependency order.
            </p>
          )}

          {loading && !snapshot && (
            <div className="h-12 rounded bg-muted animate-pulse" />
          )}

          {snapshot && (
            <>
              {/* Header */}
              <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{new Date(snapshot.timestamp).toLocaleTimeString()}</span>
                <span>·</span>
                <span>{snapshot.totalMs}ms total</span>
                <span>·</span>
                <span>tab {snapshot.tabId}</span>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_50px_26px_26px_26px] gap-1 items-center text-[8px] text-muted-foreground uppercase tracking-wider px-1">
                <span>Script</span>
                <span className="text-center">Role</span>
                <span className="text-center" title="Resolved from storage">R</span>
                <span className="text-center" title="Code fetched/loaded">F</span>
                <span className="text-center" title="Executed successfully">E</span>
              </div>

              {/* Chain entries */}
              <div className="space-y-0.5">
                {snapshot.chain.map((entry, idx) => (
                  <div
                    key={entry.scriptId}
                    className="grid grid-cols-[1fr_50px_26px_26px_26px] gap-1 items-center px-1 py-0.5 rounded hover:bg-muted/40 transition-colors group"
                  >
                    {/* Script name + order */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[9px] text-muted-foreground font-mono w-3 shrink-0 text-right">
                        {idx + 1}
                      </span>
                      {idx > 0 && (
                        <span className="text-[8px] text-muted-foreground/50">→</span>
                      )}
                      <span className="text-[10px] font-medium truncate" title={entry.scriptId}>
                        {entry.scriptName}
                      </span>
                    </div>

                    {/* Role badge */}
                    <Badge
                      variant="outline"
                      className={`text-[8px] px-1 py-0 h-3.5 justify-center ${ROLE_COLORS[entry.role] ?? ""}`}
                    >
                      {ROLE_LABELS[entry.role] ?? entry.role}
                    </Badge>

                    {/* R/F/E status dots */}
                    <div className="flex justify-center">
                      <StepDot ok={entry.resolved} />
                    </div>
                    <div className="flex justify-center">
                      <StepDot ok={entry.fetched} />
                    </div>
                    <div className="flex justify-center">
                      <StepDot ok={entry.executed} />
                    </div>

                    {/* Error/timing detail row */}
                    {(entry.error || entry.executeMs !== null) && (
                      <div className="col-span-5 pl-6 flex items-center gap-1.5">
                        {entry.error ? (
                          <>
                            <AlertCircle className="h-2.5 w-2.5 text-[hsl(var(--destructive))] shrink-0" />
                            <span className="text-[8px] text-[hsl(var(--destructive))] truncate">
                              {entry.error}
                            </span>
                          </>
                        ) : (
                          <span className="text-[8px] text-muted-foreground">
                            {entry.executeMs}ms
                            {entry.codeSource ? ` · ${entry.codeSource}` : ""}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
