/**
 * Marco Extension — Logging Export & Purge Handlers
 *
 * Handles PURGE_LOGS, EXPORT_LOGS_JSON, EXPORT_LOGS_ZIP messages.
 * All column names use PascalCase per database naming convention.
 */

import type { MessageRequest } from "../../shared/messages";
import { getLogsDb, getErrorsDb, markLoggingDirty, countTable } from "./logging-handler";
import JSZip from "jszip";

/* ------------------------------------------------------------------ */
/*  PURGE_LOGS                                                         */
/* ------------------------------------------------------------------ */

/** Purges log entries older than the specified days. */
export async function handlePurgeLogs(
    message: MessageRequest,
): Promise<{ purged: number }> {
    const msg = message as MessageRequest & { olderThanDays?: number };
    const days = msg.olderThanDays ?? 30;
    const purged = purgeOldLogs(days);

    markLoggingDirty();
    return { purged };
}

/** Deletes logs older than N days and returns count deleted. */
function purgeOldLogs(days: number): number {
    const db = getLogsDb();
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();

    const before = countTable(db, "Logs");
    db.run("DELETE FROM Logs WHERE Timestamp < ?", [cutoff]);
    const after = countTable(db, "Logs");

    return before - after;
}

/* ------------------------------------------------------------------ */
/*  EXPORT_LOGS_JSON                                                   */
/* ------------------------------------------------------------------ */

/** Exports all logs as a JSON string. */
export async function handleExportLogsJson(): Promise<{
    json: string;
    filename: string;
}> {
    const db = getLogsDb();
    const mapped = exportTableRows(db, "Logs");

    return {
        json: JSON.stringify(mapped, null, 2),
        filename: buildExportFilename("logs", "json"),
    };
}

/* ------------------------------------------------------------------ */
/*  EXPORT_LOGS_ZIP                                                    */
/* ------------------------------------------------------------------ */

/** Exports logs + errors as a ZIP bundle via JSZip. */
export async function handleExportLogsZip(): Promise<{
    dataUrl: string | null;
    filename: string;
}> {
    try {
        const dataUrl = await buildZipBundle();

        return {
            dataUrl,
            filename: buildExportFilename("bundle", "zip"),
        };
    } catch (zipError) {
        logZipError(zipError);

        return {
            dataUrl: null,
            filename: buildExportFilename("bundle", "zip"),
        };
    }
}

/** Builds the full ZIP bundle with logs, errors, and metadata. */
async function buildZipBundle(): Promise<string> {
    const zip = new JSZip();

    addJsonEntries(zip);
    addDatabaseBinaries(zip);

    return generateBase64DataUrl(zip);
}

/** Adds JSON exports to the ZIP. */
function addJsonEntries(zip: JSZip): void {
    const logsJson = JSON.stringify(exportTableRows(getLogsDb(), "Logs"), null, 2);
    const errorsJson = JSON.stringify(exportTableRows(getErrorsDb(), "Errors"), null, 2);
    const metadata = buildMetadata();

    zip.file("logs.json", logsJson);
    zip.file("errors.json", errorsJson);
    zip.file("metadata.json", JSON.stringify(metadata, null, 2));
}

/** Adds raw SQLite binaries to the ZIP. */
function addDatabaseBinaries(zip: JSZip): void {
    zip.file("logs.db", getLogsDb().export());
    zip.file("errors.db", getErrorsDb().export());
}

/** Generates a base64 data URL from a JSZip instance. */
async function generateBase64DataUrl(zip: JSZip): Promise<string> {
    const base64 = await zip.generateAsync({ type: "base64" });

    return `data:application/zip;base64,${base64}`;
}

/** Builds export metadata. */
function buildMetadata(): Record<string, unknown> {
    return {
        exportedAt: new Date().toISOString(),
        version: chrome.runtime.getManifest().version,
        logCount: countTable(getLogsDb(), "Logs"),
        errorCount: countTable(getErrorsDb(), "Errors"),
    };
}

/* ------------------------------------------------------------------ */
/*  Shared Helpers                                                     */
/* ------------------------------------------------------------------ */

/** Allowed table names for dynamic SQL queries (defense-in-depth). */
const ALLOWED_EXPORT_TABLES = new Set(["Logs", "Errors", "Sessions"]);

/** Exports all rows from a table as objects. Table name is validated against an allowlist. */
function exportTableRows(
    db: ReturnType<typeof getLogsDb>,
    table: string,
): Record<string, unknown>[] {
    if (!ALLOWED_EXPORT_TABLES.has(table)) {
        throw new Error(`[SQL safety] Export table name "${table}" not in allowlist`);
    }
    const result = db.exec(`SELECT * FROM ${table} ORDER BY Timestamp ASC`);
    const hasRows = result.length > 0;

    const rows = hasRows ? result[0].values : [];
    const columns = hasRows ? result[0].columns : [];

    return rows.map((row) => buildRowObject(columns, row));
}

/** Builds a key-value object from column names and row values. */
function buildRowObject(
    columns: string[],
    values: unknown[],
): Record<string, unknown> {
    const obj: Record<string, unknown> = {};

    for (let i = 0; i < columns.length; i++) {
        obj[columns[i]] = values[i];
    }
    return obj;
}

/** Builds a standardized export filename. */
function buildExportFilename(prefix: string, ext: string): string {
    const date = new Date().toISOString().slice(0, 10);

    return `marco-${prefix}-${date}.${ext}`;
}

/** Logs a ZIP export error. */
function logZipError(error: unknown): void {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    console.error(`[logging] ZIP export failed: ${errorMessage}`);
}
