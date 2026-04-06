/**
 * Edge-case tests — ZIP Export
 *
 * Covers empty databases, large row counts, and JSZip failure handling.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
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
} = await import("../../src/background/handlers/logging-handler");

const {
    handleExportLogsZip,
    handleExportLogsJson,
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

async function setupDbs(): Promise<void> {
    if (SQL === undefined) {
        SQL = await initSqlJs();
    }

    logsDb = new SQL.Database();
    logsDb.run(LOGS_SCHEMA);
    errorsDb = new SQL.Database();
    errorsDb.run(ERRORS_SCHEMA);

    const manager: DbManager = {
        getLogsDb: () => logsDb,
        getErrorsDb: () => errorsDb,
        getPersistenceMode: () => "memory",
        flushIfDirty: async () => {},
        markDirty: () => {},
    };

    bindDbManager(manager);
    startSession("1.0.0-edge");
}

function logMsg(overrides: Record<string, string> = {}): any {
    return {
        type: MessageType.LOG_ENTRY,
        level: "INFO",
        source: "background",
        category: "LIFECYCLE",
        action: "test",
        detail: "edge-detail",
        ...overrides,
    };
}

function errMsg(overrides: Record<string, string> = {}): any {
    return {
        type: MessageType.LOG_ERROR,
        level: "ERROR",
        source: "content",
        category: "INJECTION",
        errorCode: "INJ_001",
        message: "edge-error",
        ...overrides,
    };
}

async function unzip(dataUrl: string): Promise<JSZip> {
    const base64 = dataUrl.replace("data:application/zip;base64,", "");
    const buf = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSZip.loadAsync(buf);
}

/* ------------------------------------------------------------------ */
/*  Empty Databases                                                    */
/* ------------------------------------------------------------------ */

describe("ZIP Edge — Empty databases", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("produces a valid ZIP with zero logs and zero errors", async () => {
        const result = await handleExportLogsZip();
        const hasDataUrl = result.dataUrl !== null;

        expect(hasDataUrl).toBe(true);

        const zip = await unzip(result.dataUrl!);
        const files = Object.keys(zip.files);

        expect(files).toContain("logs.json");
        expect(files).toContain("errors.json");
        expect(files).toContain("logs.db");
        expect(files).toContain("errors.db");
        expect(files).toContain("metadata.json");
    });

    it("logs.json is an empty array when no logs exist", async () => {
        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));

        expect(logs).toEqual([]);
    });

    it("errors.json is an empty array when no errors exist", async () => {
        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const errors = JSON.parse(await zip.file("errors.json")!.async("string"));

        expect(errors).toEqual([]);
    });

    it("metadata shows zero counts for empty databases", async () => {
        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(meta.logCount).toBe(0);
        expect(meta.errorCount).toBe(0);
    });

    it("empty .db binaries are still valid SQLite files", async () => {
        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logsDbBin = await zip.file("logs.db")!.async("uint8array");
        const reopened = new SQL.Database(logsDbBin);
        const result = reopened.exec("SELECT COUNT(*) FROM Logs");

        expect(result[0].values[0][0]).toBe(0);
        reopened.close();
    });

    it("JSON export returns empty array for empty database", async () => {
        const result = await handleExportLogsJson();
        const rows = JSON.parse(result.json);

        expect(rows).toEqual([]);
    });
});

/* ------------------------------------------------------------------ */
/*  Large Row Counts                                                   */
/* ------------------------------------------------------------------ */

describe("ZIP Edge — Large row counts", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("handles 500 log entries in a single ZIP", async () => {
        const insertStmt = logsDb.prepare(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 500; i++) {
            insertStmt.run([
                "s1",
                new Date().toISOString(),
                "INFO",
                "bg",
                "LIFECYCLE",
                "bulk",
                `row-${i}`,
            ]);
        }
        insertStmt.free();

        const result = await handleExportLogsZip();
        const hasDataUrl = result.dataUrl !== null;

        expect(hasDataUrl).toBe(true);

        const zip = await unzip(result.dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(logs).toHaveLength(500);
        expect(meta.logCount).toBe(500);
    });

    it("handles 200 error entries in a single ZIP", async () => {
        const insertStmt = errorsDb.prepare(
            "INSERT INTO Errors (SessionId, timestamp, level, source, category, ErrorCode, message) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 200; i++) {
            insertStmt.run([
                "s1",
                new Date().toISOString(),
                "ERROR",
                "content",
                "INJECTION",
                "INJ_001",
                `error-${i}`,
            ]);
        }
        insertStmt.free();

        const result = await handleExportLogsZip();
        const zip = await unzip(result.dataUrl!);
        const errors = JSON.parse(await zip.file("errors.json")!.async("string"));
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(errors).toHaveLength(200);
        expect(meta.errorCount).toBe(200);
    });

    it("preserves insertion order in large exports", async () => {
        const insertStmt = logsDb.prepare(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 100; i++) {
            insertStmt.run([
                "s1",
                new Date(Date.now() + i * 1000).toISOString(),
                "INFO",
                "bg",
                "LIFECYCLE",
                "ordered",
                `seq-${i}`,
            ]);
        }
        insertStmt.free();

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));

        expect(logs[0].detail).toBe("seq-0");
        expect(logs[99].detail).toBe("seq-99");
    });

    it("large .db binary round-trips through ZIP correctly", async () => {
        const insertStmt = logsDb.prepare(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 300; i++) {
            insertStmt.run(["s1", new Date().toISOString(), "INFO", "bg", "LIFECYCLE", "rt", `roundtrip-${i}`]);
        }
        insertStmt.free();

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const bin = await zip.file("logs.db")!.async("uint8array");
        const reopened = new SQL.Database(bin);
        const result = reopened.exec("SELECT COUNT(*) FROM Logs");

        expect(result[0].values[0][0]).toBe(300);
        reopened.close();
    });
});

/* ------------------------------------------------------------------ */
/*  JSZip Failure Handling                                             */
/* ------------------------------------------------------------------ */

describe("ZIP Edge — JSZip failure handling", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns null dataUrl when JSZip generateAsync throws", async () => {
        const originalExport = logsDb.export.bind(logsDb);
        logsDb.export = () => {
            throw new Error("Simulated db.export failure");
        };

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await handleExportLogsZip();

        expect(result.dataUrl).toBeNull();
        expect(result.filename).toContain("marco-bundle-");
        expect(result.filename).toContain(".zip");

        consoleSpy.mockRestore();
        logsDb.export = originalExport;
    });

    it("logs error message when ZIP export fails", async () => {
        const originalExport = logsDb.export.bind(logsDb);
        logsDb.export = () => {
            throw new Error("Export disk full");
        };

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        await handleExportLogsZip();

        const hasErrorLog = consoleSpy.mock.calls.some(
            (call) => String(call[0]).includes("ZIP export failed"),
        );

        expect(hasErrorLog).toBe(true);

        consoleSpy.mockRestore();
        logsDb.export = originalExport;
    });

    it("returns valid filename even on failure", async () => {
        const originalExport = errorsDb.export.bind(errorsDb);
        errorsDb.export = () => {
            throw new Error("Corruption");
        };

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await handleExportLogsZip();
        const today = new Date().toISOString().slice(0, 10);

        expect(result.filename).toBe(`marco-bundle-${today}.zip`);

        consoleSpy.mockRestore();
        errorsDb.export = originalExport;
    });

    it("does not throw — failure is caught gracefully", async () => {
        const originalExport = logsDb.export.bind(logsDb);
        logsDb.export = () => {
            throw new TypeError("Cannot read properties of undefined");
        };

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(handleExportLogsZip()).resolves.toBeDefined();

        consoleSpy.mockRestore();
        logsDb.export = originalExport;
    });

    it("handles non-Error thrown values", async () => {
        const originalExport = logsDb.export.bind(logsDb);
        logsDb.export = () => {
            throw "string-error-value";
        };

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const result = await handleExportLogsZip();

        expect(result.dataUrl).toBeNull();

        const hasErrorLog = consoleSpy.mock.calls.some(
            (call) => String(call[0]).includes("string-error-value"),
        );

        expect(hasErrorLog).toBe(true);

        consoleSpy.mockRestore();
        logsDb.export = originalExport;
    });
});

/* ------------------------------------------------------------------ */
/*  Unicode Content in Database                                        */
/* ------------------------------------------------------------------ */

describe("ZIP Edge — Unicode content", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("preserves Unicode detail in logs.json inside ZIP", async () => {
        await handleLogEntry(logMsg({ detail: "日本語テスト 🚀 émojis ñ" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));

        expect(logs[0].detail).toBe("日本語テスト 🚀 émojis ñ");
    });

    it("preserves CJK and RTL in error messages inside ZIP", async () => {
        await handleLogError(errMsg({ message: "中文错误 한국어 مرحبا" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const errors = JSON.parse(await zip.file("errors.json")!.async("string"));

        expect(errors[0].message).toContain("中文错误");
        expect(errors[0].message).toContain("한국어");
        expect(errors[0].message).toContain("مرحبا");
    });

    it("preserves emoji-heavy content through ZIP round-trip", async () => {
        const emojiDetail = "🎯🔍📊🔑⚙📜⏱🌐🗑📋✅❌⬚";
        await handleLogEntry(logMsg({ detail: emojiDetail }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));

        expect(logs[0].detail).toBe(emojiDetail);
    });

    it("preserves Unicode in .db binary round-trip", async () => {
        await handleLogEntry(logMsg({ detail: "données spéciales: àéîõü" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const bin = await zip.file("logs.db")!.async("uint8array");
        const reopened = new SQL.Database(bin);
        const rows = reopened.exec("SELECT detail FROM Logs");

        expect(rows[0].values[0][0]).toBe("données spéciales: àéîõü");
        reopened.close();
    });

    it("handles null bytes in detail through ZIP", async () => {
        await handleLogEntry(logMsg({ detail: "before\x00after" }));

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const logs = JSON.parse(await zip.file("logs.json")!.async("string"));
        const hasContent = logs[0].detail.length > 0;

        expect(hasContent).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Large Database Binaries                                            */
/* ------------------------------------------------------------------ */

describe("ZIP Edge — Large database binaries", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("handles 1000 logs with long detail strings", async () => {
        const longDetail = "X".repeat(2000);
        const insertStmt = logsDb.prepare(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 1000; i++) {
            insertStmt.run(["s1", new Date().toISOString(), "INFO", "bg", "LIFECYCLE", "bulk", longDetail]);
        }
        insertStmt.free();

        const result = await handleExportLogsZip();
        const hasDataUrl = result.dataUrl !== null;

        expect(hasDataUrl).toBe(true);

        const zip = await unzip(result.dataUrl!);
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(meta.logCount).toBe(1000);
    });

    it("large .db binary survives ZIP compression and decompression", async () => {
        const bigPayload = "Y".repeat(5000);
        const insertStmt = logsDb.prepare(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 500; i++) {
            insertStmt.run(["s1", new Date().toISOString(), "INFO", "bg", "LIFECYCLE", "big", bigPayload]);
        }
        insertStmt.free();

        const zip = await unzip((await handleExportLogsZip()).dataUrl!);
        const bin = await zip.file("logs.db")!.async("uint8array");
        const reopened = new SQL.Database(bin);
        const result = reopened.exec("SELECT COUNT(*) FROM Logs");

        expect(result[0].values[0][0]).toBe(500);
        reopened.close();
    });

    it("concurrent ZIP exports with large data produce valid results", async () => {
        const insertStmt = logsDb.prepare(
            "INSERT INTO Logs (SessionId, timestamp, level, source, category, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
        );

        for (let i = 0; i < 200; i++) {
            insertStmt.run(["s1", new Date().toISOString(), "INFO", "bg", "LIFECYCLE", "concurrent", `row-${i}`]);
        }
        insertStmt.free();

        const [result1, result2] = await Promise.all([
            handleExportLogsZip(),
            handleExportLogsZip(),
        ]);

        const hasFirst = result1.dataUrl !== null;
        const hasSecond = result2.dataUrl !== null;

        expect(hasFirst).toBe(true);
        expect(hasSecond).toBe(true);

        const zip1 = await unzip(result1.dataUrl!);
        const zip2 = await unzip(result2.dataUrl!);
        const meta1 = JSON.parse(await zip1.file("metadata.json")!.async("string"));
        const meta2 = JSON.parse(await zip2.file("metadata.json")!.async("string"));

        expect(meta1.logCount).toBe(200);
        expect(meta2.logCount).toBe(200);
    });
});
