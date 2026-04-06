/**
 * Unit tests — Injection Handler
 *
 * Tests INJECT_SCRIPTS and GET_TAB_INJECTIONS against
 * mock chrome.scripting and state-manager.
 */

import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs from "sql.js";
import type { DbManager } from "../../../src/background/db-manager";
import {
    installChromeMock,
    resetMockStorage,
    getScriptingCalls,
    getCssCalls,
    setMockTabs,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    bindDbManager,
    startSession,
} = await import("../../src/background/handlers/logging-handler");

const {
    handleInjectScripts,
    handleGetTabInjections,
} = await import("../../src/background/handlers/injection-handler");

/* ------------------------------------------------------------------ */
/*  DB Setup for logging                                               */
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

async function setupLoggingDb(): Promise<void> {
    if (SQL === undefined) {
        SQL = await initSqlJs();
    }
    logsDb = new SQL.Database();
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
    startSession("1.0.0-injection-handler-test");
}

/** Queries injection log rows from the in-memory DB. */
function queryInjectionLogs(): Array<Record<string, unknown>> {
    const stmt = logsDb.prepare("SELECT * FROM Logs WHERE category = 'INJECTION'");
    const rows: Array<Record<string, unknown>> = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Builds a minimal inject message. */
function buildInjectMsg(tabId: number, scripts: unknown[]) {
    return {
        type: "INJECT_SCRIPTS",
        tabId,
        scripts,
    } as any;
}

/** Builds a minimal script entry. */
function buildScript(id: string, code: string, order: number) {
    return {
        id,
        code,
        order,
    };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Injection Handler — INJECT_SCRIPTS", () => {
    beforeEach(async () => {
        resetMockStorage();
        installChromeMock();
        setMockTabs([{ id: 100 }]);
        await setupLoggingDb();
    });

    it("returns results for each injected script", async () => {
        const scripts = [
            buildScript("s1", "console.log('hello')", 1),
            buildScript("s2", "console.log('world')", 2),
        ];

        const result = await handleInjectScripts(buildInjectMsg(100, scripts));

        expect(result.results).toHaveLength(2);
        expect(result.results[0].scriptId).toBe("s1");
        expect(result.results[1].scriptId).toBe("s2");
    });

    it("injects scripts in order", async () => {
        const scripts = [
            buildScript("s-third", "c", 3),
            buildScript("s-first", "a", 1),
            buildScript("s-second", "b", 2),
        ];

        const result = await handleInjectScripts(buildInjectMsg(100, scripts));

        expect(result.results[0].scriptId).toBe("s-first");
        expect(result.results[1].scriptId).toBe("s-second");
        expect(result.results[2].scriptId).toBe("s-third");
    });

    it("records injection duration", async () => {
        const scripts = [buildScript("s1", "1+1", 1)];

        const result = await handleInjectScripts(buildInjectMsg(100, scripts));

        expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("injects CSS before JS when script has assets.css", async () => {
        const scripts = [{
            id: "css-script",
            code: "console.log('with-css')",
            order: 1,
            assets: { css: "macro-looping.css" },
        }];

        await handleInjectScripts(buildInjectMsg(100, scripts));

        const css = getCssCalls();
        expect(css.length).toBeGreaterThanOrEqual(1);
        expect(css[0].tabId).toBe(100);
        expect(css[0].files).toContain("projects/scripts/macro-looping.css");
    });

    it("skips CSS injection when no assets.css", async () => {
        const scripts = [buildScript("no-css", "1+1", 1)];

        await handleInjectScripts(buildInjectMsg(100, scripts));

        const css = getCssCalls();
        expect(css).toHaveLength(0);
    });

    it("mirrors skipped-script diagnostics into the active tab console", async () => {
        const projectEntries = [{ path: "missing.js", order: 1 }];

        const result = await handleInjectScripts(buildInjectMsg(100, projectEntries));

        expect(result.results).toHaveLength(1);
        expect(result.results[0].skipReason).toBe("missing");

        const calls = getScriptingCalls();
        expect(calls.length).toBeGreaterThanOrEqual(1);
        // Find the diagnostic call that mentions the skipped script
        const diagCall = calls.find(
            (c) => c.tabId === 100 && String(c.args?.[0] ?? "").includes("missing.js"),
        );
        expect(diagCall).toBeDefined();
        expect(String(diagCall!.args?.[0] ?? "")).toContain("skipped during manual run");
    });

    it("writes injection success to the logs DB", async () => {
        const scripts = [{ id: "db-log-test", code: "1+1", order: 1, name: "DB Log Test" }];

        await handleInjectScripts(buildInjectMsg(100, scripts));

        // logInjectionSuccess is fire-and-forget; give it a tick to settle
        await new Promise((r) => setTimeout(r, 50));

        const rows = queryInjectionLogs();
        const successRow = rows.find(
            (r) => r.action === "SCRIPT_INJECTED" && r.ScriptId === "db-log-test",
        );

        expect(successRow).toBeDefined();
        expect(successRow!.level).toBe("INFO");
        expect(successRow!.category).toBe("INJECTION");
    });
});

describe("Injection Handler — GET_TAB_INJECTIONS", () => {
    beforeEach(async () => {
        resetMockStorage();
        installChromeMock();
        setMockTabs([{ id: 200 }]);
        await setupLoggingDb();
    });

    it("returns empty when no injections recorded", async () => {
        const result = await handleGetTabInjections({
            type: "GET_TAB_INJECTIONS",
            tabId: 999,
        } as any);

        expect(result.injections[999]).toBeNull();
    });

    it("returns injection record after injecting scripts", async () => {
        const scripts = [buildScript("s1", "a", 1)];
        await handleInjectScripts(buildInjectMsg(200, scripts));

        const result = await handleGetTabInjections({
            type: "GET_TAB_INJECTIONS",
            tabId: 200,
        } as any);

        const record = result.injections[200] as any;

        expect(record).toBeDefined();
        expect(record.scriptIds).toContain("s1");
    });
});
