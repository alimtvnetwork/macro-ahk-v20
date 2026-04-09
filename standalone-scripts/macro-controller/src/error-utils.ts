/**
 * MacroController — Error & Logging Utilities
 *
 * Centralizes error message extraction and structured logging wrappers.
 * Each helper delegates to RiseupAsiaMacroExt.Logger when the SDK namespace
 * is available, falling back to direct console output with the same prefix.
 *
 * Available helpers:
 * - `logError(fn, msg, error?)` — Hard errors → Logger.error()
 * - `logDebug(fn, msg)` — Low-priority diagnostics → Logger.debug()
 * - `logConsole(fn, msg, ...args)` — General output → Logger.console()
 * - `logStackTrace(fn, msg, error?)` — Always captures stack → Logger.stackTrace()
 *
 * @see spec/10-macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md
 */

/**
 * Extract a human-readable message from any caught value.
 * Handles Error instances, strings, and arbitrary objects.
 */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e !== null && e !== undefined) return String(e);
  return 'Unknown error';
}

/** Try to get the SDK namespace logger, returns undefined if unavailable. */
function getLogger(): RiseupAsiaMacroExtNamespace['Logger'] | undefined {
  try {
    return window.RiseupAsiaMacroExt?.Logger;
  } catch {
    return undefined;
  }
}

/** Build the standard log prefix. */
function prefix(fn: string): string {
  return '[RiseupAsia] [' + fn + '] ';
}

/**
 * Structured error logging — delegates to RiseupAsiaMacroExt.Logger.error().
 *
 * @param fn - Function or module name for context
 * @param msg - Human-readable error description
 * @param error - Optional caught error value (stack trace extracted if Error)
 */
export function logError(fn: string, msg: string, error?: unknown): void {
  const logger = getLogger();
  if (logger) { logger.error(fn, msg, error); return; }
  const base = prefix(fn) + msg;
  if (error !== undefined) { console.error(base, error); } else { console.error(base); }
}

/**
 * Structured debug logging — delegates to RiseupAsiaMacroExt.Logger.debug().
 * Use for low-priority diagnostics, intentional fallbacks, and verbose tracing.
 *
 * @param fn - Function or module name for context
 * @param msg - Human-readable debug message
 */
export function logDebug(fn: string, msg: string): void {
  const logger = getLogger();
  if (logger) { logger.debug(fn, msg); return; }
  console.debug(prefix(fn) + msg);
}

/**
 * General-purpose structured console output — delegates to RiseupAsiaMacroExt.Logger.console().
 * Use for runtime observations, data dumps, or verbose tracing.
 *
 * @param fn - Function or module name for context
 * @param msg - Human-readable message
 * @param args - Additional values to log (objects, arrays, etc.)
 */
export function logConsole(fn: string, msg: string, ...args: unknown[]): void {
  const logger = getLogger();
  if (logger) { logger.console(fn, msg, ...args); return; }
  const base = prefix(fn) + msg;
  if (args.length > 0) { console.log(base, ...args); } else { console.log(base); }
}

/**
 * Stack trace logging — delegates to RiseupAsiaMacroExt.Logger.stackTrace().
 * Always captures a full call stack, even when no Error is provided.
 * Use for tracing execution flow, diagnosing call chains, or debugging.
 *
 * @param fn - Function or module name for context
 * @param msg - Human-readable message
 * @param error - Optional error; its stack is used if provided, otherwise a fresh stack is captured
 */
export function logStackTrace(fn: string, msg: string, error?: unknown): void {
  const logger = getLogger();
  if (logger) { logger.stackTrace(fn, msg, error); return; }
  const base = prefix(fn) + msg;
  const stack = (error instanceof Error && error.stack) ? error.stack : new Error().stack || '';
  console.error(base + '\n' + stack);
}
