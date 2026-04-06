/**
 * Unit tests — Storage Handler
 *
 * Tests GET_STORAGE_STATS, QUERY_LOGS, and GET_LOG_DETAIL
 * against real sql.js databases with a mock DbManager.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";
import initSqlJs from "sql.js";
import type { DbManager } from "../../src/background/db-manager";
import { MessageType } from "../../src/shared/messages";

installChromeMock();

const {
    bindStorageDbManager,
    handleGetStorageStats,
    handleQueryLogs,
    handleGetLogDetail,
} = await import("../../src/background/handlers/storage-handler");

const LOGS_SCHEMA = `
CREATE TABLE Sessions (Id INTEGER PRIMARY KEY AUTOINCREMENT, StartedAt TEXT NOT NULL, Version TEXT NOT NULL);
CREATE TABLE Logs (Id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId INTEGER NOT NULL, Timestamp TEXT NOT NULL, Level TEXT NOT NULL, Source TEXT NOT NULL, Category TEXT NOT NULL, Action TEXT NOT NULL, Detail TEXT);
`;

const ERRORS_SCHEMA = `
CREATE TABLE Errors (Id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId INTEGER NOT NULL, Timestamp TEXT NOT NULL, Level TEXT NOT NULL, Source TEXT NOT NULL, Category TEXT NOT NULL, Message TEXT NOT NULL, Resolved INTEGER DEFAULT 0);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let logsDb: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>;
let errorsDb: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>;

async function setupDbs(): Promise<void> {
    if (!SQL) SQL = await initSqlJs();

    logsDb = new SQL.Database();
    logsDb.run(LOGS_SCHEMA);

    errorsDb = new SQL.Database();
    errorsDb.run(ERRORS_SCHEMA);

    const manager: DbManager = {
        getLogsDb: () => logsDb,
        getErrorsDb: () => errorsDb,
        getPersistenceMode: () => "opfs",
        flushIfDirty: async () => {},
        markDirty: () => {},
    };

    bindStorageDbManager(manager);
}

/** Inserts N log rows with sequential timestamps. */
function seedLogs(count: number): void {
    for (let i = 0; i < count; i++) {
        const ts = `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`;
        logsDb.run(
            "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action, Detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [1, ts, "INFO", "background", "LIFECYCLE", `action_${i}`, `detail ${i}`],
        );
    }
}

/** Inserts N error rows. */
function seedErrors(count: number): void {
    for (let i = 0; i < count; i++) {
        const ts = `2026-01-01T00:00:${String(i).padStart(2, "0")}Z`;
        errorsDb.run(
            "INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, Message) VALUES (?, ?, ?, ?, ?, ?)",
            [1, ts, "ERROR", "bg", "API", `error ${i}`],
        );
    }
}

/* ------------------------------------------------------------------ */
/*  GET_STORAGE_STATS                                                  */
/* ------------------------------------------------------------------ */

describe("Storage Handler — GET_STORAGE_STATS", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns zero counts on empty databases", async () => {
        const stats = (await handleGetStorageStats()) as any;

        expect(stats.logCount).toBe(0);
        expect(stats.errorCount).toBe(0);
        expect(stats.sessionCount).toBe(0);
        expect(stats.persistenceMode).toBe("opfs");
    });

    it("reflects inserted row counts", async () => {
        seedLogs(3);
        seedErrors(2);
        logsDb.run("INSERT INTO Sessions (StartedAt, Version) VALUES ('2026-01-01', '1.0.0')");

        const stats = (await handleGetStorageStats()) as any;

        expect(stats.logCount).toBe(3);
        expect(stats.errorCount).toBe(2);
        expect(stats.sessionCount).toBe(1);
    });

    it("includes per-database summaries", async () => {
        seedLogs(1);
        const stats = (await handleGetStorageStats()) as any;

        expect(stats.databases).toHaveLength(2);
        expect(stats.databases[0].name).toBe("logs.db");
        expect(stats.databases[1].name).toBe("errors.db");
    });
});

/* ------------------------------------------------------------------ */
/*  QUERY_LOGS                                                         */
/* ------------------------------------------------------------------ */

describe("Storage Handler — QUERY_LOGS", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns empty rows and zero total when no data", async () => {
        const result = await handleQueryLogs({
            type: MessageType.QUERY_LOGS,
            database: "logs",
            offset: 0,
            limit: 10,
        } as any);

        expect(result.rows).toEqual([]);
        expect(result.total).toBe(0);
    });

    it("returns paginated log rows", async () => {
        seedLogs(5);

        const result = await handleQueryLogs({
            type: MessageType.QUERY_LOGS,
            database: "logs",
            offset: 0,
            limit: 3,
        } as any);

        expect(result.rows).toHaveLength(3);
        expect(result.total).toBe(5);
    });

    it("supports offset for pagination", async () => {
        seedLogs(5);

        const result = await handleQueryLogs({
            type: MessageType.QUERY_LOGS,
            database: "logs",
            offset: 3,
            limit: 10,
        } as any);

        expect(result.rows).toHaveLength(2);
    });

    it("queries errors database when specified", async () => {
        seedErrors(4);

        const result = await handleQueryLogs({
            type: MessageType.QUERY_LOGS,
            database: "errors",
            offset: 0,
            limit: 10,
        } as any);

        expect(result.rows).toHaveLength(4);
        expect(result.total).toBe(4);
    });
});

/* ------------------------------------------------------------------ */
/*  GET_LOG_DETAIL                                                     */
/* ------------------------------------------------------------------ */

describe("Storage Handler — GET_LOG_DETAIL", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns null for non-existent row", async () => {
        const result = await handleGetLogDetail({
            type: MessageType.GET_LOG_DETAIL,
            database: "logs",
            rowId: 999,
        } as any);

        expect(result.row).toBeNull();
    });

    it("returns the correct log row by id", async () => {
        seedLogs(3);

        const result = await handleGetLogDetail({
            type: MessageType.GET_LOG_DETAIL,
            database: "logs",
            rowId: 2,
        } as any);

        expect(result.row).not.toBeNull();
        expect((result.row as any).Action).toBe("action_1");
    });

    it("returns an error row by id", async () => {
        seedErrors(2);

        const result = await handleGetLogDetail({
            type: MessageType.GET_LOG_DETAIL,
            database: "errors",
            rowId: 1,
        } as any);

        expect(result.row).not.toBeNull();
        expect((result.row as any).Message).toBe("error 0");
    });
});
