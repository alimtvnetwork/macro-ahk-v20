/**
 * Marco Extension — Reusable Error Model
 *
 * Standardized structure for capturing and displaying runtime errors
 * across the extension (database, storage, namespace operations, etc.).
 *
 * @see spec/11-chrome-extension/55-storage-ui-redesign.md
 */

export interface ErrorModel {
  /** Short error label */
  title: string;
  /** Main human-readable error message */
  message: string;
  /** Optional machine-readable code (e.g. "DB_LOAD_FAILED") */
  errorCode?: string;
  /** Originating module or component (e.g. "Storage", "Database") */
  source: string;
  /** Current action (e.g. "LoadDb", "ApplySchema", "CreateTable") */
  operation: string;
  /** Stack trace if available */
  stackTrace?: string;
  /** Sourcemap-resolved stack trace if available */
  resolvedStackTrace?: string;
  /** Nested error details if present */
  innerError?: string;
  /** Serialized context payload (safe request params) */
  contextJson?: string;
  /** Active namespace if relevant */
  namespace?: string;
  /** Current project slug */
  projectName?: string;
  /** ISO 8601 error timestamp */
  createdAt: string;
  /** Suggested next action if available */
  suggestedAction?: string;
}

/** Creates an ErrorModel from a caught error and context. */
// eslint-disable-next-line max-lines-per-function -- flat property mapping, no branching complexity
export function createErrorModel(
  error: unknown,
  context: {
    title?: string;
    source: string;
    operation: string;
    projectName?: string;
    namespace?: string;
    contextJson?: string;
    suggestedAction?: string;
  },
): ErrorModel {
  const isError = error instanceof Error;
  const message = isError ? error.message : String(error);
  const stackTrace = isError ? error.stack : undefined;
  const resolvedStackTrace = isError ? getResolvedStackTrace(error) : undefined;
  const causeValue = isError ? (error as unknown as { cause?: unknown }).cause : undefined;
  const innerError = causeValue ? String(causeValue) : undefined;

  return {
    title: context.title ?? `${context.operation} Failed`,
    message,
    errorCode: deriveErrorCode(message),
    source: context.source,
    operation: context.operation,
    stackTrace,
    resolvedStackTrace,
    innerError,
    contextJson: context.contextJson,
    namespace: context.namespace,
    projectName: context.projectName,
    createdAt: new Date().toISOString(),
    suggestedAction: context.suggestedAction,
  };
}

/** Derives a machine-readable error code from the message. */
function deriveErrorCode(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("missing") && lower.includes("project")) return "MISSING_PROJECT_SLUG";
  if (lower.includes("missing") && lower.includes("slug")) return "MISSING_PROJECT_SLUG";
  if (lower.includes("db") || lower.includes("database")) return "DB_ERROR";
  if (lower.includes("schema")) return "SCHEMA_ERROR";
  if (lower.includes("timeout")) return "TIMEOUT";
  if (lower.includes("network")) return "NETWORK_ERROR";
  return "UNKNOWN_ERROR";
}

/** Formats an ErrorModel as a copyable text block for sharing. */
// eslint-disable-next-line max-lines-per-function -- sequential line assembly, splitting would reduce readability
export function formatErrorForClipboard(error: ErrorModel): string {
  const lines: string[] = [
    `## ${error.title}`,
    "",
    `**Message:** ${error.message}`,
    `**Error Code:** ${error.errorCode ?? "N/A"}`,
    `**Source:** ${error.source}`,
    `**Operation:** ${error.operation}`,
    `**Project:** ${error.projectName ?? "N/A"}`,
    `**Namespace:** ${error.namespace ?? "N/A"}`,
    `**Timestamp:** ${error.createdAt}`,
  ];

  if (error.innerError) {
    lines.push(`**Inner Error:** ${error.innerError}`);
  }
  if (error.suggestedAction) {
    lines.push("", `**Suggested Action:** ${error.suggestedAction}`);
  }
  if (error.contextJson) {
    lines.push("", "### Context", "```json", tryPrettyJson(error.contextJson), "```");
  }
  if (error.resolvedStackTrace) {
    lines.push("", "### Stack Trace (Source Mapped)", "```", error.resolvedStackTrace, "```");
  }
  if (error.stackTrace) {
    lines.push("", error.resolvedStackTrace ? "### Raw Stack Trace" : "### Stack Trace", "```", error.stackTrace, "```");
  }

  return lines.join("\n");
}

/** Pretty-print JSON if valid, otherwise return raw string */
function tryPrettyJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

function getResolvedStackTrace(error: Error): string | undefined {
  const resolvedStack = (error as unknown as { resolvedStack?: string }).resolvedStack;
  return typeof resolvedStack === "string" && resolvedStack.trim() ? resolvedStack : undefined;
}
