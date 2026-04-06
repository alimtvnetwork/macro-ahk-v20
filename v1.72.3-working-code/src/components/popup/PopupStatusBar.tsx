import { AlertTriangle, ShieldAlert } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { StatusData, HealthData } from "@/hooks/use-popup-data";

interface Props {
  status: StatusData;
  health: HealthData;
}

export function PopupStatusBar({ status, health }: Props) {
  const isOnline = status.connection === "online";
  const tokenStatus = status.token?.status ?? "missing";
  const configSource = status.config?.source ?? "—";

  const tokenIsValid = tokenStatus === "valid";
  const tokenIsExpiring = tokenStatus === "expiring";

  const configLabel = configSource === "default" ? "Defaults" : configSource;

  const isDegraded = health.state === "DEGRADED";
  const cspDetails = (health.details ?? []).filter(
    (d) => d.includes("CSP") || d.includes("MAIN world") || d.includes("namespace"),
  );
  const hasCspIssue = cspDetails.length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {/* Connection */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap overflow-hidden">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isOnline ? "bg-[hsl(var(--success))]" : "bg-destructive"
                  }`}
                />
                <span className="text-xs font-semibold text-foreground truncate">
                  {isOnline ? "Online" : "Offline"}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {isOnline
                  ? `Connected · ${status.latencyMs != null ? `${status.latencyMs}ms` : "—"}`
                  : "Service worker is unreachable — try reloading the extension"}
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Token */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap overflow-hidden">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    tokenIsValid
                      ? "bg-[hsl(var(--success))]"
                      : tokenIsExpiring
                        ? "bg-[hsl(var(--warning))]"
                        : "bg-destructive"
                  }`}
                />
                <span className="text-xs font-semibold text-foreground truncate">
                  Token {tokenIsValid ? "Valid" : tokenStatus}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                {tokenIsValid
                  ? `Auth token active${status.token?.expiresIn ? ` · expires ${status.token.expiresIn}` : ""}`
                  : tokenStatus === "missing"
                    ? "No session cookie found — log in to the target site first"
                    : `Token status: ${tokenStatus}`}
              </p>
            </TooltipContent>
          </Tooltip>

          {/* Config */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors whitespace-nowrap overflow-hidden">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--warning))]" />
                <span className="text-xs font-semibold text-foreground truncate capitalize">
                  {configLabel}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">
                Source: {configSource === "default"
                  ? "bundled defaults (no remote or local overrides)"
                  : configSource}
                {status.config?.lastSyncAt
                  ? ` · synced ${new Date(status.config.lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : ""}
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Health degradation banner */}
        {isDegraded && (
          <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
            hasCspIssue
              ? "border-destructive/40 bg-destructive/5"
              : "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5"
          }`}>
            {hasCspIssue ? (
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[hsl(var(--warning))]" />
            )}
            <div className="min-w-0 space-y-1">
              <p className={`font-semibold ${hasCspIssue ? "text-destructive" : "text-[hsl(var(--warning))]"}`}>
                {hasCspIssue ? "CSP: Namespace Blocked" : "Health Degraded"}
              </p>
              {hasCspIssue ? (
                <p className="text-muted-foreground leading-relaxed">
                  This page's Content Security Policy blocked MAIN world injection.{" "}
                  <span className="font-mono text-[10px]">RiseupAsiaMacroExt.Projects.*</span>{" "}
                  is not accessible from the console. Scripts still execute via fallback.
                </p>
              ) : (
                <ul className="text-muted-foreground space-y-0.5">
                  {(health.details ?? []).map((detail, i) => (
                    <li key={i} className="truncate">• {detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}