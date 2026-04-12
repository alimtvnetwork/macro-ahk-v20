/**
 * Riseup Macro SDK — Namespace Logger
 *
 * Static class exposed on `RiseupAsiaMacroExt.Logger`.
 * All structured logging in the macro-controller MUST go through this logger.
 *
 * Methods:
 * - `error(fn, msg, error?)` — Hard errors, always includes stack trace
 * - `debug(fn, msg)` — Low-priority diagnostics and intentional fallbacks
 * - `console(fn, msg, ...args)` — General-purpose structured console output
 * - `stackTrace(fn, msg, error?)` — Always captures full call stack
 * - `warn(fn, msg)` — Recoverable issues
 * - `info(fn, msg)` — Informational messages
 *
 * Each method:
 * - Prefixes with `[RiseupAsia]` + function name
 * - Writes to the matching `console.*` method
 * - Never swallows — always outputs
 *
 * @see spec/10-macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md §3.1
 */

const PREFIX = "[RiseupAsia]";

/**
 * Extract a useful message string from an unknown error value.
 */
function formatError(error: Error | string | object | null | undefined): string {
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

/**
 * Capture the current call stack, stripping internal logger frames.
 * If an Error object is provided, its stack is used instead.
 */
function captureStack(error?: unknown): string {
    if (error instanceof Error && error.stack) {
        return error.stack;
    }
    const trace = new Error().stack || "";
    // Strip the first 3 frames: Error, captureStack, and the Logger method
    const lines = trace.split("\n");
    return lines.slice(3).join("\n");
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

    /**
     * General-purpose structured console output.
     * Use for runtime observations, data dumps, or verbose tracing.
     *
     * @param fn - Function or module name
     * @param msg - Human-readable message
     * @param args - Additional values to log (objects, arrays, etc.)
     */
    static console(fn: string, msg: string, ...args: unknown[]): void {
        const base = `${PREFIX} [${fn}] ${msg}`;
        if (args.length > 0) {
            console.log(base, ...args);
        } else {
            console.log(base);
        }
    }

    /**
     * Log with a full stack trace — always captured, even without an Error.
     * Use for tracing execution flow, diagnosing call chains, or debugging.
     *
     * @param fn - Function or module name
     * @param msg - Human-readable message
     * @param error - Optional error; its stack is used if provided, otherwise a fresh stack is captured
     */
    static stackTrace(fn: string, msg: string, error?: unknown): void {
        const base = `${PREFIX} [${fn}] ${msg}`;
        const stack = captureStack(error);
        console.error(base + "\n" + stack);
    }
}
