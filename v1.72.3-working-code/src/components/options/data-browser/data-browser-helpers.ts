/** Format a timestamp string for the data browser display. */
export function formatDataTimestamp(ts: string): string {
  const isMissing = ts === "" || ts === undefined || ts === null;
  if (isMissing) return "—";

  try {
    return new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (dateFormatError: unknown) {
    return ts;
  }
}

/** Download a string as a file in the browser. */
export function downloadFile(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
