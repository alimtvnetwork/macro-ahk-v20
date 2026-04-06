/**
 * Marco Extension — Health Handler
 *
 * Builds GET_HEALTH_STATUS responses and manages the formal
 * health state machine: HEALTHY → DEGRADED → ERROR → FATAL.
 * See spec 09-error-recovery-flows.md.
 */

import type { HealthStatusResponse } from "../shared/messages";
import {
    getHealthState,
    setHealthState,
    type TransientState,
} from "./state-manager";
import { countTable, getLogsDb, getErrorsDb } from "./handlers/logging-handler";
import { logBgWarnError, logCaughtError } from "./bg-logger";

/* eslint-disable @typescript-eslint/no-explicit-any */
const _chr = globalThis.chrome as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_WARNING_THRESHOLD = 4_000_000;
const STORAGE_CRITICAL_THRESHOLD = 4_800_000;
const ERROR_RATE_DEGRADED = 10;
const ERROR_RATE_ERROR = 50;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Builds the health status response from subsystem checks. */
export async function buildHealthResponse(): Promise<HealthStatusResponse> {
    const details: string[] = [];

    const storageResult = await checkStorageAvailability();
    const quotaResult = checkStorageQuota();
    const errorRateResult = checkErrorRate();

    applyStorageResult(storageResult, details);
    applyQuotaResult(quotaResult, details);
    applyErrorRateResult(errorRateResult, details);

    const computedState = computeOverallState(details);
    const previousState = getHealthState();

    if (computedState !== previousState) {
        setHealthState(computedState);
        if (computedState === "HEALTHY") {
            console.log("[health] %s → HEALTHY (recovered)", previousState);
        } else {
            logBgWarnError(BgLogTag.HEALTH, `${previousState} → ${computedState}: ${details.join("; ")}`);
        }
    } else {
        setHealthState(computedState);
    }

    return { state: computedState, details };
}

/** Transitions health to a specific state with a reason. */
export function transitionHealth(
    newState: TransientState["healthState"],
    reason: string,
): void {
    const currentState = getHealthState();
    const isDowngrade = severityOf(newState) > severityOf(currentState);

    if (isDowngrade) {
        setHealthState(newState);
        logBgWarnError(BgLogTag.HEALTH, `${currentState} → ${newState}: ${reason}`);
    }
}

/** Resets health to HEALTHY when recovery conditions are met. */
export function recoverHealth(): void {
    const previousState = getHealthState();
    if (previousState === "HEALTHY") return;
    setHealthState("HEALTHY");
    console.log("[health] %s → HEALTHY", previousState);
}

/* ------------------------------------------------------------------ */
/*  Subsystem Checks                                                   */
/* ------------------------------------------------------------------ */

/** Checks if chrome.storage.local is responsive. */
async function checkStorageAvailability(): Promise<boolean> {
    try {
        await _chr.storage.local.get("__health_check__");
        return true;
    } catch (storageError) {
        const errorMessage = storageError instanceof Error
            ? storageError.message
            : String(storageError);

        logCaughtError(BgLogTag.HEALTH, "Storage check failed", storageError);
        return false;
    }
}

/** Checks total row count against storage thresholds. */
function checkStorageQuota(): "ok" | "warning" | "critical" {
    try {
        const logCount = countTable(getLogsDb(), "Logs");
        const errorCount = countTable(getErrorsDb(), "Errors");
        const totalRows = logCount + errorCount;

        const isCritical = totalRows >= STORAGE_CRITICAL_THRESHOLD;
        const isWarning = totalRows >= STORAGE_WARNING_THRESHOLD;

        if (isCritical) return "critical";
        if (isWarning) return "warning";
        return "ok";
    } catch {
        return "ok";
    }
}

/** Checks recent error rate for health degradation. */
function checkErrorRate(): "ok" | "degraded" | "error" {
    try {
        const errorCount = countTable(getErrorsDb(), "Errors");
        const isError = errorCount >= ERROR_RATE_ERROR;
        const isDegraded = errorCount >= ERROR_RATE_DEGRADED;

        if (isError) return "error";
        if (isDegraded) return "degraded";
        return "ok";
    } catch {
        return "ok";
    }
}

/* ------------------------------------------------------------------ */
/*  Result Applicators                                                 */
/* ------------------------------------------------------------------ */

/** Applies storage availability result to details. */
function applyStorageResult(isAvailable: boolean, details: string[]): void {
    const isUnavailable = !isAvailable;

    if (isUnavailable) {
        details.push("Storage API unavailable");
    }
}

/** Applies quota check result to details. */
function applyQuotaResult(
    result: "ok" | "warning" | "critical",
    details: string[],
): void {
    const isWarning = result === "warning";
    const isCritical = result === "critical";

    if (isCritical) {
        details.push("Storage near capacity — auto-prune recommended");
    } else if (isWarning) {
        details.push("Storage usage elevated");
    }
}

/** Applies error rate result to details. */
function applyErrorRateResult(
    result: "ok" | "degraded" | "error",
    details: string[],
): void {
    const isDegraded = result === "degraded";
    const isError = result === "error";

    if (isError) {
        details.push("High error rate detected");
    } else if (isDegraded) {
        details.push("Elevated error rate");
    }
}

/* ------------------------------------------------------------------ */
/*  State Computation                                                  */
/* ------------------------------------------------------------------ */

/** Computes the overall health state from collected details. */
function computeOverallState(
    details: string[],
): TransientState["healthState"] {
    const hasStorageUnavailable = details.some(
        (d) => d === "Storage API unavailable",
    );
    const hasHighErrors = details.some(
        (d) => d === "High error rate detected",
    );
    const hasCriticalStorage = details.some(
        (d) => d.includes("auto-prune"),
    );
    const hasAnyIssue = details.length > 0;

    if (hasStorageUnavailable) return "ERROR";
    if (hasHighErrors) return "ERROR";
    if (hasCriticalStorage) return "DEGRADED";
    if (hasAnyIssue) return "DEGRADED";
    return "HEALTHY";
}

/** Returns severity rank for health state comparison. */
function severityOf(state: TransientState["healthState"]): number {
    const ranks: Record<string, number> = {
        HEALTHY: 0,
        DEGRADED: 1,
        ERROR: 2,
        FATAL: 3,
    };

    return ranks[state] ?? 0;
}
