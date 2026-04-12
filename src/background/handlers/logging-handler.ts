/**
 * Marco Extension — Logging Handler (Core)
 *
 * Handles LOG_ENTRY, LOG_ERROR, GET_RECENT_LOGS, GET_LOG_STATS.
 * Uses db-manager.ts for OPFS SQLite persistence.
 *
 * All column names use PascalCase per database naming convention.
 *
 * @see spec/05-chrome-extension/06-logging-architecture.md — Logging architecture
 * @see spec/05-chrome-extension/19-opfs-persistence-strategy.md — OPFS persistence
 * @see spec/05-chrome-extension/42-user-script-logging-and-data-bridge.md — User script logging
 */

import type { SqlRow } from "./handler-types";
import type { SqlValue } from "sql.js";
import type { MessageRequest, OkResponse } from "../../shared/messages";
import type { DbManager } from "../db-manager";
import { collectRows, countTable, queryAll, queryWithSource } from "./logging-queries";
import { initSessionLogDir, writeLogEntry, writeErrorEntry, buildSessionReport, listSessionIds, listSessionsWithTimestamps, browseOpfsSessions, getOpfsSessionStatus } from "../session-log-writer";
import type { SessionInfo, OpfsStatusData } from "../session-log-writer";

let dbManager: DbManager | null = null;
let currentSessionId: number | null = null;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/** Binds the logging handler to an initialized DbManager. */
export function bindDbManager(manager: DbManager): void {
    dbManager = manager;
}

/** Starts a new logging session and returns its ID (INTEGER AUTOINCREMENT). */
export async function startSession(version: string): Promise<string> {
    const db = getLogsDb();
    const now = new Date().toISOString();

    db.run("INSERT INTO Sessions (StartedAt, Version) VALUES (?, ?)", [
        now,
        version,
    ]);

    const result = db.exec("SELECT last_insert_rowid()");
    const sessionId = Number(result[0].values[0][0]);
    currentSessionId = sessionId;
    dbManager!.markDirty();

    // Initialize OPFS session log directory before first writes can race past it
    await initSessionLogDir(String(sessionId), version);

    return String(sessionId);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns the logs database, throwing if not initialized. */
export function getLogsDb() {
    const isMissingDb = dbManager === null;

    if (isMissingDb) {
        throw new Error("[logging] DbManager not bound. Call bindDbManager() first.");
    }
    return dbManager!.getLogsDb();
}

/** Returns the errors database, throwing if not initialized. */
export function getErrorsDb() {
    const isMissingDb = dbManager === null;

    if (isMissingDb) {
        throw new Error("[logging] DbManager not bound. Call bindDbManager() first.");
    }
    return dbManager!.getErrorsDb();
}

/** Returns the current session ID, creating one if needed. */
async function ensureSessionId(): Promise<number> {
    const isMissingSession = currentSessionId === null;

    if (isMissingSession) {
        await startSession("0.0.0");
    }
    return currentSessionId!;
}

/** Marks the database as dirty for deferred flush. */
export function markLoggingDirty(): void {
    dbManager!.markDirty();
}

/* ------------------------------------------------------------------ */
/*  LOG_ENTRY                                                          */
/* ------------------------------------------------------------------ */

/** Inserts a log entry into the logs database. */
export async function handleLogEntry(message: MessageRequest): Promise<OkResponse> {
    const msg = message as MessageRequest & {
        level: string;
        source: string;
        category: string;
        action: string;
        detail: string;
        scriptId?: string;
        projectId?: string;
        configId?: string;
    };

    const sessionId = await ensureSessionId();
    insertLogRow(msg, sessionId);
    void writeLogEntry(msg);
    dbManager!.markDirty();
    return { isOk: true };
}

/** Executes the INSERT for a single log row. */
function insertLogRow(msg: {
    level: string;
    source: string;
    category: string;
    action: string;
    detail: string;
    scriptId?: string;
    projectId?: string;
    configId?: string;
}, sessionId: number): void {
    const db = getLogsDb();
    const now = new Date().toISOString();
    const version = chrome.runtime.getManifest().version;

    db.run(
        `INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action, Detail, ScriptId, ProjectId, ConfigId, ExtVersion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, now, msg.level, msg.source, msg.category, msg.action, msg.detail, msg.scriptId ?? null, msg.projectId ?? null, msg.configId ?? null, version],
    );
}

/* ------------------------------------------------------------------ */
/*  LOG_ERROR                                                          */
/* ------------------------------------------------------------------ */

/** Inserts an error entry into the errors database. */
export async function handleLogError(message: MessageRequest): Promise<OkResponse> {
    const msg = message as MessageRequest & {
        level: string;
        source: string;
        category: string;
        errorCode: string;
        message: string;
        stackTrace?: string;
        context?: string;
        scriptId?: string;
        projectId?: string;
        configId?: string;
        scriptFile?: string;
    };

    const sessionId = await ensureSessionId();
    insertErrorRow(msg, sessionId);
    writeErrorEntry(msg);
    return { isOk: true };
}

/** Executes the INSERT for a single error row. */
function insertErrorRow(msg: {
    level: string;
    source: string;
    category: string;
    errorCode: string;
    message: string;
    stackTrace?: string;
    context?: string;
    scriptId?: string;
    projectId?: string;
    configId?: string;
    scriptFile?: string;
}, sessionId: number): void {
    const db = getErrorsDb();
    const now = new Date().toISOString();
    const version = chrome.runtime.getManifest().version;

    db.run(
        `INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, ErrorCode, Message, StackTrace, Context, ScriptId, ProjectId, ConfigId, ScriptFile, ExtVersion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, now, msg.level, msg.source, msg.category, msg.errorCode, msg.message, msg.stackTrace ?? null, msg.context ?? null, msg.scriptId ?? null, msg.projectId ?? null, msg.configId ?? null, msg.scriptFile ?? null, version],
    );
}

/* ------------------------------------------------------------------ */
/*  Row normalizer — PascalCase → camelCase                            */
/* ------------------------------------------------------------------ */

/** Maps PascalCase SQLite column names to the camelCase keys the UI expects. */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        // Convert first char to lowercase: "Timestamp" → "timestamp", "StackTrace" → "stackTrace"
        const camel = key.charAt(0).toLowerCase() + key.slice(1);
        out[camel] = value;
        // Also keep original key so nothing breaks if already camelCase
        if (camel !== key) out[key] = value;
    }
    return out;
}

function normalizeRows(rows: SqlRow[]): Record<string, SqlValue>[] {
    return rows.map((r) => normalizeRow(r as Record<string, unknown>));
}

/* ------------------------------------------------------------------ */
/*  GET_RECENT_LOGS                                                    */
/* ------------------------------------------------------------------ */

/** Returns recent log entries, newest first. */
export async function handleGetRecentLogs(
    message: MessageRequest,
): Promise<{ logs: Record<string, SqlValue>[] }> {
    const msg = message as MessageRequest & { source?: string; limit?: number };
    const logs = normalizeRows(queryRecentLogs(msg.source, msg.limit));

    return { logs };
}

/** Queries the logs table with optional source filter. */
function queryRecentLogs(source?: string, limit?: number): SqlRow[] {
    const db = getLogsDb();
    const maxRows = limit ?? 100;
    const hasSourceFilter = source !== undefined && source !== "";

    if (hasSourceFilter) {
        return queryWithSource(db, source!, maxRows);
    }
    return queryAll(db, maxRows);
}

/* ------------------------------------------------------------------ */
/*  GET_LOG_STATS                                                      */
/* ------------------------------------------------------------------ */

/** Returns log and error count statistics. */
export async function handleGetLogStats(): Promise<{ logCount: number; errorCount: number; sessionCount: number }> {
    const logCount = countTable(getLogsDb(), "Logs");
    const errorCount = countTable(getErrorsDb(), "Errors");
    // Defensive: Sessions lives in logs.db — catch startup race where schema may not be ready
    let sessionCount = 0;
    try { sessionCount = countTable(getLogsDb(), "Sessions"); } catch { /* schema not ready */ }

    return { logCount, errorCount, sessionCount };
}

/* ------------------------------------------------------------------ */
/*  GET_SESSION_LOGS                                                   */
/* ------------------------------------------------------------------ */

/** Returns the current session ID. */
export function getCurrentSessionId(): string | null {
    return currentSessionId !== null ? String(currentSessionId) : null;
}

/** Returns all logs and errors for the current session as a copyable report. */
export async function handleGetSessionLogs(): Promise<{
    sessionId: string;
    logs: Record<string, SqlValue>[];
    errors: Record<string, SqlValue>[];
}> {
    const sessionId = currentSessionId !== null ? String(currentSessionId) : "no-session";
    const sessionLogs = normalizeRows(querySessionLogs(sessionId));
    const sessionErrors = normalizeRows(querySessionErrors(sessionId));

    const hasSessionData = sessionLogs.length > 0 || sessionErrors.length > 0;

    if (hasSessionData) {
        return { sessionId, logs: sessionLogs, errors: sessionErrors };
    }

    const recentLogs = normalizeRows(queryRecentLogsAll(200));
    const recentErrors = normalizeRows(queryRecentErrorsAll(200));

    return { sessionId, logs: recentLogs, errors: recentErrors };
}

/** Queries logs for a specific session. */
function querySessionLogs(sessionId: string): SqlRow[] {
    const db = getLogsDb();
    const stmt = db.prepare(
        "SELECT * FROM Logs WHERE SessionId = ? ORDER BY Timestamp ASC",
    );
    stmt.bind([sessionId]);
    return collectRows(stmt);
}

/** Queries errors for a specific session. */
function querySessionErrors(sessionId: string): SqlRow[] {
    const db = getErrorsDb();
    const stmt = db.prepare(
        "SELECT * FROM Errors WHERE SessionId = ? ORDER BY Timestamp ASC",
    );
    stmt.bind([sessionId]);
    return collectRows(stmt);
}

/** Queries recent logs across all sessions. */
function queryRecentLogsAll(limit: number): SqlRow[] {
    const db = getLogsDb();
    const stmt = db.prepare(
        "SELECT * FROM Logs ORDER BY Timestamp DESC LIMIT ?",
    );
    stmt.bind([limit]);
    return collectRows(stmt);
}

/** Queries recent errors across all sessions. */
function queryRecentErrorsAll(limit: number): SqlRow[] {
    const db = getErrorsDb();
    const stmt = db.prepare(
        "SELECT * FROM Errors ORDER BY Timestamp DESC LIMIT ?",
    );
    stmt.bind([limit]);
    return collectRows(stmt);
}

/* ------------------------------------------------------------------ */
/*  GET_SESSION_REPORT — full text report from OPFS files              */
/* ------------------------------------------------------------------ */

/** Returns a comprehensive plain-text report from session log files. */
export async function handleGetSessionReport(
    message: MessageRequest,
): Promise<{ report: string; sessionId: string; sessions: string[]; sessionsWithTimestamps: SessionInfo[] }> {
    const msg = message as MessageRequest & { sessionId?: string };
    const sid = msg.sessionId ?? (currentSessionId !== null ? String(currentSessionId) : null);
    const report = await buildSessionReport(sid ?? undefined);
    const sessionsWithTs = await listSessionsWithTimestamps();
    const sessions = sessionsWithTs.map((s) => s.id);

    return { report, sessionId: sid ?? "none", sessions, sessionsWithTimestamps: sessionsWithTs };
}

export { collectRows, countTable };

/* ------------------------------------------------------------------ */
/*  BROWSE_OPFS_SESSIONS                                               */
/* ------------------------------------------------------------------ */

/** Returns all OPFS session directories with file metadata and absolute paths. */
export async function handleBrowseOpfsSessions() {
    return browseOpfsSessions();
}

/* ------------------------------------------------------------------ */
/*  GET_OPFS_STATUS                                                    */
/* ------------------------------------------------------------------ */

/** Returns the health status of the current OPFS session directory. */
export async function handleGetOpfsStatus(): Promise<OpfsStatusData> {
    return getOpfsSessionStatus();
}
