/**
 * Marco Extension — Logging Export & Purge Handlers
 *
 * Handles PURGE_LOGS, EXPORT_LOGS_JSON, EXPORT_LOGS_ZIP messages.
 * All column names use PascalCase per database naming convention.
 *
 * @see spec/05-chrome-extension/06-logging-architecture.md — Logging architecture
 */

import type { MessageRequest } from "../../shared/messages";
import { getLogsDb, getErrorsDb, markLoggingDirty, countTable } from "./logging-handler";
import JSZip from "jszip";
import { logCaughtError } from "../bg-logger";

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
    addPlainTextLogs(zip);
    addDatabaseBinaries(zip);

    return generateBase64DataUrl(zip);
}

/** Adds a human-readable logs.txt to the ZIP. */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- report builder with summary + per-script breakdown
function addPlainTextLogs(zip: JSZip): void {
    const lines: string[] = [];
    lines.push("=== Marco Extension — Diagnostic Logs ===");
    lines.push(`Exported: ${new Date().toISOString()}`);
    lines.push(`Version:  ${chrome.runtime.getManifest().version}`);
    lines.push("");

    // Injection event summary
    const logRows = exportTableRows(getLogsDb(), "Logs");
    const errorRows = exportTableRows(getErrorsDb(), "Errors");
    const injectionRows = logRows.filter(r =>
        String(r.category || r.Category || "").toUpperCase() === "INJECTION",
    );
    const actionOf = (r: Record<string, unknown>) =>
        String(r.action || r.Action || "").toUpperCase();
    const levelOf = (r: Record<string, unknown>) =>
        String(r.level || r.Level || "").toUpperCase();
    const scriptOf = (r: Record<string, unknown>) =>
        String(r.ScriptId || r.scriptId || r.script_id || "");
    const detailOf = (r: Record<string, unknown>) =>
        String(r.detail || r.Detail || "");

    const injectCount = injectionRows.filter(r => actionOf(r).includes("INJECTED") || actionOf(r).includes("SUCCESS")).length;
    const skipCount = injectionRows.filter(r => actionOf(r).includes("SKIP")).length;
    const guardCount = injectionRows.filter(r => actionOf(r).includes("GUARD") || actionOf(r).includes("RESEED")).length;
    const injectionErrors = injectionRows.filter(r => levelOf(r) === "ERROR").length;
    const totalErrors = errorRows.length;

    lines.push("--- Injection Summary ---");
    lines.push(`  Injected:  ${injectCount}`);
    lines.push(`  Skipped:   ${skipCount}`);
    lines.push(`  Guards:    ${guardCount}`);
    lines.push(`  Inj Errors:${injectionErrors}`);
    lines.push(`  Total Errs:${totalErrors}`);
    lines.push(`  Total Logs:${logRows.length}`);
    lines.push("");

    // Per-script breakdown
    const scriptMap = new Map<string, { status: string; detail: string; ts: string }>();
    for (const row of injectionRows) {
        const sid = scriptOf(row);
        if (!sid) continue;
        const act = actionOf(row);
        const ts = String(row.timestamp || row.Timestamp || "");
        const det = detailOf(row);
        let status = "unknown";
        if (act.includes("INJECTED") || act.includes("SUCCESS")) status = "✅ injected";
        else if (act.includes("SKIP")) status = "⏭ skipped";
        else if (act.includes("GUARD") || act.includes("RESEED")) status = "🔄 guard/reseed";
        else if (levelOf(row) === "ERROR") status = "❌ error";
        // Keep last event per script (most recent wins)
        scriptMap.set(sid, { status, detail: det, ts });
    }
    if (scriptMap.size > 0) {
        lines.push("--- Per-Script Breakdown ---");
        for (const [sid, info] of scriptMap) {
            const detPreview = info.detail.length > 80
                ? info.detail.slice(0, 80) + "…"
                : info.detail;
            lines.push(`  ${info.status.padEnd(16)} ${sid.padEnd(30)} ${detPreview}`);
        }
        lines.push("");
    }

    // Logs
    lines.push(`--- Logs (${logRows.length} rows) ---`);
    for (const row of logRows) {
        const ts = row.timestamp || row.Timestamp || "";
        const level = String(row.level || row.Level || "").padEnd(5);
        const source = row.source || row.Source || "";
        const category = row.category || row.Category || "";
        const action = row.action || row.Action || "";
        const detail = row.detail || row.Detail || "";
        const scriptId = scriptOf(row);
        const scriptTag = scriptId ? ` [${scriptId}]` : "";
        lines.push(`${ts} ${level} ${source}/${category} ${action}${scriptTag} — ${detail}`);
    }

    lines.push("");

    // Errors
    lines.push(`--- Errors (${errorRows.length} rows) ---`);
    for (const row of errorRows) {
        const ts = row.timestamp || row.Timestamp || "";
        const level = String(row.level || row.Level || "").padEnd(5);
        const source = row.source || row.Source || "";
        const category = row.category || row.Category || "";
        const code = row.ErrorCode || row.error_code || "";
        const message = row.message || row.Message || "";
        const stack = (row.StackTrace || row.stack_trace) ? `\n    Stack: ${row.StackTrace || row.stack_trace}` : "";
        lines.push(`${ts} ${level} ${source}/${category} ${code} — ${message}${stack}`);
    }

    zip.file("logs.txt", lines.join("\n"));
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
    logCaughtError("[logging]", "ZIP export failed", error);
}
