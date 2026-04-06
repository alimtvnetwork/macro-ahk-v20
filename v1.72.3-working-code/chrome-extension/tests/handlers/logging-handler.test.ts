/**
 * Unit tests — Logging Handler
 *
 * Tests LOG_ENTRY, LOG_ERROR, GET_RECENT_LOGS, GET_LOG_STATS,
 * PURGE_LOGS, and EXPORT_LOGS_JSON against real sql.js databases.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";
import initSqlJs from "sql.js";
import type { DbManager } from "../../src/background/db-manager";
import { MessageType } from "../../src/shared/messages";

installChromeMock();

const {
    bindDbManager,
    startSession,
    handleLogEntry,
    handleLogError,
    handleGetRecentLogs,
    handleGetLogStats,
} = await import("../../src/background/handlers/logging-handler");

const {
    handlePurgeLogs,
    handleExportLogsJson,
} = await import("../../src/background/handlers/logging-export-handler");

/* ------------------------------------------------------------------ */
/*  Test DB Setup                                                      */
/* ------------------------------------------------------------------ */

const LOGS_SCHEMA = `
CREATE TABLE Sessions (id TEXT PRIMARY KEY, StartedAt TEXT NOT NULL, EndedAt TEXT, version TEXT NOT NULL, UserAgent TEXT, notes TEXT);
CREATE TABLE Logs (id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, action TEXT NOT NULL, LogType TEXT, indent INTEGER DEFAULT 0, detail TEXT, metadata TEXT, DurationMs INTEGER, ProjectId TEXT, UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ExtVersion TEXT);
`;

const ERRORS_SCHEMA = `
CREATE TABLE Errors (id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, LogId INTEGER, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, ErrorCode TEXT, step INTEGER, xpath TEXT, message TEXT NOT NULL, StackTrace TEXT, context TEXT, resolved INTEGER DEFAULT 0, resolution TEXT, ProjectId TEXT, UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ScriptFile TEXT, ErrorLine INTEGER, ErrorColumn INTEGER, ExtVersion TEXT);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let logsDb: ReturnType<typeof SQL.Database.prototype.constructor>;
let errorsDb: ReturnType<typeof SQL.Database.prototype.constructor>;
let dirtyCount: number;

/** Creates fresh databases and binds the mock DbManager. */
async function setupDbs(): Promise<void> {
    if (!SQL) {
        SQL = await initSqlJs();
    }

    logsDb = new SQL.Database();
    logsDb.run(LOGS_SCHEMA);

    errorsDb = new SQL.Database();
    errorsDb.run(ERRORS_SCHEMA);

    dirtyCount = 0;

    const manager: DbManager = {
        getLogsDb: () => logsDb,
        getErrorsDb: () => errorsDb,
        getPersistenceMode: () => "memory",
        flushIfDirty: async () => {},
        markDirty: () => { dirtyCount++; },
    };

    bindDbManager(manager);
    startSession("1.0.0-test");
}

/** Builds a LOG_ENTRY message. */
function logEntryMsg(overrides: Record<string, string> = {}) {
    return {
        type: MessageType.LOG_ENTRY,
        level: "INFO",
        source: "background",
        category: "LIFECYCLE",
        action: "test_action",
        detail: "test detail",
        ...overrides,
    } as any;
}

/** Builds a LOG_ERROR message. */
function logErrorMsg(overrides: Record<string, string> = {}) {
    return {
        type: MessageType.LOG_ERROR,
        level: "ERROR",
        source: "background",
        category: "API",
        errorCode: "API_TIMEOUT",
        message: "Request timed out",
        ...overrides,
    } as any;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Logging Handler — LOG_ENTRY", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("inserts a log entry and returns isOk", async () => {
        const result = await handleLogEntry(logEntryMsg());

        expect(result.isOk).toBe(true);
    });

    it("persists log row to the database", async () => {
        await handleLogEntry(logEntryMsg());

        const rows = logsDb.exec("SELECT * FROM Logs");
        expect(rows[0].values).toHaveLength(1);
    });

    it("marks the database as dirty", async () => {
        const before = dirtyCount;
        await handleLogEntry(logEntryMsg());

        expect(dirtyCount).toBeGreaterThan(before);
    });

    it("stores correct field values", async () => {
        await handleLogEntry(logEntryMsg({ level: "WARN", action: "click_start" }));

        const rows = logsDb.exec("SELECT level, action FROM Logs");
        expect(rows[0].values[0][0]).toBe("WARN");
        expect(rows[0].values[0][1]).toBe("click_start");
    });
});

describe("Logging Handler — LOG_ERROR", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("inserts an error entry and returns isOk", async () => {
        const result = await handleLogError(logErrorMsg());

        expect(result.isOk).toBe(true);
    });

    it("persists error row to the errors database", async () => {
        await handleLogError(logErrorMsg());

        const rows = errorsDb.exec("SELECT * FROM Errors");
        expect(rows[0].values).toHaveLength(1);
    });

    it("stores the error code correctly", async () => {
        await handleLogError(logErrorMsg({ errorCode: "AUTH_EXPIRED" }));

        const rows = errorsDb.exec("SELECT ErrorCode FROM Errors");
        expect(rows[0].values[0][0]).toBe("AUTH_EXPIRED");
    });
});

describe("Logging Handler — GET_RECENT_LOGS", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns empty array when no logs exist", async () => {
        const result = await handleGetRecentLogs({ type: MessageType.GET_RECENT_LOGS } as any);

        expect(result.logs).toEqual([]);
    });

    it("returns inserted logs", async () => {
        await handleLogEntry(logEntryMsg());
        await handleLogEntry(logEntryMsg({ action: "second" }));

        const result = await handleGetRecentLogs({ type: MessageType.GET_RECENT_LOGS } as any);

        expect(result.logs).toHaveLength(2);
    });

    it("respects the limit parameter", async () => {
        await handleLogEntry(logEntryMsg());
        await handleLogEntry(logEntryMsg());
        await handleLogEntry(logEntryMsg());

        const result = await handleGetRecentLogs({
            type: MessageType.GET_RECENT_LOGS,
            limit: 2,
        } as any);

        expect(result.logs).toHaveLength(2);
    });

    it("filters by source when provided", async () => {
        await handleLogEntry(logEntryMsg({ source: "popup" }));
        await handleLogEntry(logEntryMsg({ source: "background" }));

        const result = await handleGetRecentLogs({
            type: MessageType.GET_RECENT_LOGS,
            source: "popup",
        } as any);

        expect(result.logs).toHaveLength(1);
        expect((result.logs[0] as any).source).toBe("popup");
    });
});

describe("Logging Handler — GET_LOG_STATS", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns zero counts on fresh database", async () => {
        const stats = await handleGetLogStats() as any;

        expect(stats.logCount).toBe(0);
        expect(stats.errorCount).toBe(0);
        expect(stats.sessionCount).toBe(1); // startSession called in setup
    });

    it("reflects inserted log and error counts", async () => {
        await handleLogEntry(logEntryMsg());
        await handleLogEntry(logEntryMsg());
        await handleLogError(logErrorMsg());

        const stats = await handleGetLogStats() as any;

        expect(stats.logCount).toBe(2);
        expect(stats.errorCount).toBe(1);
    });
});

describe("Logging Handler — PURGE_LOGS", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("purges nothing when all logs are recent", async () => {
        await handleLogEntry(logEntryMsg());

        const result = await handlePurgeLogs({
            type: MessageType.PURGE_LOGS,
            olderThanDays: 30,
        } as any);

        expect(result.purged).toBe(0);
    });

    it("purges old logs by inserting backdated rows", async () => {
        // Insert a row with an old timestamp directly
        const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
        logsDb.run(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", oldDate, "INFO", "bg", "LIFECYCLE", "old_action", "old"],
        );

        await handleLogEntry(logEntryMsg()); // recent log

        const result = await handlePurgeLogs({
            type: MessageType.PURGE_LOGS,
            olderThanDays: 30,
        } as any);

        expect(result.purged).toBe(1);

        const stats = await handleGetLogStats() as any;
        expect(stats.logCount).toBe(1);
    });
});

describe("Logging Handler — EXPORT_LOGS_JSON", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("exports empty array when no logs exist", async () => {
        const result = await handleExportLogsJson();

        expect(JSON.parse(result.json)).toEqual([]);
        expect(result.filename).toContain("marco-logs-");
    });

    it("exports inserted logs as JSON", async () => {
        await handleLogEntry(logEntryMsg({ action: "exported_action" }));

        const result = await handleExportLogsJson();
        const parsed = JSON.parse(result.json);

        expect(parsed).toHaveLength(1);
        expect(parsed[0].action).toBe("exported_action");
    });
});
