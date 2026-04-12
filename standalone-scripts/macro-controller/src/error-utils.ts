/**
 * MacroController — Error Utilities
 *
 * This is the SOLE designated entry point for caught error handling.
 * All catch blocks delegate here via `logError()`.
 * No other module should define error extraction logic.
 *
 * Pattern:
 *   try { ... }
 *   catch (e) {
 *     logError('myFunction', 'Something failed', e);
 *   }
 *
 * @see mem://standards/unknown-usage-policy
 * @see spec/03-coding-guidelines/03-coding-guidelines-spec/02-typescript/08-typescript-standards-reference.md §4.1
 */

/**
 * Reusable type for values caught in catch blocks.
 * TypeScript catch variables are implicitly `unknown` — this type
 * provides a named alias used ONLY inside this error utility module.
 *
 * Usage: NEVER annotate catch variables with this type.
 * Instead, use bare `catch (e)` and pass `e` to `logError()` or `toErrorMessage()`.
 */
export type CaughtError = Error | string | null | undefined | object;

/**
 * Extract a human-readable message from any caught value.
 * Handles Error instances, strings, and arbitrary objects.
 *
 * @param e - The caught error value (passed from a bare `catch (e)` block)
 */
export function toErrorMessage(e: CaughtError): string {
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
 * @param error - Optional caught error value from bare `catch (e)` block
 */
export function logError(fn: string, msg: string, error?: CaughtError): void {
  try {
    const logger = (typeof RiseupAsiaMacroExt !== 'undefined') ? RiseupAsiaMacroExt?.Logger : undefined;
    if (logger) {
      logger.error(fn, msg, error instanceof Error ? error : undefined);

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
