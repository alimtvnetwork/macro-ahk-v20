import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Bug, Check, Loader2 } from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";

interface ErrorEntry {
  id?: number;
  timestamp?: string;
  level?: string;
  source?: string;
  category?: string;
  error_code?: string;
  message?: string;
  stack_trace?: string;
  context?: string;
  script_id?: string;
  project_id?: string;
  script_file?: string;
  ext_version?: string;
  resolved?: number;
}

interface VerificationResult {
  marcoSdk: boolean;
  extRoot: boolean;
  mcClass: boolean;
  mcInstance: boolean;
  uiContainer: boolean;
  markerEl: boolean;
  verifiedAt: string;
}

interface SessionLog {
  id?: number;
  timestamp?: string;
  level?: string;
  source?: string;
  category?: string;
  action?: string;
  detail?: string;
  message?: string;
}

function formatError(e: ErrorEntry, i: number): string {
  const ts = e.timestamp ?? "";
  const code = e.error_code ?? "UNKNOWN";
  const msg = e.message ?? "(no message)";
  const file = e.script_file ? ` [${e.script_file}]` : "";
  const script = e.script_id ? ` script=${e.script_id}` : "";
  const project = e.project_id ? ` project=${e.project_id}` : "";
  const stack = e.stack_trace ? `\n      Stack: ${e.stack_trace}` : "";
  const ctx = e.context ? `\n      Context: ${e.context}` : "";

  return `  ${i + 1}. ${ts}  ${code}${file}${script}${project}\n      ${msg}${stack}${ctx}`;
}

function formatLog(l: SessionLog): string {
  const ts = l.timestamp ?? "";
  const lvl = (l.level ?? "info").toUpperCase().padEnd(5);
  const src = l.source ?? "—";
  const detail = l.action
    ? `[${l.category}] ${l.action}: ${l.detail ?? ""}`
    : l.message ?? "";
  return `  ${ts}  ${lvl}  ${src}  ${detail}`;
}

// eslint-disable-next-line max-lines-per-function
function buildInjectionReport(
  errors: ErrorEntry[],
  logs: SessionLog[],
  status: Record<string, unknown> | null,
  health: Record<string, unknown> | null,
  verification?: VerificationResult | null,
): string {
  const sections: string[] = [];

  sections.push(
    "═══════════════════════════════════════════",
    "  Marco Injection Diagnostics",
    `  Generated: ${new Date().toISOString()}`,
    `  Version: ${status?.version ?? "?"}`,
    `  Health: ${health?.state ?? "?"}`,
    `  Boot: ${status?.bootStep ?? "?"}  |  Persistence: ${status?.persistenceMode ?? "?"}`,
    "═══════════════════════════════════════════",
  );

  // Errors section
  sections.push("");
  sections.push(`── INJECTION ERRORS (${errors.length}) ──────────────`);
  if (errors.length > 0) {
    sections.push(...errors.map(formatError));
  } else {
    sections.push("  (no unresolved errors)");
  }

  // Prompt-loading diagnostics (filter logs for prompt/config/injection)
  const diagLogs = logs.filter((l) => {
    const text = `${l.source ?? ""} ${l.category ?? ""} ${l.action ?? ""} ${l.detail ?? ""} ${l.message ?? ""}`.toLowerCase();
    return (
      text.includes("prompt") ||
      text.includes("inject") ||
      text.includes("config") ||
      text.includes("preamble") ||
      text.includes("json") ||
      text.includes("fetch") ||
      text.includes("load") ||
      text.includes("error") ||
      text.includes("fail")
    );
  });

  sections.push("");
  sections.push(`── PROMPT & INJECTION LOGS (${diagLogs.length}) ─────`);
  if (diagLogs.length > 0) {
    sections.push(...diagLogs.map(formatLog));
  } else {
    sections.push("  (no matching diagnostics)");
  }

  // Post-injection verification
  sections.push("");
  sections.push("── POST-INJECTION VERIFICATION ───────────");
  if (verification) {
    const icon = (ok: boolean) => ok ? "✅" : "❌";
    sections.push(`  window.marco (SDK)           : ${icon(verification.marcoSdk)}`);
    sections.push(`  window.RiseupAsiaMacroExt     : ${icon(verification.extRoot)}`);
    sections.push(`  window.MacroController (class): ${icon(verification.mcClass)}`);
    sections.push(`  api.mc (singleton instance)   : ${icon(verification.mcInstance)}`);
    sections.push(`  #macro-loop-container (UI)    : ${icon(verification.uiContainer)}`);
    sections.push(`  [data-marco-injected] marker  : ${verification.markerEl ? "✅" : "⚠️ (not required)"}`);
    sections.push(`  Verified at: ${verification.verifiedAt}`);
  } else {
    sections.push("  (no verification data — inject scripts first)");
  }

  // Health details
  if (health && Array.isArray((health as { details?: string[] }).details)) {
    const details = (health as { details: string[] }).details;
    if (details.length > 0) {
      sections.push("");
      sections.push("── HEALTH DETAILS ────────────────────────");
      details.forEach((d) => sections.push(`  • ${d}`));
    }
  }

  // Status snapshot
  sections.push("");
  sections.push("── STATUS SNAPSHOT ───────────────────────");
  if (status) {
    const { bootTimings, ...rest } = status as Record<string, unknown> & { bootTimings?: unknown };
    sections.push(`  ${JSON.stringify(rest, null, 2).replace(/\n/g, "\n  ")}`);
  } else {
    sections.push("  (status unavailable)");
  }

  sections.push("");
  return sections.join("\n");
}

// eslint-disable-next-line max-lines-per-function
export function InjectionCopyButton() {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");
  const [errorCount, setErrorCount] = useState(0);
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let prevCount = 0;
    const poll = async () => {
      try {
        const res = await sendMessage<{ errors: ErrorEntry[] }>({ type: "GET_ACTIVE_ERRORS" });
        if (cancelled) return;
        const newCount = res.errors?.length ?? 0;
        if (newCount > prevCount && prevCount >= 0) {
          setIsPulsing(true);
          setTimeout(() => { if (!cancelled) setIsPulsing(false); }, 3000);
        }
        prevCount = newCount;
        setErrorCount(newCount);
      } catch { /* silent */ }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleCopy = useCallback(async () => {
    setState("loading");

    try {
      const [errorsRes, logsRes, statusRes, healthRes, injectionsRes] = await Promise.allSettled([
        sendMessage<{ errors: ErrorEntry[] }>({ type: "GET_ACTIVE_ERRORS" }),
        sendMessage<{ logs: SessionLog[] }>({ type: "GET_RECENT_LOGS", limit: 100 }),
        sendMessage<Record<string, unknown>>({ type: "GET_STATUS" }),
        sendMessage<Record<string, unknown>>({ type: "GET_HEALTH_STATUS" }),
        // Fetch verification from active tab's injection record
        (async () => {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.id) return null;
          const res = await sendMessage<{ injections: Record<number, unknown> }>({ type: "GET_TAB_INJECTIONS", tabId: tab.id } as any);
          const record = res?.injections?.[tab.id] as { verification?: VerificationResult } | null;
          return record?.verification ?? null;
        })(),
      ]);

      const errors = errorsRes.status === "fulfilled" ? errorsRes.value.errors ?? [] : [];
      const logs = logsRes.status === "fulfilled" ? logsRes.value.logs ?? [] : [];
      const status = statusRes.status === "fulfilled" ? statusRes.value : null;
      const health = healthRes.status === "fulfilled" ? healthRes.value : null;
      const verification = injectionsRes.status === "fulfilled" ? injectionsRes.value as VerificationResult | null : null;

      const report = buildInjectionReport(errors, logs, status, health, verification);
      await navigator.clipboard.writeText(report);

      setErrorCount(errors.length);
      setState("copied");
      toast.success(`Copied ${errors.length} errors + ${logs.length} diagnostic logs`);
      setTimeout(() => setState("idle"), 2000);
    } catch (err) {
      setState("idle");
      toast.error(err instanceof Error ? err.message : "Copy failed");
    }
  }, []);

  const isLoading = state === "loading";
  const isCopied = state === "copied";
  const isIdle = state === "idle";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[10px] gap-1.5 hover:bg-destructive/15 hover:text-destructive border-destructive/30 relative"
          onClick={handleCopy}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          {isCopied && <Check className="h-3 w-3 text-primary" />}
          {isIdle && (
            <span className="relative">
              <Bug className="h-3 w-3" />
              {errorCount > 0 && (
                <span className={`absolute -top-1.5 -right-1.5 flex h-3 min-w-[0.75rem] items-center justify-center rounded-full bg-destructive px-0.5 text-[7px] font-bold text-destructive-foreground leading-none ${isPulsing ? "animate-[pulse_1s_cubic-bezier(0.4,0,0.6,1)_3]" : ""}`}>
                  {errorCount > 99 ? "99+" : errorCount}
                </span>
              )}
            </span>
          )}
          {isCopied ? "Copied!" : "Copy Injection Logs"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs max-w-[220px]">
          {errorCount > 0
            ? `${errorCount} unresolved error${errorCount !== 1 ? "s" : ""} — copy injection diagnostics to clipboard`
            : "Copy injection errors, stack traces, prompt-loading diagnostics & health status to clipboard"}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
