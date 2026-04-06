import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useStatus } from "@/hooks/use-extension-data";
import { RefreshCw, Shield, Wifi, WifiOff, Key, Settings2 } from "lucide-react";

const stateConfig: Record<string, { bg: string; text: string; pulse: boolean }> = {
  HEALTHY: {
    bg: "bg-[hsl(var(--success))]",
    text: "text-[hsl(var(--success-foreground))]",
    pulse: false,
  },
  DEGRADED: {
    bg: "bg-[hsl(var(--warning))]",
    text: "text-[hsl(var(--warning-foreground))]",
    pulse: false,
  },
  ERROR: {
    bg: "bg-destructive",
    text: "text-destructive-foreground",
    pulse: true,
  },
  FATAL: {
    bg: "bg-destructive",
    text: "text-destructive-foreground",
    pulse: true,
  },
};

const tokenColors: Record<string, string> = {
  valid: "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
  expiring: "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]",
  expired: "bg-destructive text-destructive-foreground",
  missing: "bg-muted text-muted-foreground",
};

export function StatusPanel() {
  const { status, health, loading, refresh } = useStatus();

  const state = health?.state ?? "HEALTHY";
  const cfg = stateConfig[state] ?? stateConfig.HEALTHY;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          System Status
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health State with indicator dot */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Health</span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${cfg.bg} ${cfg.pulse ? "animate-pulse" : ""}`}
            />
            <Badge className={`${cfg.bg} ${cfg.text}`}>
              {state}
            </Badge>
          </div>
        </div>

        {/* Connection */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {status?.connection === "online" ? (
              <Wifi className="h-4 w-4 text-muted-foreground" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm">Connection</span>
          </div>
          <Badge variant="outline">{status?.connection ?? "—"}</Badge>
        </div>

        {/* Token */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Auth Token</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={tokenColors[status?.token?.status ?? "missing"]}>
              {status?.token?.status ?? "—"}
            </Badge>
            {status?.token?.expiresIn && (
              <span className="text-xs text-muted-foreground">
                {status.token.expiresIn}
              </span>
            )}
          </div>
        </div>

        {/* Config */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Config</span>
          </div>
          <Badge variant="outline">
            {status?.config?.source ?? "—"}
          </Badge>
        </div>

        {/* Version & Logging */}
        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            v{status?.version ?? "—"} · {status?.loggingMode ?? "—"} logging
          </span>
          {health?.details && health.details.length > 0 && (
            <span className="text-xs text-destructive">
              {health.details.length} issue(s)
            </span>
          )}
        </div>

        {/* Health Details */}
        {health?.details && health.details.length > 0 && (
          <div className="rounded-md bg-destructive/10 p-3 space-y-1">
            {health.details.map((detail, i) => (
              <div key={i} className="text-xs text-destructive flex items-center gap-1.5">
                <span className="h-1 w-1 rounded-full bg-destructive" />
                {detail}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
