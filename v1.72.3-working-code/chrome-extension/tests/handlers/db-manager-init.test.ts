/**
 * Integration test — DB Manager Initialization
 *
 * Tests the 3-tier persistence fallback chain:
 * OPFS → chrome.storage.local → in-memory.
 * Uses real sql.js databases with mocked storage APIs.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";
import initSqlJs from "sql.js";

installChromeMock();

const { FULL_LOGS_SCHEMA, ERRORS_SCHEMA } = await import(
    "../../src/background/db-schemas"
);

const {
    loadOrCreateFromOpfs,
    saveToOpfs,
    loadFromStorage,
    flushToStorage,
} = await import("../../src/background/db-persistence");

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function getSql() {
    if (!SQL) SQL = await initSqlJs();
    return SQL;
}

/* ------------------------------------------------------------------ */
/*  OPFS Mock Helpers                                                  */
/* ------------------------------------------------------------------ */

/** Builds a minimal in-memory OPFS mock using Map<string, Uint8Array>. */
function buildOpfsMock(): FileSystemDirectoryHandle {
    const files = new Map<string, Uint8Array>();

    return {
        getFileHandle: async (name: string, opts?: { create?: boolean }) => {
            const isCreate = opts?.create === true;
            const hasFile = files.has(name);

            if (!hasFile && !isCreate) {
                throw new DOMException("Not found", "NotFoundError");
            }

            return {
                getFile: async () => {
                    const data = files.get(name) ?? new Uint8Array(0);
                    return new Blob([data]);
                },
                createWritable: async () => {
                    let buffer: Uint8Array | null = null;

                    return {
                        write: async (data: Uint8Array) => {
                            buffer = new Uint8Array(data);
                        },
                        close: async () => {
                            if (buffer !== null) {
                                files.set(name, buffer);
                            }
                        },
                    };
                },
            };
        },
    } as unknown as FileSystemDirectoryHandle;
}

/** Builds an OPFS mock that always throws (simulating OPFS unavailable). */
function buildBrokenOpfsMock(): FileSystemDirectoryHandle {
    return {
        getFileHandle: async () => {
            throw new DOMException("OPFS unavailable", "SecurityError");
        },
    } as unknown as FileSystemDirectoryHandle;
}

/* ------------------------------------------------------------------ */
/*  OPFS Success Path                                                  */
/* ------------------------------------------------------------------ */

describe("DB Manager Init — OPFS Success Path", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates fresh databases when OPFS is empty", async () => {
        const sql = await getSql();
        const root = buildOpfsMock();

        const logsDb = await loadOrCreateFromOpfs(sql, root, "logs.db", FULL_LOGS_SCHEMA);
        const errorsDb = await loadOrCreateFromOpfs(sql, root, "errors.db", ERRORS_SCHEMA);

        expect(logsDb).toBeDefined();
        expect(errorsDb).toBeDefined();

        // Verify schemas applied — tables exist
        const logTables = logsDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = logTables[0].values.flat();
        expect(tableNames).toContain("Logs");
        expect(tableNames).toContain("Sessions");

        const errorTables = errorsDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const errorTableNames = errorTables[0].values.flat();
        expect(errorTableNames).toContain("Errors");

        logsDb.close();
        errorsDb.close();
    });

    it("persists and reloads database from OPFS", async () => {
        const sql = await getSql();
        const root = buildOpfsMock();

        // Create and populate
        const db1 = await loadOrCreateFromOpfs(sql, root, "test.db", FULL_LOGS_SCHEMA);
        db1.run(
            "INSERT INTO Sessions (StartedAt, Version) VALUES (?, ?)",
            ["2026-01-01T00:00:00Z", "1.0.0"],
        );
        await saveToOpfs(root, "test.db", db1);
        db1.close();

        // Reload from OPFS
        const db2 = await loadOrCreateFromOpfs(sql, root, "test.db", FULL_LOGS_SCHEMA);
        const rows = db2.exec("SELECT Id FROM Sessions");

        expect(rows[0].values).toHaveLength(1);
        expect(rows[0].values[0][0]).toBe(1); // INTEGER AUTOINCREMENT

        db2.close();
    });

    it("persists log rows across OPFS save/load cycles", async () => {
        const sql = await getSql();
        const root = buildOpfsMock();

        const db = await loadOrCreateFromOpfs(sql, root, "logs.db", FULL_LOGS_SCHEMA);

        // Insert multiple log entries
        for (let i = 0; i < 5; i++) {
            db.run(
                "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action) VALUES (?, ?, ?, ?, ?, ?)",
                [1, `2026-01-01T00:0${i}:00Z`, "INFO", "bg", "TEST", `action-${i}`],
            );
        }

        await saveToOpfs(root, "logs.db", db);
        db.close();

        // Reload and verify count
        const db2 = await loadOrCreateFromOpfs(sql, root, "logs.db", FULL_LOGS_SCHEMA);
        const countResult = db2.exec("SELECT COUNT(*) FROM Logs");
        expect(countResult[0].values[0][0]).toBe(5);

        db2.close();
    });

    it("indexes are created on fresh OPFS database", async () => {
        const sql = await getSql();
        const root = buildOpfsMock();

        const db = await loadOrCreateFromOpfs(sql, root, "logs.db", FULL_LOGS_SCHEMA);
        const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'Idx%'");
        const indexNames = indexes[0].values.flat() as string[];

        expect(indexNames).toContain("IdxLogsSession");
        expect(indexNames).toContain("IdxLogsLevel");
        expect(indexNames).toContain("IdxLogsTimestamp");

        db.close();
    });
});

/* ------------------------------------------------------------------ */
/*  Storage Fallback Path                                              */
/* ------------------------------------------------------------------ */

describe("DB Manager Init — Storage Fallback", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates fresh databases from storage when no data exists", async () => {
        const sql = await getSql();

        const logsDb = await loadFromStorage(sql, "sqlite_logs_db", FULL_LOGS_SCHEMA);
        const errorsDb = await loadFromStorage(sql, "sqlite_errors_db", ERRORS_SCHEMA);

        expect(logsDb).toBeDefined();
        expect(errorsDb).toBeDefined();

        const tables = logsDb.exec("SELECT name FROM sqlite_master WHERE type='table'");
        const tableNames = tables[0].values.flat();
        expect(tableNames).toContain("Logs");

        logsDb.close();
        errorsDb.close();
    });

    it("roundtrips databases through chrome.storage.local", async () => {
        const sql = await getSql();

        // Create and populate
        const logsDb = await loadFromStorage(sql, "sqlite_logs_db", FULL_LOGS_SCHEMA);
        const errorsDb = await loadFromStorage(sql, "sqlite_errors_db", ERRORS_SCHEMA);

        logsDb.run(
            "INSERT INTO Sessions (StartedAt, Version) VALUES (?, ?)",
            ["2026-01-01T00:00:00Z", "1.0.0"],
        );

        errorsDb.run(
            "INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, Message) VALUES (?, ?, ?, ?, ?, ?)",
            [1, "2026-01-01T00:00:00Z", "ERROR", "bg", "TEST", "test error"],
        );

        // Flush to storage
        await flushToStorage({
            logsDb,
            errorsDb,
            logsKey: "sqlite_logs_db",
            errorsKey: "sqlite_errors_db",
        });

        logsDb.close();
        errorsDb.close();

        // Reload from storage
        const logsDb2 = await loadFromStorage(sql, "sqlite_logs_db", FULL_LOGS_SCHEMA);
        const errorsDb2 = await loadFromStorage(sql, "sqlite_errors_db", ERRORS_SCHEMA);

        const sessions = logsDb2.exec("SELECT Id FROM Sessions");
        expect(sessions[0].values[0][0]).toBe(1);

        const errors = errorsDb2.exec("SELECT Message FROM Errors");
        expect(errors[0].values[0][0]).toBe("test error");

        logsDb2.close();
        errorsDb2.close();
    });

    it("OPFS failure falls through to storage", async () => {
        const sql = await getSql();
        const brokenRoot = buildBrokenOpfsMock();

        // OPFS should fail
        let opfsSucceeded = false;
        try {
            await loadOrCreateFromOpfs(sql, brokenRoot, "test.db", FULL_LOGS_SCHEMA);
            opfsSucceeded = true;
        } catch {
            opfsSucceeded = false;
        }
        expect(opfsSucceeded).toBe(false);

        // Storage should succeed
        const db = await loadFromStorage(sql, "fallback_db", FULL_LOGS_SCHEMA);
        expect(db).toBeDefined();

        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        expect(tables[0].values.flat()).toContain("Logs");

        db.close();
    });

    it("flushToStorage serializes and deserializes correctly", async () => {
        const sql = await getSql();

        const logsDb = new sql.Database();
        logsDb.run(FULL_LOGS_SCHEMA);

        const errorsDb = new sql.Database();
        errorsDb.run(ERRORS_SCHEMA);

        // Insert data
        logsDb.run(
            "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action) VALUES (?, ?, ?, ?, ?, ?)",
            [1, "2026-01-01T00:00:00Z", "DEBUG", "bg", "FLUSH", "test"],
        );

        await flushToStorage({
            logsDb,
            errorsDb,
            logsKey: "flush_logs",
            errorsKey: "flush_errors",
        });

        // Verify storage contains array data
        const stored = await chrome.storage.local.get(["flush_logs", "flush_errors"]);
        expect(stored["flush_logs"]).toBeDefined();
        expect(Array.isArray(stored["flush_logs"])).toBe(true);
        expect((stored["flush_logs"] as number[]).length).toBeGreaterThan(0);

        logsDb.close();
        errorsDb.close();
    });
});

/* ------------------------------------------------------------------ */
/*  In-Memory Fallback Path                                            */
/* ------------------------------------------------------------------ */

describe("DB Manager Init — In-Memory Fallback", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates working in-memory databases when both OPFS and storage fail", async () => {
        const sql = await getSql();

        // Simulate: both OPFS and storage unavailable → use raw in-memory
        const logsDb = new sql.Database();
        logsDb.run(FULL_LOGS_SCHEMA);

        const errorsDb = new sql.Database();
        errorsDb.run(ERRORS_SCHEMA);

        // Databases should still function
        logsDb.run(
            "INSERT INTO Sessions (StartedAt, Version) VALUES (?, ?)",
            ["2026-01-01T00:00:00Z", "1.0.0"],
        );

        logsDb.run(
            "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action) VALUES (?, ?, ?, ?, ?, ?)",
            [1, "2026-01-01T00:00:00Z", "INFO", "bg", "TEST", "memory-action"],
        );

        errorsDb.run(
            "INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, Message) VALUES (?, ?, ?, ?, ?, ?)",
            [1, "2026-01-01T00:00:00Z", "ERROR", "bg", "TEST", "memory-error"],
        );

        const logCount = logsDb.exec("SELECT COUNT(*) FROM Logs");
        expect(logCount[0].values[0][0]).toBe(1);

        const errorCount = errorsDb.exec("SELECT COUNT(*) FROM Errors");
        expect(errorCount[0].values[0][0]).toBe(1);

        logsDb.close();
        errorsDb.close();
    });

    it("in-memory databases support all schema features", async () => {
        const sql = await getSql();

        const db = new sql.Database();
        db.run(FULL_LOGS_SCHEMA);

        // Verify indexes work
        const indexes = db.exec(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'Idx%'",
        );
        expect(indexes[0].values.length).toBeGreaterThan(3);

        // Verify multi-column queries work
        db.run(
            "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action, ProjectId, ScriptId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [1, "2026-01-01T00:00:00Z", "WARN", "bg", "INJECTION", "SCRIPT_INJECTED", "proj-1", "script-1"],
        );

        const filtered = db.exec(
            "SELECT Action FROM Logs WHERE Level = 'WARN' AND ProjectId = 'proj-1'",
        );
        expect(filtered[0].values[0][0]).toBe("SCRIPT_INJECTED");

        db.close();
    });

    it("in-memory data is lost on close (no persistence)", async () => {
        const sql = await getSql();

        const db1 = new sql.Database();
        db1.run(FULL_LOGS_SCHEMA);
        db1.run(
            "INSERT INTO Sessions (StartedAt, Version) VALUES (?, ?)",
            ["2026-01-01T00:00:00Z", "1.0.0"],
        );
        db1.close();

        // New in-memory DB should be empty
        const db2 = new sql.Database();
        db2.run(FULL_LOGS_SCHEMA);

        const sessions = db2.exec("SELECT COUNT(*) FROM Sessions");
        expect(sessions[0].values[0][0]).toBe(0);

        db2.close();
    });
});

/* ------------------------------------------------------------------ */
/*  DbManager Interface Contract                                       */
/* ------------------------------------------------------------------ */

describe("DB Manager — Interface Contract", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("markDirty + flushIfDirty roundtrips to storage", async () => {
        const sql = await getSql();

        const logsDb = new sql.Database();
        logsDb.run(FULL_LOGS_SCHEMA);

        const errorsDb = new sql.Database();
        errorsDb.run(ERRORS_SCHEMA);

        // Simulate the manager interface
        let isDirty = false;
        const markDirty = () => { isDirty = true; };
        const flushIfDirty = async () => {
            const isClean = isDirty === false;
            if (isClean) return;
            isDirty = false;

            await flushToStorage({
                logsDb,
                errorsDb,
                logsKey: "sqlite_logs_db",
                errorsKey: "sqlite_errors_db",
            });
        };

        // Insert data and mark dirty
        logsDb.run(
            "INSERT INTO Sessions (StartedAt, Version) VALUES (?, ?)",
            ["2026-01-01T00:00:00Z", "1.0.0"],
        );
        markDirty();
        expect(isDirty).toBe(true);

        // Flush
        await flushIfDirty();
        expect(isDirty).toBe(false);

        // Verify persisted
        const reloaded = await loadFromStorage(sql, "sqlite_logs_db", FULL_LOGS_SCHEMA);
        const rows = reloaded.exec("SELECT Id FROM Sessions");
        expect(rows[0].values[0][0]).toBe(1);

        logsDb.close();
        errorsDb.close();
        reloaded.close();
    });

    it("flushIfDirty is no-op when clean", async () => {
        const sql = await getSql();

        const logsDb = new sql.Database();
        logsDb.run(FULL_LOGS_SCHEMA);
        const errorsDb = new sql.Database();
        errorsDb.run(ERRORS_SCHEMA);

        let isDirty = false;
        let flushCount = 0;

        const flushIfDirty = async () => {
            const isClean = isDirty === false;
            if (isClean) return;
            isDirty = false;
            flushCount++;
        };

        // Should not flush when clean
        await flushIfDirty();
        expect(flushCount).toBe(0);

        // Should flush once when dirty
        isDirty = true;
        await flushIfDirty();
        expect(flushCount).toBe(1);

        // Should not flush again
        await flushIfDirty();
        expect(flushCount).toBe(1);

        logsDb.close();
        errorsDb.close();
    });

    it("multiple OPFS save/load cycles preserve data integrity", async () => {
        const sql = await getSql();
        const root = buildOpfsMock();

        const db = await loadOrCreateFromOpfs(sql, root, "integrity.db", FULL_LOGS_SCHEMA);

        // Write → save → reload × 3 cycles
        for (let cycle = 0; cycle < 3; cycle++) {
            db.run(
                "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action) VALUES (?, ?, ?, ?, ?, ?)",
                [1, `2026-01-0${cycle + 1}T00:00:00Z`, "INFO", "bg", "TEST", `cycle-${cycle}`],
            );
            await saveToOpfs(root, "integrity.db", db);
        }

        db.close();

        // Reload and verify all 3 rows present
        const reloaded = await loadOrCreateFromOpfs(sql, root, "integrity.db", FULL_LOGS_SCHEMA);
        const count = reloaded.exec("SELECT COUNT(*) FROM Logs");
        expect(count[0].values[0][0]).toBe(3);

        const actions = reloaded.exec("SELECT Action FROM Logs ORDER BY Action");
        expect(actions[0].values.map((r) => r[0])).toEqual([
            "cycle-0",
            "cycle-1",
            "cycle-2",
        ]);

        reloaded.close();
    });
});
