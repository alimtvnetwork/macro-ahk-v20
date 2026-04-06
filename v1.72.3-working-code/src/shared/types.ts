/**
 * Marco Extension — Shared TypeScript Interfaces
 *
 * Core data model types from specs 09, 12, 13.
 * See spec/12-chrome-extension/12-project-model-and-url-rules.md
 */

/** Health state machine from spec 09. */
export type HealthState = "HEALTHY" | "DEGRADED" | "ERROR" | "FATAL";

/** URL matching modes for project rules. */
export type MatchMode = "exact" | "prefix" | "regex" | "glob";

/** Script execution world. */
export type ExecutionWorld = "ISOLATED" | "MAIN";

/** Config injection methods (Method 3 deprecated). */
export type InjectionMethod = "global" | "message";

/** Script run-at timing. */
export type RunAt = "document_start" | "document_end" | "document_idle";

/** Injection conditions for a URL rule. */
export interface InjectionConditions {
    requireElement: string | null;
    requireCookie: string | null;
    minDelayMs: number;
    requireOnline: boolean;
}

/** Result of URL matching for a single rule. */
export interface MatchResult {
    projectId: string;
    projectName: string;
    ruleId: string;
    ruleName: string;
    priority: number;
    scriptBindings: ScriptBindingResolved[];
    conditions: InjectionConditions;
}

/** A resolved script binding ready for injection. */
export interface ScriptBindingResolved {
    scriptId: string;
    configId: string | null;
    order: number;
    world: ExecutionWorld;
    runAt: RunAt;
}

/** Regex validation result. */
export interface RegexValidation {
    isValid: boolean;
    errorMessage?: string;
    warningMessage?: string;
}
