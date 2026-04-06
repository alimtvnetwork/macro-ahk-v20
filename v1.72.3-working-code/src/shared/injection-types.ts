/**
 * Marco Extension — Script Injection Types
 *
 * Shared types for the injection handler.
 */

/** Assets declared in a script's manifest (css, templates). */
export interface ScriptAssets {
    css?: string;
    templates?: string;
}

/** A script to inject into a tab. */
export interface InjectableScript {
    id: string;
    name?: string;
    code: string;
    order: number;
    runAt?: "document_start" | "document_idle" | "document_end";
    configBinding?: string;
    themeBinding?: string;
    isIife?: boolean;
    /** Optional per-script assets (CSS file, template registry). */
    assets?: ScriptAssets;
}

/** Reason a script was skipped during resolution. */
export type SkipReason = "disabled" | "missing" | "resolver_mismatch";

/** Result of a single script injection. */
export interface InjectionResult {
    scriptId: string;
    isSuccess: boolean;
    errorMessage?: string;
    durationMs: number;
    /** Set when the script was skipped before execution. */
    skipReason?: SkipReason;
    /** Human-readable name for display. */
    scriptName?: string;
    /** Which injection path was used (main-blob, userScripts, isolated-blob). */
    injectionPath?: string;
    /** DOM target used for script tag insertion (body/documentElement). */
    domTarget?: string;
}
