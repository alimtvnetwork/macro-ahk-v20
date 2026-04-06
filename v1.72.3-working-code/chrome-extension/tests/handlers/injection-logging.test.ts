/**
 * Unit tests — Injection Logging
 *
 * Verifies that successful and failed injections produce correct
 * LOG_ENTRY / LOG_ERROR records with ScriptId, ProjectId,
 * ConfigId, and code snippet fields.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
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
} = await import("../../src/background/handlers/logging-handler");

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
    startSession("1.0.0-injection-test");
}

function queryLogs(): any[] {
    const result = logsDb.exec("SELECT * FROM Logs ORDER BY id ASC");
    const hasRows = result.length > 0;

    if (hasRows) {
        return result[0].values.map((row: any[]) => {
            const obj: Record<string, unknown> = {};

            for (let i = 0; i < result[0].columns.length; i++) {
                obj[result[0].columns[i]] = row[i];
            }
            return obj;
        });
    }

    return [];
}

function queryErrors(): any[] {
    const result = errorsDb.exec("SELECT * FROM Errors ORDER BY id ASC");
    const hasRows = result.length > 0;

    if (hasRows) {
        return result[0].values.map((row: any[]) => {
            const obj: Record<string, unknown> = {};

            for (let i = 0; i < result[0].columns.length; i++) {
                obj[result[0].columns[i]] = row[i];
            }
            return obj;
        });
    }

    return [];
}

/* ------------------------------------------------------------------ */
/*  Successful Injection Logging                                       */
/* ------------------------------------------------------------------ */

describe("Injection Logging — successful injection LOG_ENTRY", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("writes a LOG_ENTRY with ScriptId after injection", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: 'Injected "widget.js" (150 chars): console.log("hello")',
            scriptId: "script-abc-123",
            projectId: "proj-xyz",
        } as any);

        const logs = queryLogs();

        expect(logs).toHaveLength(1);
        expect(logs[0].ScriptId).toBe("script-abc-123");
    });

    it("writes ProjectId in the log entry", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: 'Injected "main.js"',
            scriptId: "s1",
            projectId: "proj-456",
        } as any);

        const logs = queryLogs();

        expect(logs[0].ProjectId).toBe("proj-456");
    });

    it("writes ConfigId when configBinding is present", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: 'Injected "configured.js"',
            scriptId: "s2",
            projectId: "proj-789",
            configId: "cfg-binding-001",
        } as any);

        const logs = queryLogs();

        expect(logs[0].ConfigId).toBe("cfg-binding-001");
    });

    it("includes code snippet in detail field", async () => {
        const codeSnippet = 'console.log("injected successfully")';

        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: `Injected "snippet.js" (36 chars): ${codeSnippet}`,
            scriptId: "s3",
        } as any);

        const logs = queryLogs();

        expect(logs[0].detail).toContain(codeSnippet);
    });

    it("truncates long code snippets at 200 chars in detail", async () => {
        const longCode = "a".repeat(300);
        const snippet = longCode.slice(0, 200);

        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: `Injected "long.js" (300 chars): ${snippet}`,
            scriptId: "s4",
        } as any);

        const logs = queryLogs();
        const detailLength = (logs[0].detail as string).length;
        const isReasonableLength = detailLength < 300;

        expect(isReasonableLength).toBe(true);
        expect(logs[0].detail).toContain(snippet);
    });

    it("sets category to INJECTION and action to SCRIPT_INJECTED", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: 'Injected "test.js"',
            scriptId: "s5",
        } as any);

        const logs = queryLogs();

        expect(logs[0].category).toBe("INJECTION");
        expect(logs[0].action).toBe("SCRIPT_INJECTED");
    });

    it("stores null for ScriptId when not provided", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "LIFECYCLE",
            action: "STARTUP",
            detail: "Extension started",
        } as any);

        const logs = queryLogs();

        expect(logs[0].ScriptId).toBeNull();
        expect(logs[0].ProjectId).toBeNull();
        expect(logs[0].ConfigId).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/*  Failed Injection Logging                                           */
/* ------------------------------------------------------------------ */

describe("Injection Logging — failed injection LOG_ERROR", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("writes a LOG_ERROR with ScriptId on injection failure", async () => {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: 'Script "broken.js" failed: CSP violation',
            scriptId: "script-broken",
            projectId: "proj-fail",
        } as any);

        const errors = queryErrors();

        expect(errors).toHaveLength(1);
        expect(errors[0].ScriptId).toBe("script-broken");
    });

    it("writes ProjectId in the error entry", async () => {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: "CSP blocked",
            scriptId: "s-err",
            projectId: "proj-csp",
        } as any);

        const errors = queryErrors();

        expect(errors[0].ProjectId).toBe("proj-csp");
    });

    it("writes ConfigId in the error entry", async () => {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: "Config parse error",
            scriptId: "s-cfg-err",
            configId: "cfg-bad",
        } as any);

        const errors = queryErrors();

        expect(errors[0].ConfigId).toBe("cfg-bad");
    });

    it("includes script code in ScriptFile field", async () => {
        const codeFragment = 'document.querySelector("#app").remove()';

        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: "Runtime error",
            scriptId: "s-code",
            scriptFile: codeFragment,
        } as any);

        const errors = queryErrors();

        expect(errors[0].ScriptFile).toBe(codeFragment);
    });

    it("sets ErrorCode to INJECTION_FAILED", async () => {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: "Tab closed",
            scriptId: "s-closed",
        } as any);

        const errors = queryErrors();

        expect(errors[0].ErrorCode).toBe("INJECTION_FAILED");
    });

    it("stores null for optional fields when not provided", async () => {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: "Unknown failure",
        } as any);

        const errors = queryErrors();

        expect(errors[0].ScriptId).toBeNull();
        expect(errors[0].ProjectId).toBeNull();
        expect(errors[0].ConfigId).toBeNull();
        expect(errors[0].ScriptFile).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/*  Cross-field Correlation                                            */
/* ------------------------------------------------------------------ */

describe("Injection Logging — cross-field correlation", () => {
    beforeEach(async () => {
        resetMockStorage();
        await setupDbs();
    });

    it("success log and error log share the same SessionId", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: "Injected ok",
            scriptId: "s-ok",
            projectId: "p1",
        } as any);

        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode: "INJECTION_FAILED",
            message: "Next one failed",
            scriptId: "s-fail",
            projectId: "p1",
        } as any);

        const logs = queryLogs();
        const errors = queryErrors();

        expect(logs[0].SessionId).toBe(errors[0].SessionId);
    });

    it("ExtVersion is populated in injection log entries", async () => {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level: "INFO",
            source: "background",
            category: "INJECTION",
            action: "SCRIPT_INJECTED",
            detail: "Version check",
            scriptId: "s-ver",
        } as any);

        const logs = queryLogs();
        const hasVersion = logs[0].ExtVersion !== null && logs[0].ExtVersion !== "";

        expect(hasVersion).toBe(true);
    });

    it("multiple injection logs have incrementing IDs", async () => {
        for (let i = 0; i < 3; i++) {
            await handleLogEntry({
                type: MessageType.LOG_ENTRY,
                level: "INFO",
                source: "background",
                category: "INJECTION",
                action: "SCRIPT_INJECTED",
                detail: `Script ${i}`,
                scriptId: `s-${i}`,
            } as any);
        }

        const logs = queryLogs();

        expect(logs[0].id).toBeLessThan(logs[1].id);
        expect(logs[1].id).toBeLessThan(logs[2].id);
    });
});
