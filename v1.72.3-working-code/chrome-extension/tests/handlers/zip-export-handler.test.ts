/**
 * Unit tests — ZIP Export Handler
 *
 * Verifies the ZIP bundle contains logs.json, errors.json,
 * metadata.json, and both .db binary files.
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
} = await import("../../src/background/handlers/logging-handler");

const {
    handleExportLogsZip,
} = await import("../../src/background/handlers/logging-export-handler");

/* ------------------------------------------------------------------ */
/*  DB Setup                                                           */
/* ------------------------------------------------------------------ */

const LOGS_SCHEMA = `
CREATE TABLE Sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, StartedAt TEXT NOT NULL, EndedAt TEXT, version TEXT NOT NULL, UserAgent TEXT, notes TEXT);
CREATE TABLE Logs (id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId INTEGER NOT NULL, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, action TEXT NOT NULL, LogType TEXT, indent INTEGER DEFAULT 0, detail TEXT, metadata TEXT, DurationMs INTEGER, ProjectId TEXT, UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ExtVersion TEXT);
`;

const ERRORS_SCHEMA = `
CREATE TABLE Errors (id INTEGER PRIMARY KEY AUTOINCREMENT, SessionId INTEGER NOT NULL, LogId INTEGER, timestamp TEXT NOT NULL, level TEXT NOT NULL, source TEXT NOT NULL, category TEXT NOT NULL, ErrorCode TEXT, step INTEGER, xpath TEXT, message TEXT NOT NULL, StackTrace TEXT, context TEXT, resolved INTEGER DEFAULT 0, resolution TEXT, ProjectId TEXT, UrlRuleId TEXT, ScriptId TEXT, ConfigId TEXT, ScriptFile TEXT, ErrorLine INTEGER, ErrorColumn INTEGER, ExtVersion TEXT);
`;

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function setupDbs(): Promise<void> {
    if (!SQL) {
        SQL = await initSqlJs();
    }

    const logsDb = new SQL.Database();
    logsDb.run(LOGS_SCHEMA);

    const errorsDb = new SQL.Database();
    errorsDb.run(ERRORS_SCHEMA);

    const manager: DbManager = {
        getLogsDb: () => logsDb,
        getErrorsDb: () => errorsDb,
        getPersistenceMode: () => "memory",
        flushIfDirty: async () => {},
        markDirty: () => {},
    };

    bindDbManager(manager);
    startSession("1.0.0-test");
}

/** Extracts a ZIP from a base64 data URL. */
async function unzipFromDataUrl(dataUrl: string): Promise<JSZip> {
    const base64 = dataUrl.replace("data:application/zip;base64,", "");
    const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return JSZip.loadAsync(buffer);
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("handleExportLogsZip", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("returns a valid data URL and filename", async () => {
        const result = await handleExportLogsZip();

        expect(result.dataUrl).not.toBeNull();
        expect(result.dataUrl).toContain("data:application/zip;base64,");
        expect(result.filename).toMatch(/^marco-bundle-\d{4}-\d{2}-\d{2}\.zip$/);
    });

    it("ZIP contains all 5 expected files", async () => {
        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const filenames = Object.keys(zip.files);

        expect(filenames).toContain("logs.json");
        expect(filenames).toContain("errors.json");
        expect(filenames).toContain("metadata.json");
        expect(filenames).toContain("logs.db");
        expect(filenames).toContain("errors.db");
        expect(filenames).toHaveLength(5);
    });

    it("logs.json contains valid JSON array", async () => {
        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const content = await zip.file("logs.json")!.async("string");
        const parsed = JSON.parse(content);

        expect(Array.isArray(parsed)).toBe(true);
    });

    it("errors.json contains valid JSON array", async () => {
        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const content = await zip.file("errors.json")!.async("string");
        const parsed = JSON.parse(content);

        expect(Array.isArray(parsed)).toBe(true);
    });

    it("metadata.json contains version and counts", async () => {
        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const content = await zip.file("metadata.json")!.async("string");
        const meta = JSON.parse(content);

        expect(meta).toHaveProperty("exportedAt");
        expect(meta).toHaveProperty("version", "1.0.0-test");
        expect(meta).toHaveProperty("logCount");
        expect(meta).toHaveProperty("errorCount");
    });

    it("logs.db binary is non-empty", async () => {
        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const binary = await zip.file("logs.db")!.async("uint8array");

        expect(binary.length).toBeGreaterThan(0);
    });

    it("errors.db binary is non-empty", async () => {
        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const binary = await zip.file("errors.db")!.async("uint8array");

        expect(binary.length).toBeGreaterThan(0);
    });

    it("logs.json includes seeded log entries", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "LIFECYCLE",
            action: "test-action",
            detail: "zip-test-detail",
        } as any);

        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const content = await zip.file("logs.json")!.async("string");
        const rows = JSON.parse(content);

        const hasTestRow = rows.some((r: any) => r.detail === "zip-test-detail");
        expect(hasTestRow).toBe(true);
    });

    it("errors.json includes seeded error entries", async () => {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "content",
            category: "INJECTION",
            errorCode: "ZIP_TEST",
            message: "zip-error-test",
        } as any);

        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const content = await zip.file("errors.json")!.async("string");
        const rows = JSON.parse(content);

        const hasTestRow = rows.some((r: any) => r.message === "zip-error-test");
        expect(hasTestRow).toBe(true);
    });

    it("metadata counts reflect seeded data", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "LIFECYCLE",
            action: "count-test",
            detail: "one",
        } as any);
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "LIFECYCLE",
            action: "count-test",
            detail: "two",
        } as any);

        const result = await handleExportLogsZip();
        const zip = await unzipFromDataUrl(result.dataUrl!);
        const meta = JSON.parse(await zip.file("metadata.json")!.async("string"));

        expect(meta.logCount).toBe(2);
        expect(meta.errorCount).toBe(0);
    });
});
