import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/hooks/use-extension-data";
import { useTokenWatchdog } from "@/hooks/use-token-watchdog";
import { RefreshCw, Key, Globe, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export function AuthConfigPanel() {
  const { config, source, loading, refresh } = useConfig();
  const watchdog = useTokenWatchdog();

  const ttlBadgeVariant = watchdog.isExpired
    ? "destructive" as const
    : watchdog.isWarning
      ? "outline" as const
      : "secondary" as const;

  const ttlBadgeClass = watchdog.isExpired
    ? "bg-destructive text-destructive-foreground"
    : watchdog.isWarning
      ? "border-amber-500 text-amber-600 animate-pulse"
      : "";

  return (
    <div className="space-y-4">
      {/* Token & Watchdog */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Key className="inline h-4 w-4 mr-1.5" />
            Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Token display */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Bearer Token</span>
            <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
              {watchdog.maskedToken}
            </code>
          </div>

          {/* TTL Countdown */}
          <div className="flex items-center justify-between">
            <span className="text-sm flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              Token TTL
            </span>
            <Badge variant={ttlBadgeVariant} className={`font-mono text-xs ${ttlBadgeClass}`}>
              {watchdog.isExpired && <AlertTriangle className="h-3 w-3 mr-1" />}
              {watchdog.ttlDisplay}
            </Badge>
          </div>

          {/* Source */}
          <div className="flex items-center justify-between">
            <span className="text-sm">Source</span>
            <Badge variant="outline" className="text-xs capitalize">{watchdog.source}</Badge>
          </div>

          {/* Subject */}
          {watchdog.subject && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Subject</span>
              <code className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                {watchdog.subject}
              </code>
            </div>
          )}

          {/* Issued / Expires */}
          {watchdog.issuedAt && (
            <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
              <div>
                <span className="font-medium">Issued:</span>{" "}
                {new Date(watchdog.issuedAt).toLocaleTimeString()}
              </div>
              <div>
                <span className="font-medium">Expires:</span>{" "}
                {watchdog.expiresAt ? new Date(watchdog.expiresAt).toLocaleTimeString() : "—"}
              </div>
            </div>
          )}

          {/* Last refresh result */}
          {watchdog.lastRefreshResult && (
            <div className="flex items-center gap-1.5 text-xs">
              {watchdog.lastRefreshResult === "success" && (
                <><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /><span className="text-green-600">Auto-refresh succeeded</span></>
              )}
              {watchdog.lastRefreshResult === "failed" && (
                <><XCircle className="h-3.5 w-3.5 text-destructive" /><span className="text-destructive">Refresh failed</span></>
              )}
              {watchdog.lastRefreshResult === "pending" && (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /><span className="text-primary">Refreshing…</span></>
              )}
            </div>
          )}

          {/* Warning banner */}
          {watchdog.isWarning && !watchdog.refreshing && (
            <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs text-amber-700">
                Token expires in {watchdog.ttlDisplay} — auto-refresh triggered
              </span>
            </div>
          )}

          {watchdog.isExpired && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive">Token expired — click Refresh to re-authenticate</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={watchdog.reload} disabled={watchdog.refreshing}>
              Read Token
            </Button>
            <Button variant="outline" size="sm" onClick={watchdog.forceRefresh} disabled={watchdog.refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${watchdog.refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground">
            Auto-refresh triggers when TTL &lt; 5 minutes. Polling every 10s.
          </p>
        </CardContent>
      </Card>

      {/* Remote Config */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            <Globe className="inline h-4 w-4 mr-1.5" />
            Configuration
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Source</span>
            <Badge variant="outline" className="capitalize">{source || "—"}</Badge>
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Cascade: Remote Endpoint → Local Overrides → Bundled Defaults
          </div>
          {config && (
            <div className="rounded-md bg-muted/50 p-3 space-y-1.5 font-mono text-xs">
              {Object.entries(config).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-muted-foreground">{key}</span>
                  <span>{String(value)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
