/**
 * Riseup Macro SDK — Namespace Logger
 *
 * Static class exposed on `RiseupAsiaMacroExt.Logger`.
 * All error logging in the macro-controller MUST go through this logger
 * instead of bare `log()` calls for error-level messages.
 *
 * Each method:
 * - Prefixes with `[RiseupAsia]` + function name
 * - For `error()`: includes stack trace from the error object if available
 * - Writes to the matching `console.*` method
 * - Never swallows — always outputs
 *
 * @see spec/10-macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md §3.1
 */

const PREFIX = "[RiseupAsia]";

/**
 * Extract a useful message string from an unknown error value.
 */
function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.stack || error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

export class NamespaceLogger {
    /**
     * Log an unexpected/hard error.
     * Always includes stack trace when an Error object is provided.
     */
    static error(fn: string, msg: string, error?: unknown): void {
        const base = `${PREFIX} [${fn}] ${msg}`;
        if (error !== undefined) {
            console.error(base + " — " + formatError(error));
        } else {
            console.error(base);
        }
    }

    /**
     * Log a recoverable issue (e.g., localStorage unavailable, fallback used).
     */
    static warn(fn: string, msg: string): void {
        console.warn(`${PREFIX} [${fn}] ${msg}`);
    }

    /**
     * Log informational messages routed through the namespace.
     */
    static info(fn: string, msg: string): void {
        console.info(`${PREFIX} [${fn}] ${msg}`);
    }

    /**
     * Log intentional fallbacks or low-priority diagnostics.
     */
    static debug(fn: string, msg: string): void {
        console.debug(`${PREFIX} [${fn}] ${msg}`);
    }
}
