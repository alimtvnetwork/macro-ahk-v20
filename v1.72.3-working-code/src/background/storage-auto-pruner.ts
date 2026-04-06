/**
 * Marco Extension — Storage Auto-Pruner
 *
 * Monitors storage usage and auto-prunes oldest logs
 * when approaching quota limits. Runs on keepalive ticks.
 */

import { countTable, getLogsDb, getErrorsDb, markLoggingDirty } from "./handlers/logging-handler";
import { transitionHealth, recoverHealth } from "./health-handler";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PRUNE_TRIGGER_THRESHOLD = 4_500_000;
const PRUNE_TARGET_ROWS = 100_000;
const PRUNE_BATCH_SIZE = 500;
const HEALTHY_THRESHOLD = 3_000_000;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Checks storage pressure and auto-prunes if needed. */
export async function checkAndAutoPrune(): Promise<void> {
    const totalRows = getTotalRows();
    const isOverThreshold = totalRows >= PRUNE_TRIGGER_THRESHOLD;
    if (isOverThreshold) {
        await performAutoPrune(totalRows);
    }
    updateHealthAfterPrune();
}

/* ------------------------------------------------------------------ */
/*  Pruning Logic                                                      */
/* ------------------------------------------------------------------ */

/** Performs the auto-prune operation. */
async function performAutoPrune(currentTotal: number): Promise<void> {
    const rowsToRemove = currentTotal - PRUNE_TARGET_ROWS;
    const isRemovalNeeded = rowsToRemove > 0;
    if (isRemovalNeeded) {
        transitionHealth("DEGRADED", "Auto-pruning storage");
        pruneOldestLogs(rowsToRemove);
        pruneOldestErrors(Math.floor(rowsToRemove * 0.1));
        markLoggingDirty();
        console.log(
            `[auto-pruner] Pruned ~${rowsToRemove} rows (target: ${PRUNE_TARGET_ROWS})`,
        );
    }
}

/** Deletes the oldest N log rows in batches. */
function pruneOldestLogs(count: number): void {
    const db = getLogsDb();
    let remaining = count;
    while (remaining > 0) {
        const batchSize = Math.min(remaining, PRUNE_BATCH_SIZE);
        db.run(
            `DELETE FROM Logs WHERE rowid IN (
                SELECT rowid FROM Logs ORDER BY timestamp ASC LIMIT ?
            )`,
            [batchSize],
        );
        remaining -= batchSize;
    }
}

/** Deletes the oldest N error rows. */
function pruneOldestErrors(count: number): void {
    const isCountPositive = count > 0;
    if (isCountPositive) {
        const db = getErrorsDb();
        db.run(
            `DELETE FROM Errors WHERE rowid IN (
                SELECT rowid FROM Errors ORDER BY timestamp ASC LIMIT ?
            )`,
            [count],
        );
    }
}

/* ------------------------------------------------------------------ */
/*  Health Updates                                                     */
/* ------------------------------------------------------------------ */

/** Updates health state based on post-prune row count. */
function updateHealthAfterPrune(): void {
    const totalRows = getTotalRows();
    const isHealthy = totalRows < HEALTHY_THRESHOLD;
    if (isHealthy) {
        recoverHealth();
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns total rows across logs and errors. */
function getTotalRows(): number {
    try {
        const logCount = countTable(getLogsDb(), "Logs");
        const errorCount = countTable(getErrorsDb(), "Errors");
        return logCount + errorCount;
    } catch {
        return 0;
    }
}
