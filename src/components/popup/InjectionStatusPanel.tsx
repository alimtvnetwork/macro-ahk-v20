import { Badge } from "@/components/ui/badge";
import { CheckCircle, Clock, Route, Shield, Zap, Globe, Box, Timer, XCircle, AlertTriangle } from "lucide-react";
import type { InjectionStatus, PopupScript } from "@/hooks/use-popup-data";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

// eslint-disable-next-line max-lines-per-function
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

          {/* Post-injection verification badge */}
          <VerificationBadge verification={injections.verification} />

          {/* Pipeline performance bar */}
          <PipelinePerformanceBar
            durationMs={injections.pipelineDurationMs}
            budgetMs={injections.budgetMs}
          />

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

/* ------------------------------------------------------------------ */
/*  Pipeline Performance Bar                                           */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
function PipelinePerformanceBar({
  durationMs,
  budgetMs,
}: {
  durationMs?: number;
  budgetMs?: number;
}) {
  if (durationMs === undefined) return null;

  const budget = budgetMs ?? 500;
  const ratio = durationMs / budget;
  const pct = Math.min(ratio * 100, 100);
  const overflowPct = ratio > 1 ? Math.min((ratio - 1) * 100, 100) : 0;

  // Color thresholds: green <50%, yellow 50-80%, orange 80-100%, red >100%
  const barColor =
    ratio > 1
      ? "bg-[hsl(var(--destructive))]"
      : ratio > 0.8
        ? "bg-orange-500"
        : ratio > 0.5
          ? "bg-[hsl(var(--warning))]"
          : "bg-[hsl(var(--success))]";

  const label =
    ratio > 1
      ? "Over budget"
      : ratio > 0.8
        ? "Near budget"
        : "Within budget";

  const labelColor =
    ratio > 1
      ? "text-[hsl(var(--destructive))]"
      : ratio > 0.8
        ? "text-orange-500"
        : "text-muted-foreground";

  return (
    <div className="space-y-1 pt-1">
      <div className="flex items-center gap-1.5">
        <Timer className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Pipeline:</span>
        <span className={`text-[10px] font-mono font-semibold ${labelColor}`}>
          {durationMs.toFixed(1)}ms
        </span>
        <span className="text-[10px] text-muted-foreground">/</span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {budget}ms
        </span>
        <span className={`text-[9px] ml-auto ${labelColor}`}>{label}</span>
      </div>

      {/* Bar track */}
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
        {/* Budget threshold marker at 100% */}
        <div
          className="absolute top-0 bottom-0 w-px bg-foreground/30 z-10"
          style={{ left: ratio > 1 ? `${100 / ratio}%` : "100%" }}
        />

        {/* Duration fill */}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />

        {/* Overflow glow for over-budget */}
        {overflowPct > 0 && (
          <div
            className="absolute inset-y-0 right-0 rounded-r-full bg-[hsl(var(--destructive))]/40 animate-pulse"
            style={{ width: `${overflowPct}%` }}
          />
        )}
      </div>

      {/* Stage legend when over budget */}
      {ratio > 1 && (
        <p className="text-[9px] text-[hsl(var(--destructive))] leading-snug">
          ⚠️ {((ratio - 1) * 100).toFixed(0)}% over budget — check TIMING log
          for stage breakdown
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Verification Badge                                                 */
/* ------------------------------------------------------------------ */

const VERIFICATION_CHECKS = [
  { key: "marcoSdk", label: "Marco SDK" },
  { key: "extRoot", label: "Extension Root" },
  { key: "mcClass", label: "MacroController Class" },
  { key: "mcInstance", label: "MC Instance" },
  { key: "uiContainer", label: "UI Container" },
  { key: "markerEl", label: "Injection Marker" },
] as const;

function VerificationBadge({
  verification,
}: {
  verification?: InjectionStatus["verification"];
}) {
  if (!verification) return null;

  const passed = VERIFICATION_CHECKS.filter(
    (c) => verification[c.key] === true,
  ).length;
  const total = VERIFICATION_CHECKS.length;
  const allPassed = passed === total;
  const nonePassed = passed === 0;

  const StatusIcon = allPassed
    ? CheckCircle
    : nonePassed
      ? XCircle
      : AlertTriangle;

  const statusColor = allPassed
    ? "text-[hsl(var(--success))]"
    : nonePassed
      ? "text-[hsl(var(--destructive))]"
      : "text-[hsl(var(--warning))]";

  const badgeBorder = allPassed
    ? "border-[hsl(var(--success))]/50"
    : nonePassed
      ? "border-[hsl(var(--destructive))]/50"
      : "border-[hsl(var(--warning))]/50";

  return (
    <div className="pt-1.5 border-t border-border mt-1 space-y-1">
      <div className="flex items-center gap-1.5">
        <Shield className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">Verification:</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant="outline"
              className={`text-[9px] px-1.5 py-0 h-4 gap-1 cursor-default ${badgeBorder} ${statusColor}`}
            >
              <StatusIcon className="h-2.5 w-2.5" />
              {passed}/{total} passed
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-[220px]">
            <div className="space-y-0.5">
              {VERIFICATION_CHECKS.map((c) => {
                const ok = verification[c.key] === true;
                return (
                  <div key={c.key} className="flex items-center gap-1.5 text-xs">
                    {ok ? (
                      <CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" />
                    ) : (
                      <XCircle className="h-3 w-3 text-[hsl(var(--destructive))]" />
                    )}
                    <span>{c.label}</span>
                  </div>
                );
              })}
              <p className="text-[10px] text-muted-foreground pt-1">
                Verified at {new Date(verification.verifiedAt).toLocaleTimeString()}
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
