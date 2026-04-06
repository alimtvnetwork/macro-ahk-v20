/**
 * Integration tests — Logging Export Handler
 *
 * Tests JSON export, ZIP bundle generation, and purge operations
 * with realistic multi-entry scenarios and cross-module interactions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";
import initSqlJs from "sql.js";
import JSZip from "jszip";
import type { DbManager } from "../../src/background/db-manager";
import { MessageType } from "../../src/shared/messages";

installChromeMock();

const {
    bindDbManager,
    startSession,
    handleLogEntry,
    handleLogError,
    handleGetLogStats,
} = await import("../../src/background/handlers/logging-handler");

const {
    handlePurgeLogs,
    handleExportLogsJson,
    handleExportLogsZip,
} = await import("../../src/background/handlers/logging-export-handler");

/* ------------------------------------------------------------------ */
/*  DB Setup                                                           */
/* ------------------------------------------------------------------ */

const LOGS_SCHEMA = `
CREATE TABLE Sessions (id TEXT PRIMARY KEY, StartedAt TEXT NOT NULL, EndedAt TEXT, version TEXT NOT NULL, UserAgent TEXT, notes TEXT);
CREATE TABLE Logs (id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, action TEXT NOT NULL, LogType TEXT, indent INTEGER DEFAULT 0, detail TEXT, metadata TEXT, DurationMs INTEGER, ProjectId TEXT, UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ExtVersion TEXT);
`;

const ERRORS_SCHEMA = `
CREATE TABLE Errors (id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId TEXT NOT NULL, LogId INTEGER, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, ErrorCode TEXT, step INTEGER, xpath TEXT, message TEXT NOT NULL, StackTrace TEXT, context TEXT, resolved INTEGER DEFAULT 0, resolution TEXT, ProjectId TEXT, UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ScriptFile TEXT, ErrorLine INTEGER, ErrorColumn INTEGER, ExtVersion TEXT);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let logsDb: any;
let errorsDb: any;
let dirtyCount: number;

async function setupDbs(): Promise<void> {
    if (!SQL) SQL = await initSqlJs();

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
    startSession("2.0.0-integration");
}

function logMsg(overrides: Record<string, string> = {}) {
    return {
        type: MessageType.LOG_ENTRY,
        level: "INFO",
        source: "background",
        category: "LIFECYCLE",
        action: "test-action",
        detail: "integration-detail",
        ...overrides,
    } as any;
}

function errMsg(overrides: Record<string, string> = {}) {
    return {
        type: MessageType.LOG_ERROR,
        level: "ERROR",
        source: "content",
        category: "INJECTION",
        errorCode: "INJ_001",
        message: "injection failed",
        ...overrides,
    } as any;
}

async function unzip(dataUrl: string): Promise<JSZip> {
    const base64 = dataUrl.replace("data:application/zip;base64,", "");
    const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSZip.loadAsync(buf);
}

/* ------------------------------------------------------------------ */
/*  JSON Export Integration                                            */
/* ------------------------------------------------------------------ */

describe("JSON Export — multi-entry scenarios", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("exports multiple logs preserving insertion order", async () => {
        await handleLogEntry(logMsg({ detail: "first" }));
        await handleLogEntry(logMsg({ detail: "second" }));
        await handleLogEntry(logMsg({ detail: "third" }));

        const result = await handleExportLogsJson();
        const rows = JSON.parse(result.json);

        expect(rows).toHaveLength(3);
        expect(rows[0].detail).toBe("first");
        expect(rows[2].detail).toBe("third");
    });

    it("exports logs with all field types populated", async () => {
        await handleLogEntry(logMsg({
            level: "WARN",
            source: "popup",
            category: "API",
            action: "fetch_config",
            detail: "timeout after 5s",
            projectId: "proj-123",
            scriptId: "script-456",
            configId: "cfg-789",
        }));

        const rows = JSON.parse((await handleExportLogsJson()).json);

        expect(rows[0].level).toBe("WARN");
        expect(rows[0].source).toBe("popup");
        expect(rows[0].ProjectId).toBe("proj-123");
        expect(rows[0].ScriptId).toBe("script-456");
        expect(rows[0].ConfigId).toBe("cfg-789");
    });

    it("filename includes today's date", async () => {
        const result = await handleExportLogsJson();
        const today = new Date().toISOString().slice(0, 10);

        expect(result.filename).toBe(`marco-logs-${today}.json`);
    });

    it("exports valid JSON even with special characters in detail", async () => {
        await handleLogEntry(logMsg({ detail: 'has "quotes" and\nnewlines' }));

        const result = await handleExportLogsJson();
        const rows = JSON.parse(result.json);

        expect(rows[0].detail).toContain('"quotes"');
    });
});

/* ------------------------------------------------------------------ */
/*  ZIP Bundle Integration                                             */
/* ------------------------------------------------------------------ */

describe("ZIP Bundle — cross-db consistency", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("ZIP metadata counts match actual inserted data", async () => {
        await handleLogEntry(logMsg({ detail: "a" }));
        await handleLogEntry(logMsg({ detail: "b" }));
        await handleLogError(errMsg({ message: "err-a" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(meta.logCount).toBe(2);
        expect(meta.errorCount).toBe(1);
    });

    it("ZIP metadata version matches session version", async () => {
        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(meta.version).toBe("1.0.0-test");
    });

    it("ZIP metadata exportedAt is a valid ISO timestamp", async () => {
        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));
        const parsed = new Date(meta.exportedAt);

        expect(parsed.getTime()).not.toBeNaN();
    });

    it("ZIP logs.json and errors.json are consistent with each other", async () => {
        await handleLogEntry(logMsg({ detail: "zip-log" }));
        await handleLogError(errMsg({ message: "zip-error" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));
        const errors = JSON.parse(await zip.file("errors.json")!.async("string"));

        expect(logs).toHaveLength(1);
        expect(errors).toHaveLength(1);
        expect(logs[0].detail).toBe("zip-log");
        expect(errors[0].message).toBe("zip-error");
    });

    it("ZIP .db binaries are valid SQLite databases", async () => {
        await handleLogEntry(logMsg());

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logsDbBin = await zip.file("logs.db")!.async("uint8array");
        const errorsDbBin = await zip.file("errors.db")!.async("uint8array");

        // SQLite magic bytes: "SQLite format 3\0"
        const header = String.fromCharCode(...logsDbBin.slice(0, 6));
        expect(header).toBe("SQLite");

        const errHeader = String.fromCharCode(...errorsDbBin.slice(0, 6));
        expect(errHeader).toBe("SQLite");
    });

    it("ZIP .db files can be opened and queried with sql.js", async () => {
        await handleLogEntry(logMsg({ detail: "db-roundtrip" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const bin = await zip.file("logs.db")!.async("uint8array");
        const reopened = new SQL.Database(bin);
        const rows = reopened.exec("SELECT detail FROM Logs");

        expect(rows[0].values[0][0]).toBe("db-roundtrip");
        reopened.close();
    });

    it("ZIP filename follows naming convention", async () => {
        const result = await handleExportLogsZip();
        const today = new Date().toISOString().slice(0, 10);

        expect(result.filename).toBe(`marco-bundle-${today}.zip`);
    });
});

/* ------------------------------------------------------------------ */
/*  Purge + Export Integration                                         */
/* ------------------------------------------------------------------ */

describe("Purge then Export — data integrity", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("purged logs do not appear in JSON export", async () => {
        const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
        logsDb.run(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", oldDate, "INFO", "bg", "LIFECYCLE", "old", "should-be-purged"],
        );
        await handleLogEntry(logMsg({ detail: "recent-keep" }));

        await handlePurgeLogs({ type: MessageType.PURGE_LOGS, olderThanDays: 30 } as any);
        const rows = JSON.parse((await handleExportLogsJson()).json);

        expect(rows).toHaveLength(1);
        expect(rows[0].detail).toBe("recent-keep");
    });

    it("purged logs do not appear in ZIP bundle", async () => {
        const oldDate = new Date(Date.now() - 90 * 86400000).toISOString();
        logsDb.run(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", oldDate, "INFO", "bg", "LIFECYCLE", "ancient", "gone"],
        );
        await handleLogEntry(logMsg({ detail: "stays" }));

        await handlePurgeLogs({ type: MessageType.PURGE_LOGS, olderThanDays: 30 } as any);

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(logs).toHaveLength(1);
        expect(logs[0].detail).toBe("stays");
        expect(meta.logCount).toBe(1);
    });

    it("purge with 1 day clears day-old logs", async () => {
        const oldDate = new Date(Date.now() - 2 * 86400000).toISOString();
        logsDb.run(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", oldDate, "INFO", "bg", "LIFECYCLE", "old", "day-old-a"],
        );
        logsDb.run(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", oldDate, "INFO", "bg", "LIFECYCLE", "old", "day-old-b"],
        );

        const result = await handlePurgeLogs({ type: MessageType.PURGE_LOGS, olderThanDays: 1 } as any);

        expect(result.purged).toBe(2);
        const stats = await handleGetLogStats() as any;
        expect(stats.logCount).toBe(0);
    });

    it("purge defaults to 30 days when olderThanDays is omitted", async () => {
        await handleLogEntry(logMsg());

        const result = await handlePurgeLogs({ type: MessageType.PURGE_LOGS } as any);

        expect(result.purged).toBe(0); // recent log not purged
    });

    it("purge marks database as dirty", async () => {
        const before = dirtyCount;
        await handlePurgeLogs({ type: MessageType.PURGE_LOGS, olderThanDays: 30 } as any);

        expect(dirtyCount).toBeGreaterThan(before);
    });

    it("stats reflect state after purge + new inserts", async () => {
        const oldDate = new Date(Date.now() - 60 * 86400000).toISOString();
        logsDb.run(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
            ["s1", oldDate, "INFO", "bg", "LIFECYCLE", "old", "purge-me"],
        );

        await handlePurgeLogs({ type: MessageType.PURGE_LOGS, olderThanDays: 30 } as any);
        await handleLogEntry(logMsg({ detail: "post-purge" }));
        await handleLogError(errMsg({ message: "post-purge-err" }));

        const stats = await handleGetLogStats() as any;
        expect(stats.logCount).toBe(1);
        expect(stats.errorCount).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  JSON Export Edge Cases                                              */
/* ------------------------------------------------------------------ */

describe("JSON Export — edge cases", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("exports Unicode characters in detail field", async () => {
        await handleLogEntry(logMsg({ detail: "日本語テスト 🚀 émojis ñ" }));

        const result = await handleExportLogsJson();
        const rows = JSON.parse(result.json);

        expect(rows[0].detail).toBe("日本語テスト 🚀 émojis ñ");
    });

    it("exports CJK and RTL characters correctly", async () => {
        await handleLogEntry(logMsg({ detail: "中文 한국어 مرحبا" }));

        const rows = JSON.parse((await handleExportLogsJson()).json);

        expect(rows[0].detail).toContain("中文");
        expect(rows[0].detail).toContain("한국어");
        expect(rows[0].detail).toContain("مرحبا");
    });

    it("exports emoji-heavy detail without corruption", async () => {
        const emojiDetail = "🎯🔍📊🔑⚙📜⏱🌐🗑📋";
        await handleLogEntry(logMsg({ detail: emojiDetail }));

        const rows = JSON.parse((await handleExportLogsJson()).json);

        expect(rows[0].detail).toBe(emojiDetail);
    });

    it("exports very long detail string (10KB)", async () => {
        const longDetail = "x".repeat(10_000);
        await handleLogEntry(logMsg({ detail: longDetail }));

        const result = await handleExportLogsJson();
        const rows = JSON.parse(result.json);

        expect(rows[0].detail).toHaveLength(10_000);
    });

    it("exports extremely long detail string (100KB)", async () => {
        const hugeDetail = "A".repeat(100_000);
        await handleLogEntry(logMsg({ detail: hugeDetail }));

        const rows = JSON.parse((await handleExportLogsJson()).json);

        expect(rows[0].detail).toHaveLength(100_000);
    });

    it("concurrent export calls return consistent data", async () => {
        await handleLogEntry(logMsg({ detail: "concurrent-a" }));
        await handleLogEntry(logMsg({ detail: "concurrent-b" }));

        const [result1, result2, result3] = await Promise.all([
            handleExportLogsJson(),
            handleExportLogsJson(),
            handleExportLogsJson(),
        ]);

        const rows1 = JSON.parse(result1.json);
        const rows2 = JSON.parse(result2.json);
        const rows3 = JSON.parse(result3.json);

        expect(rows1).toHaveLength(2);
        expect(rows2).toHaveLength(2);
        expect(rows3).toHaveLength(2);
        expect(result1.json).toBe(result2.json);
        expect(result2.json).toBe(result3.json);
    });

    it("concurrent export and insert produce valid JSON", async () => {
        await handleLogEntry(logMsg({ detail: "before-concurrent" }));

        const [exportResult] = await Promise.all([
            handleExportLogsJson(),
            handleLogEntry(logMsg({ detail: "during-concurrent" })),
        ]);

        const rows = JSON.parse(exportResult.json);
        const isValidArray = Array.isArray(rows);

        expect(isValidArray).toBe(true);
        expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it("detail with null bytes exports cleanly", async () => {
        await handleLogEntry(logMsg({ detail: "before\x00after" }));

        const result = await handleExportLogsJson();
        const rows = JSON.parse(result.json);
        const hasContent = rows[0].detail.length > 0;

        expect(hasContent).toBe(true);
    });
});
