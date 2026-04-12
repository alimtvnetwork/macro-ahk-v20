/**
 * MacroController — Error Utilities
 *
 * Centralizes error message extraction and structured error logging.
 * TypeScript catch clauses use `unknown` by design — this helper
 * provides type-safe message extraction without scattered `instanceof` checks.
 *
 * Usage:
 *   catch (e: unknown) {
 *     logError('myFunction', 'Failed to do X', e);
 *   }
 *
 * @see spec/10-macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md
 */

/**
 * Extract a human-readable message from any caught value.
 * Handles Error instances, strings, and arbitrary objects.
 */
export function toErrorMessage(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === 'string') {
    return e;
  }
  if (e !== null && e !== undefined) {
    return String(e);
  }
  return 'Unknown error';
}

/**
 * Structured error logging — delegates to RiseupAsiaMacroExt.Logger.error()
 * when the SDK namespace is available, falls back to console.error.
 *
 * All error-level logs in the macro-controller should use this instead of
 * `log(msg, 'error')`. This ensures errors flow through the namespace logger
 * for consistent `[RiseupAsia] [fn]` prefixing and stack trace inclusion.
 *
 * @param fn - Function or module name for context
 * @param msg - Human-readable error description
 * @param error - Optional caught error value (stack trace extracted if Error)
 */
export function logError(fn: string, msg: string, error?: unknown): void {
  try {
    const logger = (typeof RiseupAsiaMacroExt !== 'undefined') ? RiseupAsiaMacroExt?.Logger : undefined;
    if (logger) {
      logger.error(fn, msg, error);

      return;
    }
  } catch {
    // Logger not available — fall through to console
  }
  // Fallback: direct console.error with same format
  const base = '[RiseupAsia] [' + fn + '] ' + msg;
  if (error !== undefined) {
    console.error(base, error);
  } else {
    console.error(base);
  }
}
