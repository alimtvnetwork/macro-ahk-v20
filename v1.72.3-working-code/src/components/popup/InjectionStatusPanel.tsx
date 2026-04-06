import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Route, Shield, Zap, Globe, Box } from "lucide-react";
import type { InjectionStatus, PopupScript } from "@/hooks/use-popup-data";

interface Props {
  injections: InjectionStatus | null;
  scripts: PopupScript[];
}

const PATH_CONFIG: Record<string, {
  label: string;
  dotColor: string;
  badgeBorder: string;
  badgeText: string;
  icon: typeof Zap;
  tier: number;
  description: string;
}> = {
  "main-inline": {
    label: "MAIN (direct)",
    dotColor: "bg-[hsl(var(--success))]",
    badgeBorder: "border-[hsl(var(--success))]/50",
    badgeText: "text-[hsl(var(--success))]",
    icon: Zap,
    tier: 1,
    description: "Direct injection — fastest, no fallback needed",
  },
  "main-blob": {
    label: "MAIN (blob)",
    dotColor: "bg-[hsl(var(--success))]",
    badgeBorder: "border-[hsl(var(--success))]/50",
    badgeText: "text-[hsl(var(--success))]",
    icon: Zap,
    tier: 1,
    description: "Blob URL injection — bypasses inline script blocking",
  },
  "userScripts": {
    label: "userScripts API",
    dotColor: "bg-[hsl(var(--primary))]",
    badgeBorder: "border-[hsl(var(--primary))]/50",
    badgeText: "text-[hsl(var(--primary))]",
    icon: Shield,
    tier: 2,
    description: "Fallback via Chrome userScripts API (CSP/Osano bypass)",
  },
  "isolated-blob": {
    label: "ISOLATED (blob)",
    dotColor: "bg-[hsl(var(--warning))]",
    badgeBorder: "border-[hsl(var(--warning))]/50",
    badgeText: "text-[hsl(var(--warning))]",
    icon: Globe,
    tier: 3,
    description: "Legacy blob fallback — ISOLATED world, limited page access",
  },
};

const TIER_STEPS = [
  { key: "main-blob", label: "MAIN" },
  { key: "userScripts", label: "userScripts" },
  { key: "isolated-blob", label: "ISOLATED" },
];

export function InjectionStatusPanel({ injections, scripts }: Props) {
  const hasInjections = injections !== null;
  const isMissingInjections = injections === null;
  const injectedCount = injections?.scriptIds.length ?? 0;
  const injectionPath = injections?.injectionPath ?? null;
  const pathConfig = injectionPath !== null ? PATH_CONFIG[injectionPath] ?? null : null;
  const isFallback = pathConfig !== null && pathConfig.tier > 1;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Tab Injection</span>
        {hasInjections ? (
          <Badge variant="default" className="text-[10px] gap-1">
            <CheckCircle className="h-3 w-3" />
            {injectedCount} injected
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Clock className="h-3 w-3" />
            No injection
          </Badge>
        )}
      </div>

      {hasInjections && (
        <div className="rounded-md border border-border bg-card p-2 space-y-1.5">
          {injections.scriptIds.map((sid) => {
            const script = scripts.find((s) => s.id === sid);
            const scriptName = script?.name ?? sid;

            return (
              <div key={sid} className="flex items-center gap-1.5">
                <CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" />
                <span className="text-xs text-foreground">{scriptName}</span>
              </div>
            );
          })}

          {/* Bypass path indicator */}
          <div className="pt-1.5 border-t border-border mt-1 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Route className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Path:</span>
              {pathConfig !== null ? (
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1.5 py-0 h-4 gap-1 ${pathConfig.badgeBorder} ${pathConfig.badgeText}`}
                >
                  <pathConfig.icon className="h-2.5 w-2.5" />
                  {pathConfig.label}
                </Badge>
              ) : (
                <span className="text-[10px] font-mono text-muted-foreground">unknown</span>
              )}
            </div>

            {/* Tier progress indicator */}
            <div className="flex items-center gap-0.5 px-0.5">
              {TIER_STEPS.map((step, i) => {
                const stepConfig = PATH_CONFIG[step.key];
                const isActive = injectionPath === step.key || injectionPath === "main-inline" && step.key === "main-blob";
                const isPassed = pathConfig !== null && stepConfig !== undefined && stepConfig.tier < pathConfig.tier;

                return (
                  <div key={step.key} className="flex items-center gap-0.5 flex-1">
                    <div className="flex flex-col items-center gap-0.5 flex-1">
                      <div
                        className={`h-1 w-full rounded-full transition-colors ${
                          isActive
                            ? stepConfig?.dotColor ?? "bg-muted"
                            : isPassed
                              ? "bg-muted-foreground/30"
                              : "bg-muted"
                        }`}
                      />
                      <span className={`text-[8px] ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {step.label}
                      </span>
                    </div>
                    {i < TIER_STEPS.length - 1 && (
                      <span className="text-[8px] text-muted-foreground/50 mx-0.5 mb-2.5">→</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Description */}
            {pathConfig !== null && (
              <p className={`text-[10px] leading-snug ${isFallback ? pathConfig.badgeText : "text-muted-foreground"}`}>
                {isFallback && "⚠️ "}{pathConfig.description}
              </p>
            )}
          </div>

          {/* DOM target debug row */}
          <div className="flex items-center gap-1.5">
            <Box className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Target:</span>
            <code className="text-[10px] font-mono text-foreground">
              {injections.domTarget
                ? `<${injections.domTarget}>`
                : "unknown"}
            </code>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {new Date(injections.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
      )}

      {isMissingInjections && (
        <p className="text-[10px] text-muted-foreground">
          Navigate to a matching URL to trigger injection.
        </p>
      )}
    </div>
  );
}
