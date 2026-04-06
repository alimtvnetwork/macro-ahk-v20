/**
 * Marco Extension — Boot Diagnostics
 *
 * Tracks the latest boot step, persistence mode, and per-step
 * timing metrics for surfacing in the diagnostics UI.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface BootTiming {
    step: string;
    durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let bootStep = "pre-init";
let bootPersistenceMode: "opfs" | "storage" | "memory" = "memory";
const bootTimings: BootTiming[] = [];
let stepStartTime = performance.now();
let totalBootMs = 0;

/* ------------------------------------------------------------------ */
/*  Boot Step                                                          */
/* ------------------------------------------------------------------ */

/** Returns the latest boot step label. */
export function getBootStep(): string {
    return bootStep;
}

/** Updates the current boot step and records timing for the previous step. */
export function setBootStep(step: string): void {
    const now = performance.now();
    const isFirstStep = bootStep === "pre-init" && step === "pre-init";

    if (!isFirstStep) {
        const durationMs = Math.round(now - stepStartTime);
        bootTimings.push({ step: bootStep, durationMs });
    }

    bootStep = step;
    stepStartTime = now;
}

/** Marks boot as complete and records the final step timing. */
export function finalizeBoot(): void {
    const now = performance.now();
    const durationMs = Math.round(now - stepStartTime);
    bootTimings.push({ step: bootStep, durationMs });
    totalBootMs = bootTimings.reduce((sum, t) => sum + t.durationMs, 0);
}

/* ------------------------------------------------------------------ */
/*  Persistence Mode                                                   */
/* ------------------------------------------------------------------ */

/** Returns the persistence mode resolved during boot. */
export function getBootPersistenceMode(): "opfs" | "storage" | "memory" {
    return bootPersistenceMode;
}

/** Updates the persistence mode resolved during boot. */
export function setBootPersistenceMode(mode: "opfs" | "storage" | "memory"): void {
    bootPersistenceMode = mode;
}

/* ------------------------------------------------------------------ */
/*  Timings                                                            */
/* ------------------------------------------------------------------ */

/** Returns a copy of all recorded boot timings. */
export function getBootTimings(): BootTiming[] {
    return [...bootTimings];
}

/** Returns total boot duration in milliseconds. */
export function getTotalBootMs(): number {
    return totalBootMs;
}
