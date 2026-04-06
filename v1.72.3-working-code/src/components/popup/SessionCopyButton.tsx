import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ClipboardCopy, Check, Loader2 } from "lucide-react";
import { sendMessage } from "@/lib/message-client";
import { toast } from "sonner";

interface SessionLog {
  id: number;
  session_id: string;
  timestamp: string;
  level: string;
  source: string;
  category: string;
  action?: string;
  detail?: string;
  error_code?: string;
  message?: string;
  stack_trace?: string;
  context?: string;
  script_id?: string;
  project_id?: string;
  config_id?: string;
  script_file?: string;
  ext_version?: string;
}

interface SessionLogsResponse {
  sessionId: string;
  logs: SessionLog[];
  errors: SessionLog[];
}

function formatLogEntry(entry: SessionLog): string {
  const ts = entry.timestamp ?? "";
  const level = (entry.level ?? "info").toUpperCase().padEnd(5);
  const source = entry.source ?? "—";
  const detail = entry.action
    ? `[${entry.category}] ${entry.action}: ${entry.detail ?? ""}`
    : entry.message ?? "";

  return `${ts}  ${level}  ${source}  ${detail}`;
}

function formatErrorEntry(entry: SessionLog): string {
  const ts = entry.timestamp ?? "";
  const level = (entry.level ?? "error").toUpperCase().padEnd(5);
  const code = entry.error_code ?? "UNKNOWN";
  const msg = entry.message ?? "";
  const file = entry.script_file ? ` [${entry.script_file}]` : "";
  const stack = entry.stack_trace ? `\n    Stack: ${entry.stack_trace}` : "";
  const ctx = entry.context ? `\n    Context: ${entry.context}` : "";

  return `${ts}  ${level}  ${code}${file}  ${msg}${stack}${ctx}`;
}

function buildReport(data: SessionLogsResponse): string {
  const header = [
    "═══════════════════════════════════════════",
    `  Marco Session Report`,
    `  Session: ${data.sessionId}`,
    `  Generated: ${new Date().toISOString()}`,
    `  Logs: ${data.logs.length}  |  Errors: ${data.errors.length}`,
    "═══════════════════════════════════════════",
  ].join("\n");

  const logsSection = data.logs.length > 0
    ? "\n\n── LOGS ──────────────────────────────────\n" +
      data.logs.map(formatLogEntry).join("\n")
    : "\n\n── LOGS ──────────────────────────────────\n(no logs)";

  const errorsSection = data.errors.length > 0
    ? "\n\n── ERRORS ────────────────────────────────\n" +
      data.errors.map(formatErrorEntry).join("\n\n")
    : "\n\n── ERRORS ────────────────────────────────\n(no errors)";

  return header + logsSection + errorsSection + "\n";
}

export function SessionCopyButton() {
  const [state, setState] = useState<"idle" | "loading" | "copied">("idle");

  const handleCopy = useCallback(async () => {
    setState("loading");

    try {
      const data = await sendMessage<SessionLogsResponse>({
        type: "GET_SESSION_LOGS",
      });

      const report = buildReport(data);
      await navigator.clipboard.writeText(report);

      setState("copied");
      toast.success(`Copied ${data.logs.length} logs + ${data.errors.length} errors`);

      setTimeout(() => setState("idle"), 2000);
    } catch (copyError) {
      setState("idle");
      const msg = copyError instanceof Error ? copyError.message : "Copy failed";
      toast.error(msg);
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
          className="h-7 text-[10px] gap-1.5 hover:bg-primary/15 hover:text-primary"
          onClick={handleCopy}
          disabled={isLoading}
        >
          {isLoading && <Loader2 className="h-3 w-3 animate-spin" />}
          {isCopied && <Check className="h-3 w-3 text-primary" />}
          {isIdle && <ClipboardCopy className="h-3 w-3" />}
          {isCopied ? "Copied!" : "Copy Session Logs"}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs max-w-[200px]">
          Copy all logs and errors from the current session (since injection) to clipboard with full stack traces
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
