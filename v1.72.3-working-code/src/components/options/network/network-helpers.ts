/** Categorize an HTTP status code into a bucket string. */
export function categorizeStatus(status: number): string {
  const is2xx = status >= 200 && status < 300;
  if (is2xx) return "2xx";

  const is3xx = status >= 300 && status < 400;
  if (is3xx) return "3xx";

  const is4xx = status >= 400 && status < 500;
  if (is4xx) return "4xx";

  const is5xx = status >= 500;
  if (is5xx) return "5xx";

  return "0xx";
}

/** Get Tailwind color classes for a status bucket badge. */
export function getStatusBucketColor(bucket: string): string {
  const map: Record<string, string> = {
    "2xx": "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
    "3xx": "bg-primary/15 text-primary border-primary/30",
    "4xx": "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
    "5xx": "bg-destructive/15 text-destructive border-destructive/30",
    "0xx": "bg-muted text-muted-foreground border-border",
  };

  return map[bucket] ?? "";
}

/** Truncate a URL to show only pathname + search. */
export function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch (urlParseError: unknown) {
    const isTooLong = url.length > 60;
    return isTooLong ? url.slice(0, 60) + "…" : url;
  }
}

/** Format a timestamp string into a short time display. */
export function formatNetworkTimestamp(ts: string): string {
  const isMissing = ts === "" || ts === undefined || ts === null;
  if (isMissing) return "—";

  try {
    return new Date(ts).toLocaleString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (dateFormatError: unknown) {
    return ts;
  }
}
