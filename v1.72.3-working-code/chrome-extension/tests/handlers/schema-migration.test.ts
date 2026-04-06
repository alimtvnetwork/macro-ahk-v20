/**
 * Unit tests — Schema Migration Runner
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, getMockStoreSnapshot } from "../mocks/chrome-storage";

installChromeMock();

const { migrateSchema } = await import("../../src/background/schema-migration");

async function createTestDb(schema: string) {
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database();
    db.run(schema);
    return db;
}

// v1 schema: TEXT PK Sessions, snake_case columns (what legacy installs have)
const BASE_LOGS_SCHEMA = `
CREATE TABLE Sessions (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT, version TEXT NOT NULL, user_agent TEXT, notes TEXT);
CREATE TABLE Logs (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
`;

const BASE_ERRORS_SCHEMA = `
CREATE TABLE Errors (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, message TEXT NOT NULL);
CREATE TABLE error_codes (code TEXT PRIMARY KEY, severity TEXT NOT NULL, description TEXT NOT NULL, recovery TEXT);
`;

describe("Schema Migration Runner", () => {
    beforeEach(() => {
        resetMockStorage();
    });

    it("applies all pending migrations from v1 to current", async () => {
        const logsDb = await createTestDb(BASE_LOGS_SCHEMA);
        const errorsDb = await createTestDb(BASE_ERRORS_SCHEMA);

        const result = await migrateSchema(logsDb, errorsDb);

        expect(result.fromVersion).toBe(1);
        expect(result.toVersion).toBe(4);
        expect(result.applied).toBe(3);
        expect(result.failed).toBe(false);
    });

    it("persists schema version to storage after migration", async () => {
        const logsDb = await createTestDb(BASE_LOGS_SCHEMA);
        const errorsDb = await createTestDb(BASE_ERRORS_SCHEMA);

        await migrateSchema(logsDb, errorsDb);

        const snapshot = getMockStoreSnapshot();
        expect(snapshot["marco_schema_version"]).toBe(4);
    });

    it("skips migrations when already at current version", async () => {
        await chrome.storage.local.set({ marco_schema_version: 4 });

        const logsDb = await createTestDb(BASE_LOGS_SCHEMA);
        const errorsDb = await createTestDb(BASE_ERRORS_SCHEMA);

        const result = await migrateSchema(logsDb, errorsDb);

        expect(result.applied).toBe(0);
        expect(result.failed).toBe(false);
    });

    it("adds PascalCase columns after full migration", async () => {
        const logsDb = await createTestDb(BASE_LOGS_SCHEMA);
        const errorsDb = await createTestDb(BASE_ERRORS_SCHEMA);

        await migrateSchema(logsDb, errorsDb);

        // After v4, columns should be PascalCase
        logsDb.run(
            "INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action, ProjectId) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [1, "2026-01-01", "INFO", "bg", "LIFECYCLE", "test", "proj-123"],
        );

        const result = logsDb.exec("SELECT ProjectId FROM Logs WHERE SessionId = 1");
        expect(result[0].values[0][0]).toBe("proj-123");
    });

    it("is idempotent when run twice", async () => {
        const logsDb = await createTestDb(BASE_LOGS_SCHEMA);
        const errorsDb = await createTestDb(BASE_ERRORS_SCHEMA);

        const first = await migrateSchema(logsDb, errorsDb);
        const second = await migrateSchema(logsDb, errorsDb);

        expect(first.applied).toBe(3);
        expect(second.applied).toBe(0);
        expect(second.failed).toBe(false);
    });
});
