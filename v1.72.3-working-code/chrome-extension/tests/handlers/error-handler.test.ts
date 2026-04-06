/**
 * Unit tests — Error Handler
 *
 * Tests GET_ACTIVE_ERRORS and USER_SCRIPT_ERROR against
 * real sql.js databases with a mock DbManager.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";
import initSqlJs from "sql.js";
import type { DbManager } from "../../src/background/db-manager";
import { MessageType } from "../../src/shared/messages";

installChromeMock();

const {
    bindErrorDbManager,
    handleGetActiveErrors,
    handleUserScriptError,
} = await import("../../src/background/handlers/error-handler");

const { getHealthState, setHealthState } = await import(
    "../../src/background/state-manager"
);

const ERRORS_SCHEMA = `
CREATE TABLE Errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, LogId INTEGER,
    timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL,
    ErrorCode TEXT, step INTEGER, xpath TEXT, message TEXT NOT NULL, StackTrace TEXT,
    context TEXT, resolved INTEGER DEFAULT 0, resolution TEXT, ProjectId TEXT,
    UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ScriptFile TEXT,
    ErrorLine INTEGER, ErrorColumn INTEGER, ExtVersion TEXT
);`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let errorsDb: InstanceType<Awaited<ReturnType<typeof initSqlJs>>["Database"]>;
let dirtyCount: number;

async function setupDb(): Promise<void> {
    if (!SQL) SQL = await initSqlJs();

    errorsDb = new SQL.Database();
    errorsDb.run(ERRORS_SCHEMA);
    dirtyCount = 0;

    const manager: DbManager = {
        getLogsDb: () => errorsDb, // unused in error handler
        getErrorsDb: () => errorsDb,
        getPersistenceMode: () => "memory",
        flushIfDirty: async () => {},
        markDirty: () => { dirtyCount++; },
    };

    bindErrorDbManager(manager);
    setHealthState("HEALTHY");
}

describe("Error Handler — GET_ACTIVE_ERRORS", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDb();
    });

    it("returns empty array when no errors exist", async () => {
        const result = await handleGetActiveErrors();
        expect(result.errors).toEqual([]);
    });

    it("returns unresolved errors", async () => {
        errorsDb.run(
            "INSERT INTO Errors (SessionId, timestamp, level, source, category, message, resolved) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", "2026-01-01T00:00:00Z", "ERROR", "bg", "API", "timeout", 0],
        );

        const result = await handleGetActiveErrors();
        expect(result.errors).toHaveLength(1);
    });

    it("excludes resolved errors", async () => {
        errorsDb.run(
            "INSERT INTO Errors (SessionId, timestamp, level, source, category, message, resolved) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", "2026-01-01T00:00:00Z", "ERROR", "bg", "API", "resolved one", 1],
        );

        const result = await handleGetActiveErrors();
        expect(result.errors).toHaveLength(0);
    });

    it("sets health state to DEGRADED when errors exist", async () => {
        errorsDb.run(
            "INSERT INTO Errors (SessionId, timestamp, level, source, category, message, resolved) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", "2026-01-01T00:00:00Z", "ERROR", "bg", "API", "active error", 0],
        );

        await handleGetActiveErrors();
        expect(getHealthState()).toBe("DEGRADED");
    });

    it("does not change health state when no errors", async () => {
        await handleGetActiveErrors();
        expect(getHealthState()).toBe("HEALTHY");
    });
});

describe("Error Handler — USER_SCRIPT_ERROR", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDb();
    });

    it("inserts an error and returns isOk", async () => {
        const result = await handleUserScriptError({
            type: MessageType.USER_SCRIPT_ERROR,
            scriptId: "script-1",
            message: "ReferenceError: x is not defined",
            stack: "at line 5",
        } as any);

        expect(result.isOk).toBe(true);
    });

    it("persists error row with correct fields", async () => {
        await handleUserScriptError({
            type: MessageType.USER_SCRIPT_ERROR,
            scriptId: "script-42",
            message: "TypeError",
            stack: "stack trace here",
        } as any);

        const rows = errorsDb.exec("SELECT ErrorCode, ScriptId, message, StackTrace FROM Errors");
        expect(rows[0].values).toHaveLength(1);
        expect(rows[0].values[0][0]).toBe("USER_SCRIPT_ERROR");
        expect(rows[0].values[0][1]).toBe("script-42");
        expect(rows[0].values[0][2]).toBe("TypeError");
        expect(rows[0].values[0][3]).toBe("stack trace here");
    });

    it("marks the database as dirty", async () => {
        const before = dirtyCount;

        await handleUserScriptError({
            type: MessageType.USER_SCRIPT_ERROR,
            scriptId: "s1",
            message: "err",
            stack: "",
        } as any);

        expect(dirtyCount).toBeGreaterThan(before);
    });

    it("inserted errors appear in GET_ACTIVE_ERRORS", async () => {
        await handleUserScriptError({
            type: MessageType.USER_SCRIPT_ERROR,
            scriptId: "s1",
            message: "fail",
            stack: "trace",
        } as any);

        const result = await handleGetActiveErrors();
        expect(result.errors).toHaveLength(1);
    });
});
