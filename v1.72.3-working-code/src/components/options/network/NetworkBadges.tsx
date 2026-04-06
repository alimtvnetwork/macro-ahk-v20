import { Badge } from "@/components/ui/badge";
import { categorizeStatus } from "./network-helpers";

const STATUS_COLORS: Record<string, string> = {
  "2xx": "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
  "3xx": "bg-primary/15 text-primary",
  "4xx": "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  "5xx": "bg-destructive/15 text-destructive",
  "0xx": "bg-muted text-muted-foreground",
};

interface StatusBadgeProps {
  status: number;
}

/** Badge showing the HTTP status code with color coding. */
export function StatusBadge({ status }: StatusBadgeProps) {
  const bucket = categorizeStatus(status);
  const colorClass = STATUS_COLORS[bucket] ?? "";
  const isError = status === 0;
  const displayText = isError ? "ERR" : status;

  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 font-mono ${colorClass}`}
    >
      {displayText}
    </Badge>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: "text-primary",
  POST: "text-[hsl(var(--success))]",
  PUT: "text-[hsl(var(--warning))]",
  DELETE: "text-destructive",
  PATCH: "text-accent-foreground",
};

interface MethodBadgeProps {
  method: string;
}

/** Colored method label. */
export function MethodBadge({ method }: MethodBadgeProps) {
  const colorClass = METHOD_COLORS[method] ?? "text-foreground";

  return (
    <span className={`text-xs font-mono font-bold ${colorClass}`}>
      {method}
    </span>
  );
}

interface DurationDisplayProps {
  ms: number;
}

/** Duration value with color based on speed. */
export function DurationDisplay({ ms }: DurationDisplayProps) {
  const isSlow = ms > 1000;
  const isMedium = ms > 500;

  const color = isSlow
    ? "text-destructive"
    : isMedium
      ? "text-[hsl(var(--warning))]"
      : "text-muted-foreground";

  return <span className={color}>{ms}ms</span>;
}
