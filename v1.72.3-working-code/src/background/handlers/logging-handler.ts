/**
 * Marco Extension — Logging Handler (Core)
 *
 * Handles LOG_ENTRY, LOG_ERROR, GET_RECENT_LOGS, GET_LOG_STATS.
 * Uses db-manager.ts for OPFS SQLite persistence.
 *
 * All column names use PascalCase per database naming convention.
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import type { DbManager } from "../db-manager";
import { collectRows, countTable, queryAll, queryWithSource } from "./logging-queries";

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
export function startSession(version: string): string {
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
function ensureSessionId(): number {
    const isMissingSession = currentSessionId === null;

    if (isMissingSession) {
        startSession("0.0.0");
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

    insertLogRow(msg);
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
}): void {
    const db = getLogsDb();
    const sessionId = ensureSessionId();
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

    insertErrorRow(msg);
    dbManager!.markDirty();
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
}): void {
    const db = getErrorsDb();
    const sessionId = ensureSessionId();
    const now = new Date().toISOString();
    const version = chrome.runtime.getManifest().version;

    db.run(
        `INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, ErrorCode, Message, StackTrace, Context, ScriptId, ProjectId, ConfigId, ScriptFile, ExtVersion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, now, msg.level, msg.source, msg.category, msg.errorCode, msg.message, msg.stackTrace ?? null, msg.context ?? null, msg.scriptId ?? null, msg.projectId ?? null, msg.configId ?? null, msg.scriptFile ?? null, version],
    );
}

/* ------------------------------------------------------------------ */
/*  GET_RECENT_LOGS                                                    */
/* ------------------------------------------------------------------ */

/** Returns recent log entries, newest first. */
export async function handleGetRecentLogs(
    message: MessageRequest,
): Promise<{ logs: unknown[] }> {
    const msg = message as MessageRequest & { source?: string; limit?: number };
    const logs = queryRecentLogs(msg.source, msg.limit);

    return { logs };
}

/** Queries the logs table with optional source filter. */
function queryRecentLogs(source?: string, limit?: number): unknown[] {
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
export async function handleGetLogStats(): Promise<unknown> {
    const logCount = countTable(getLogsDb(), "Logs");
    const errorCount = countTable(getErrorsDb(), "Errors");
    const sessionCount = countTable(getLogsDb(), "Sessions");

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
    logs: unknown[];
    errors: unknown[];
}> {
    const sessionId = currentSessionId !== null ? String(currentSessionId) : "no-session";
    const sessionLogs = querySessionLogs(sessionId);
    const sessionErrors = querySessionErrors(sessionId);

    const hasSessionData = sessionLogs.length > 0 || sessionErrors.length > 0;

    if (hasSessionData) {
        return { sessionId, logs: sessionLogs, errors: sessionErrors };
    }

    const recentLogs = queryRecentLogsAll(200);
    const recentErrors = queryRecentErrorsAll(200);

    return { sessionId, logs: recentLogs, errors: recentErrors };
}

/** Queries logs for a specific session. */
function querySessionLogs(sessionId: string): unknown[] {
    const db = getLogsDb();
    const stmt = db.prepare(
        "SELECT * FROM Logs WHERE SessionId = ? ORDER BY Timestamp ASC",
    );
    stmt.bind([sessionId]);
    return collectRows(stmt);
}

/** Queries errors for a specific session. */
function querySessionErrors(sessionId: string): unknown[] {
    const db = getErrorsDb();
    const stmt = db.prepare(
        "SELECT * FROM Errors WHERE SessionId = ? ORDER BY Timestamp ASC",
    );
    stmt.bind([sessionId]);
    return collectRows(stmt);
}

/** Queries recent logs across all sessions. */
function queryRecentLogsAll(limit: number): unknown[] {
    const db = getLogsDb();
    const stmt = db.prepare(
        "SELECT * FROM Logs ORDER BY Timestamp DESC LIMIT ?",
    );
    stmt.bind([limit]);
    return collectRows(stmt);
}

/** Queries recent errors across all sessions. */
function queryRecentErrorsAll(limit: number): unknown[] {
    const db = getErrorsDb();
    const stmt = db.prepare(
        "SELECT * FROM Errors ORDER BY Timestamp DESC LIMIT ?",
    );
    stmt.bind([limit]);
    return collectRows(stmt);
}

export { collectRows, countTable };
