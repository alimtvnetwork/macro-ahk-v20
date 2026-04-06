/**
 * Marco Extension — Background Logger
 *
 * Centralized error logging for the background service worker.
 * All caught errors in background modules should flow through this utility
 * so they are persisted to:
 *   1. SQLite errors table (via handleLogError)
 *   2. OPFS session files (events.log + errors.log)
 *   3. Browser console (console.error — LAST step, preserves stack trace)
 *
 * IMPORTANT: Do NOT use this inside the logging pipeline itself
 * (session-log-writer.ts, logging-handler.ts, db-manager.ts) to avoid
 * infinite recursion. Those files must use bare console.error.
 *
 * @see spec/05-chrome-extension/06-logging-architecture.md
 */

import { MessageType, type MessageRequest } from "../shared/messages";
import { handleLogError } from "./handlers/logging-handler";

/* ------------------------------------------------------------------ */
/*  Log Tag Enum                                                       */
/* ------------------------------------------------------------------ */

/** Canonical log tags — eliminates magic strings across all background modules. */
export const enum BgLogTag {
    BOOT = "[boot]",
    BUILTIN_GUARD = "[builtin-guard]",
    BUILTIN_GUARD_FALLBACK = "[builtin-guard:fallback]",
    CACHE_WARMER = "[cache-warmer]",
    CONFIG_AUTH = "[config-auth]",
    CONFIG_SEEDER = "[config-seeder]",
    COOKIE_WATCHER = "[cookie-watcher]",
    CSP_FALLBACK = "[csp-fallback]",
    DATA_BRIDGE = "[data-bridge]",
    DYNAMIC_REQUIRE = "[dynamic-require]",
    HEALTH = "[health]",
    INJECTION = "[injection]",
    INJECTION_BOOTSTRAP = "[injection:bootstrap]",
    INJECTION_CACHE = "[injection-cache]",
    INJECTION_CSP = "[injection:csp]",
    INJECTION_DEPS = "[injection:deps]",
    INJECTION_NS = "[injection:ns]",
    INJECTION_RESOLVE = "[injection:resolve]",
    INJECTION_SETTINGS = "[injection:settings]",
    KEEPALIVE = "[keepalive]",
    LOGGING = "[logging]",
    MANIFEST_SEEDER = "[manifest-seeder]",
    MARCO = "[Marco]",
    MESSAGE_ROUTER = "[message-router]",
    NS_CACHE = "[ns-cache]",
    PROJECT_SAVE_CONFIG_SEED = "[project-save:config-seed]",
    PROMPTS = "[prompts]",
    REMOTE_CONFIG = "[remote-config]",
    SCRIPT_RESOLVER = "[script-resolver]",
    SEEDER = "[seeder]",
    SHORTCUT = "[shortcut]",
    STATUS_HANDLER = "[status-handler]",
    TOKEN_SEEDER = "[token-seeder]",
    URL_MATCHER = "[url-matcher]",
    XPATH = "[xpath]",
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BgErrorContext {
    scriptId?: string;
    projectId?: string;
    configId?: string;
    scriptFile?: string;
    contextDetail?: string;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Logs an error through the full pipeline: DB → session files → console.error.
 *
 * @param tag       Module tag, e.g. "[boot]", "[injection]", "[cookie-watcher]"
 * @param errorCode Machine-readable error code for the errors DB
 * @param message   Human-readable error description
 * @param error     The caught error object (preserved for stack trace in console)
 * @param context   Optional context for the errors DB row
 */
export function logBgError(
    tag: string,
    errorCode: string,
    message: string,
    error?: unknown,
    context?: BgErrorContext,
): void {
    const stackTrace = error instanceof Error ? error.stack : undefined;

    // Step 1 + 2: Persist to DB + OPFS session (fire-and-forget, must never throw)
    try {
        void handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: tag.replace(/[\[\]]/g, "").toUpperCase(),
            errorCode,
            message,
            stackTrace,
            context: context?.contextDetail,
            scriptId: context?.scriptId,
            projectId: context?.projectId,
            configId: context?.configId,
            scriptFile: context?.scriptFile,
        } as MessageRequest).catch(() => {
            // DB/session not ready — fall through to console.error
        });
    } catch {
        // handleLogError threw synchronously (DB not bound) — fall through
    }

    // Step 3: Console.error LAST — always executes, preserves full stack trace
    if (error !== undefined) {
        console.error(`${tag} ${message}`, error);
    } else {
        console.error(`${tag} ${message}`);
    }
}

/**
 * Shorthand for logging a caught error with a simple message.
 * Derives errorCode from the tag.
 *
 * Usage:
 *   catch (err) { logCaughtError("[boot]", "Manifest seeder failed", err); }
 */
export function logCaughtError(
    tag: string,
    message: string,
    error: unknown,
    context?: BgErrorContext,
): void {
    const errorCode = tag
        .replace(/[\[\]:]/g, "")
        .replace(/[^a-zA-Z0-9-]/g, "_")
        .toUpperCase() + "_ERROR";

    logBgError(tag, errorCode, message, error, context);
}

/**
 * Logs a warning-level event (non-fatal, degraded functionality).
 * Warnings go to console.warn only and MUST NOT be persisted to the Errors table,
 * otherwise transient/non-fatal issues poison health/error counts.
 */
export function logBgWarnError(
    tag: string,
    message: string,
    error?: unknown,
): void {
    if (error !== undefined) {
        console.warn(`${tag} ${message}`, error);
    } else {
        console.warn(`${tag} ${message}`);
    }
}
