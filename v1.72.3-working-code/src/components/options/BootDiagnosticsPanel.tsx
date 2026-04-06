import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStatus } from "@/hooks/use-extension-data";
import { HardDrive, Footprints, Timer } from "lucide-react";

const stepColors: Record<string, string> = {
  ready: "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
  "pre-init": "bg-muted text-muted-foreground",
};

function getStepColor(step: string): string {
  const isFailed = step.startsWith("failed:");
  if (isFailed) return "bg-destructive text-destructive-foreground";
  return stepColors[step] ?? "bg-[hsl(var(--warning))] text-[hsl(var(--warning-foreground))]";
}

const modeLabels: Record<string, string> = {
  opfs: "OPFS (SQLite)",
  storage: "chrome.storage",
  memory: "In-Memory",
};

const stepLabels: Record<string, string> = {
  "db-init": "DB Init",
  "bind-handlers": "Bind Handlers",
  "rehydrate-state": "Rehydrate",
  "start-session": "Start Session",
  "seed-scripts": "Seed Scripts",
  ready: "Ready",
};

export function BootDiagnosticsPanel() {
  const { status } = useStatus();

  const bootStep = status?.bootStep ?? "—";
  const persistenceMode = status?.persistenceMode ?? "memory";
  const timings = status?.bootTimings ?? [];
  const totalMs = status?.totalBootMs ?? 0;
  const hasTimings = timings.length > 0;

  const maxDuration = hasTimings
    ? Math.max(...timings.map((t) => t.durationMs))
    : 1;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Boot Diagnostics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Boot step & persistence */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Footprints className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Boot Step</span>
          </div>
          <Badge className={getStepColor(bootStep)}>{bootStep}</Badge>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Persistence</span>
          </div>
          <Badge variant="outline">
            {modeLabels[persistenceMode] ?? persistenceMode}
          </Badge>
        </div>

        {/* Timing breakdown */}
        {hasTimings && (
          <>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Boot Timings</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {totalMs}ms total
              </span>
            </div>

            <div className="space-y-2">
              {timings.map((t) => {
                const widthPercent = Math.max(
                  4,
                  (t.durationMs / maxDuration) * 100,
                );
                const isSlow = t.durationMs > 100;
                const barColor = isSlow
                  ? "bg-[hsl(var(--warning))]"
                  : "bg-primary";

                return (
                  <div key={t.step} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {stepLabels[t.step] ?? t.step}
                      </span>
                      <span className="text-xs font-mono tabular-nums text-foreground">
                        {t.durationMs}ms
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${barColor} transition-all`}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
