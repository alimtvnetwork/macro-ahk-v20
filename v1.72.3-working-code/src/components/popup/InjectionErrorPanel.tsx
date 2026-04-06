/**
 * Marco Extension — Popup: Injection Error Panel
 *
 * Shows recent injection/script errors with expandable stack traces
 * and one-click copy. Fetches from GET_ACTIVE_ERRORS on mount/refresh.
 * Detects Osano.js interference and highlights affected errors.
 */

import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Shield,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InjectionError {
  id?: number;
  timestamp: string;
  message: string;
  stack_trace?: string;
  script_id?: string;
  error_code?: string;
  script_file?: string;
  ext_version?: string;
}

/* ------------------------------------------------------------------ */
/*  Osano Detection                                                    */
/* ------------------------------------------------------------------ */

const OSANO_PATTERNS = [
  "osano",
  "failed to execute 'appendchild' on 'node'",
  "unexpected strict mode reserved word",
  "unexpected identifier 'let'",
  "unexpected identifier 'const'",
  "refused to execute inline script",
];

function isOsanoRelatedError(error: InjectionError): boolean {
  const msg = (error.message ?? "").toLowerCase();
  const stack = (error.stack_trace ?? "").toLowerCase();
  return OSANO_PATTERNS.some((p) => msg.includes(p) || stack.includes(p));
}

function detectOsanoPresence(errors: InjectionError[]): boolean {
  return errors.some(isOsanoRelatedError);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function InjectionErrorPanel() {
  const [errors, setErrors] = useState<InjectionError[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sendMessage<{ errors: InjectionError[] }>({
        type: "GET_ACTIVE_ERRORS",
      });
      setErrors(res.errors ?? []);
    } catch {
      setErrors([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void fetchErrors();
  }, [fetchErrors]);

  const hasErrors = errors.length > 0;
  const latestErrorVersion = errors[0]?.ext_version ?? null;
  const osanoDetected = detectOsanoPresence(errors);

  if (!hasErrors && !loading) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-1.5 text-xs font-medium text-destructive hover:text-destructive/80 transition-colors"
          onClick={() => setCollapsed(!collapsed)}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Script Errors
          <Badge
            variant="destructive"
            className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] flex items-center justify-center"
          >
            {errors.length}
          </Badge>
          {latestErrorVersion && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 h-4 border-destructive/40 text-destructive/80"
            >
              build v{latestErrorVersion}
            </Badge>
          )}
          {osanoDetected && (
            <Badge
              variant="outline"
              className="text-[9px] px-1.5 py-0 h-4 border-[hsl(var(--warning))]/60 text-[hsl(var(--warning))] gap-0.5"
            >
              <Shield className="h-2.5 w-2.5" />
              Osano
            </Badge>
          )}
          {collapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )}
        </button>

        <div className="flex items-center gap-1">
          <CopyAllButton errors={errors} />
          <ClearAllButton onCleared={fetchErrors} />
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-primary"
            onClick={fetchErrors}
            disabled={loading}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <>
          {osanoDetected && <OsanoBanner />}
          <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-1">
            {errors.map((err, i) => (
              <ErrorRow key={err.id ?? i} error={err} isOsano={isOsanoRelatedError(err)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Osano Banner                                                       */
/* ------------------------------------------------------------------ */

function OsanoBanner() {
  return (
    <div className="rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 flex items-start gap-2">
      <Shield className="h-4 w-4 text-[hsl(var(--warning))] shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-xs font-medium text-foreground">
          Osano.js interference detected
        </p>
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          Osano's consent manager patches DOM insertion methods and parses inline
          scripts in strict mode, blocking <code className="font-mono text-[9px] bg-muted px-1 rounded">let</code>/<code className="font-mono text-[9px] bg-muted px-1 rounded">const</code>.
          Marco uses <strong>Blob URL injection</strong> to bypass this — the script loads
          via <code className="font-mono text-[9px] bg-muted px-1 rounded">script.src</code> so
          Osano has no inline content to block.
        </p>
        <p className="text-[10px] text-muted-foreground">
          Bypass path: <code className="font-mono text-[9px] bg-muted px-1 rounded">MAIN (blob)</code> →
          fallback: <code className="font-mono text-[9px] bg-muted px-1 rounded">userScripts API</code> →
          <code className="font-mono text-[9px] bg-muted px-1 rounded">ISOLATED (blob)</code>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Error Row                                                          */
/* ------------------------------------------------------------------ */

function ErrorRow({ error, isOsano }: { error: InjectionError; isOsano: boolean }) {
  const [open, setOpen] = useState(false);
  const hasStack = !!error.stack_trace;
  const timeStr = formatTime(error.timestamp);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className={`rounded-md border text-xs ${isOsano ? "border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/5" : "border-destructive/30 bg-destructive/5"}`}>
        <CollapsibleTrigger asChild>
          <button className={`w-full flex items-start gap-2 px-2.5 py-2 text-left transition-colors rounded-md ${isOsano ? "hover:bg-[hsl(var(--warning))]/10" : "hover:bg-destructive/10"}`}>
            <span className="shrink-0 mt-0.5">
              {hasStack ? (
                open ? (
                  <ChevronDown className={`h-3 w-3 ${isOsano ? "text-[hsl(var(--warning))]" : "text-destructive"}`} />
                ) : (
                  <ChevronRight className={`h-3 w-3 ${isOsano ? "text-[hsl(var(--warning))]" : "text-destructive"}`} />
                )
              ) : isOsano ? (
                <Shield className="h-3 w-3 text-[hsl(var(--warning))]" />
              ) : (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`font-medium leading-snug break-words ${isOsano ? "text-[hsl(var(--warning))]" : "text-destructive"}`}>
                {error.message}
              </p>
              <div className="flex items-center gap-2 mt-1 text-muted-foreground text-[10px] flex-wrap">
                <span>{timeStr}</span>
                {error.script_id && (
                  <span className="font-mono truncate max-w-[120px]">
                    {error.script_id}
                  </span>
                )}
                {error.ext_version && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 border-destructive/40 text-destructive/80"
                  >
                    v{error.ext_version}
                  </Badge>
                )}
                {error.error_code && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 border-destructive/40 text-destructive/70"
                  >
                    {error.error_code}
                  </Badge>
                )}
                {isOsano && (
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 py-0 h-3.5 border-[hsl(var(--warning))]/60 text-[hsl(var(--warning))] gap-0.5"
                  >
                    <Shield className="h-2.5 w-2.5" />
                    Osano blocked
                  </Badge>
                )}
              </div>
            </div>
            <CopySingleButton error={error} />
          </button>
        </CollapsibleTrigger>

        {hasStack && (
          <CollapsibleContent>
            <div className={`border-t px-2.5 py-2 ${isOsano ? "border-[hsl(var(--warning))]/20" : "border-destructive/20"}`}>
              <pre className="text-[10px] leading-relaxed text-muted-foreground font-mono whitespace-pre-wrap break-all select-all">
                {error.stack_trace}
              </pre>
            </div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}

/* ------------------------------------------------------------------ */
/*  Copy Buttons                                                       */
/* ------------------------------------------------------------------ */

function CopySingleButton({ error }: { error: InjectionError }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = formatErrorForCopy(error);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="shrink-0 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
      title="Copy error + stack trace"
    >
      {copied ? (
        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function CopyAllButton({ errors }: { errors: InjectionError[] }) {
  const [copied, setCopied] = useState(false);

  if (errors.length === 0) return null;

  const handleCopy = () => {
    const text = errors.map(formatErrorForCopy).join("\n\n---\n\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
      onClick={handleCopy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      Copy All
    </Button>
  );
}

function ClearAllButton({ onCleared }: { onCleared: () => void }) {
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    setClearing(true);
    try {
      await sendMessage({ type: "CLEAR_ERRORS" });
      onCleared();
    } catch {
      // ignore
    }
    setClearing(false);
  };

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-destructive"
      onClick={handleClear}
      disabled={clearing}
    >
      <Trash2 className="h-3 w-3" />
      Clear
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatErrorForCopy(error: InjectionError): string {
  const osano = isOsanoRelatedError(error);
  const parts = [
    `Error: ${error.message}`,
    `Time: ${error.timestamp}`,
  ];

  if (osano) parts.push("⚠️ Osano.js interference detected");
  if (error.script_id) parts.push(`Script: ${error.script_id}`);
  if (error.error_code) parts.push(`Code: ${error.error_code}`);
  if (error.ext_version) parts.push(`Extension: v${error.ext_version}`);
  if (error.stack_trace) parts.push(`\nStack Trace:\n${error.stack_trace}`);

  return parts.join("\n");
}

function formatTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return timestamp;
  }
}
