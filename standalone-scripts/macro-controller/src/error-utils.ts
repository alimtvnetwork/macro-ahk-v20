/**
 * MacroController — Error Utilities
 *
 * This is the SOLE designated entry point for `unknown` error handling.
 * All catch blocks delegate here. No other module should use `unknown` for errors.
 *
 * @see mem://standards/unknown-usage-policy
 * @see spec/10-macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md
 */

/**
 * Extract a human-readable message from any caught value.
 * Handles Error instances, strings, and arbitrary objects.
 *
 * This is the ONLY function allowed to accept a generic error type.
 */
export function toErrorMessage(e: Error | string | null | undefined): string {
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
 * This is the ONLY function allowed to accept a generic error type.
 *
 * @param fn - Function or module name for context
 * @param msg - Human-readable error description
 * @param error - Optional caught error value (stack trace extracted if Error)
 */
export function logError(fn: string, msg: string, error?: Error | string): void {
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
