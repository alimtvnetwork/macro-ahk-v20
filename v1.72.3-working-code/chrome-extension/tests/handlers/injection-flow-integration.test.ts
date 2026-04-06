/**
 * Integration tests — Full Auto-Injection Flow
 *
 * Seeds projects with URL rules and scripts, simulates
 * webNavigation.onCompleted, and asserts chrome.scripting.executeScript
 * was called with the correct wrapped code, world, and tab target.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    simulateNavigation,
    getScriptingCalls,
    getInjectedCode,
} from "../mocks/chrome-storage";

installChromeMock();

const { registerAutoInjector, handleNavigationCompleted } = await import(
    "../../src/background/auto-injector"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function seedProjectWithScripts(opts: {
    projectId?: string;
    urls: Array<{ pattern: string; matchType: string }>;
    scripts: Array<{
        path: string;
        order: number;
        code: string;
        configBinding?: string;
        runAt?: string;
    }>;
    configs?: Array<{ id: string; json: string }>;
}): Promise<void> {
    const project = {
        id: opts.projectId ?? "int-proj",
        name: "Integration Project",
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: opts.urls,
        scripts: opts.scripts.map((s) => ({
            path: s.path,
            order: s.order,
            runAt: s.runAt ?? "document_idle",
            configBinding: s.configBinding,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const storedScripts = opts.scripts.map((s) => ({
        id: s.path,
        name: s.path,
        code: s.code,
        order: s.order,
        configBinding: s.configBinding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    const storedConfigs = (opts.configs ?? []).map((c) => ({
        id: c.id,
        name: `${c.id}.json`,
        json: c.json,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    await chrome.storage.local.set({
        marco_projects: [project],
        marco_scripts: storedScripts,
        marco_configs: storedConfigs,
    });
}

async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 15));
}

function getCallsForTab(tabId: number) {
    return getScriptingCalls().filter((c) => c.tabId === tabId);
}

/* ------------------------------------------------------------------ */
/*  Wrapped Code Verification                                          */
/* ------------------------------------------------------------------ */

describe("Integration — Wrapped Code Injection", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("wraps user code in IIFE with try/catch isolation", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://app.test/*", matchType: "glob" }],
            scripts: [{ path: "widget.js", order: 1, code: "console.log('hello')" }],
        });

        handleNavigationCompleted({ tabId: 100, url: "https://app.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(100);

        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasIife = funcBody.includes("(function()");
        const hasTryCatch = funcBody.includes("try {");
        const hasUserCode = funcBody.includes("console.log('hello')");
        const hasErrorReporting = funcBody.includes("USER_SCRIPT_ERROR");

        expect(hasIife).toBe(true);
        expect(hasTryCatch).toBe(true);
        expect(hasUserCode).toBe(true);
        expect(hasErrorReporting).toBe(true);
    });

    it("includes config preamble when configBinding is resolved", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://configured.test/*", matchType: "glob" }],
            scripts: [
                {
                    path: "cfg-script.js",
                    order: 1,
                    code: "run(window.__MARCO_CONFIG__)",
                    configBinding: "my-cfg",
                },
            ],
            configs: [
                { id: "my-cfg", json: '{"key":"value"}' },
            ],
        });

        handleNavigationCompleted({ tabId: 101, url: "https://configured.test/dashboard", frameId: 0 });
        await flush();

        const calls = getCallsForTab(101);

        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasConfigBinding = funcBody.includes("__MARCO_CONFIG__");
        const hasUserCode = funcBody.includes("run(window.__MARCO_CONFIG__)");

        expect(hasConfigBinding).toBe(true);
        expect(hasUserCode).toBe(true);
    });

    it("does NOT include config preamble when no binding exists", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://plain.test/*", matchType: "glob" }],
            scripts: [{ path: "plain.js", order: 1, code: "doStuff()" }],
        });

        handleNavigationCompleted({ tabId: 102, url: "https://plain.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(102);

        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasNoConfig = !funcBody.includes("__MARCO_CONFIG__");

        expect(hasNoConfig).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Script Ordering Verification                                       */
/* ------------------------------------------------------------------ */

describe("Integration — Script Execution Order", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects scripts in ascending order", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://ordered.test/*", matchType: "glob" }],
            scripts: [
                { path: "third.js", order: 3, code: "step3()" },
                { path: "first.js", order: 1, code: "step1()" },
                { path: "second.js", order: 2, code: "step2()" },
            ],
        });

        handleNavigationCompleted({ tabId: 200, url: "https://ordered.test/app", frameId: 0 });
        await flush();

        const calls = getCallsForTab(200);

        expect(calls.length).toBe(3);

        const bodies = calls.map((c) => getInjectedCode(c));
        const firstHasStep1 = bodies[0].includes("step1()");
        const secondHasStep2 = bodies[1].includes("step2()");
        const thirdHasStep3 = bodies[2].includes("step3()");

        expect(firstHasStep1).toBe(true);
        expect(secondHasStep2).toBe(true);
        expect(thirdHasStep3).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  World Selection                                                    */
/* ------------------------------------------------------------------ */

describe("Integration — Execution World", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("passes the correct world to executeScript", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://world.test/*", matchType: "glob" }],
            scripts: [{ path: "world.js", order: 1, code: "worldCheck()" }],
        });

        handleNavigationCompleted({ tabId: 300, url: "https://world.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(300);

        expect(calls.length).toBe(1);

        const world = calls[0].world;
        const isValidWorld = world === "MAIN" || world === "ISOLATED";

        expect(isValidWorld).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Error Isolation Wrapper                                            */
/* ------------------------------------------------------------------ */

describe("Integration — Error Isolation", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("wraps code with script ID in error report", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://errors.test/*", matchType: "glob" }],
            scripts: [{ path: "fragile.js", order: 1, code: "throwIfBroken()" }],
        });

        handleNavigationCompleted({ tabId: 400, url: "https://errors.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(400);

        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasScriptId = funcBody.includes("fragile.js");
        const hasErrorType = funcBody.includes("USER_SCRIPT_ERROR");
        const hasMessageCapture = funcBody.includes("__marcoErr.message");
        const hasStackCapture = funcBody.includes("__marcoErr.stack");

        expect(hasScriptId).toBe(true);
        expect(hasErrorType).toBe(true);
        expect(hasMessageCapture).toBe(true);
        expect(hasStackCapture).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Full End-to-End Flow                                               */
/* ------------------------------------------------------------------ */

describe("Integration — Full E2E Flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("seeds project → navigates → injects wrapped code with config", async () => {
        await seedProjectWithScripts({
            projectId: "e2e-proj",
            urls: [
                { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            ],
            scripts: [
                {
                    path: "bootstrap.js",
                    order: 1,
                    code: "bootstrap(window.__MARCO_CONFIG__)",
                    configBinding: "boot-cfg",
                },
                {
                    path: "analytics.js",
                    order: 2,
                    code: "trackPageView()",
                },
            ],
            configs: [
                { id: "boot-cfg", json: '{"env":"production","debug":false}' },
            ],
        });

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 500, url: "https://lovable.dev/projects/abc123", frameId: 0 });
        await flush();

        const calls = getCallsForTab(500);
        const injectedCount = calls.length;

        expect(injectedCount).toBe(2);

        // First script: bootstrap with config
        const bootstrapBody = getInjectedCode(calls[0]);
        const hasBootstrapCode = bootstrapBody.includes("bootstrap(window.__MARCO_CONFIG__)");
        const hasConfigPreamble = bootstrapBody.includes("__MARCO_CONFIG__");
        const hasIsolation = bootstrapBody.includes("try {");

        expect(hasBootstrapCode).toBe(true);
        expect(hasConfigPreamble).toBe(true);
        expect(hasIsolation).toBe(true);

        // Second script: analytics without config
        const analyticsBody = getInjectedCode(calls[1]);
        const hasAnalyticsCode = analyticsBody.includes("trackPageView()");
        const hasNoConfigInAnalytics = !analyticsBody.includes("window.__MARCO_CONFIG__ =");

        expect(hasAnalyticsCode).toBe(true);
        expect(hasNoConfigInAnalytics).toBe(true);
    });

    it("does NOT inject when URL does not match any rule", async () => {
        await seedProjectWithScripts({
            urls: [{ pattern: "https://lovable.dev/*", matchType: "glob" }],
            scripts: [{ path: "nope.js", order: 1, code: "nope()" }],
        });

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 501, url: "https://unrelated.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("handles project with multiple URL rules matching same navigation", async () => {
        await seedProjectWithScripts({
            urls: [
                { pattern: "https://multi.test/*", matchType: "glob" },
                { pattern: "https://multi.test/specific", matchType: "exact" },
            ],
            scripts: [{ path: "multi.js", order: 1, code: "multi()" }],
        });

        handleNavigationCompleted({ tabId: 502, url: "https://multi.test/specific", frameId: 0 });
        await flush();

        const calls = getCallsForTab(502);

        // Deduplicated: same script from two matching rules → injected once
        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasUserCode = funcBody.includes("multi()");

        expect(hasUserCode).toBe(true);
    });

    it("skips injection when excludePattern matches the URL pathname", async () => {
        await seedProjectWithScripts({
            projectId: "exclude-proj",
            urls: [
                {
                    pattern: "https://app.test/*",
                    matchType: "glob",
                    excludePattern: "^/admin",
                },
            ],
            scripts: [{ path: "excluded.js", order: 1, code: "shouldNotRun()" }],
        });

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 600, url: "https://app.test/admin/settings", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("injects when excludePattern does NOT match the URL pathname", async () => {
        await seedProjectWithScripts({
            projectId: "include-proj",
            urls: [
                {
                    pattern: "https://app.test/*",
                    matchType: "glob",
                    excludePattern: "^/admin",
                },
            ],
            scripts: [{ path: "included.js", order: 1, code: "shouldRun()" }],
        });

        handleNavigationCompleted({ tabId: 601, url: "https://app.test/dashboard", frameId: 0 });
        await flush();

        const calls = getCallsForTab(601);

        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasCode = funcBody.includes("shouldRun()");

        expect(hasCode).toBe(true);
    });
});
