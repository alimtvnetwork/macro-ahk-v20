/**
 * Integration tests — Edge Cases
 *
 * Tests disabled projects (no scripts/rules), empty script code,
 * malformed config JSON, and concurrent navigations to different tabs.
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

async function seedRaw(
    projects: any[],
    scripts: any[] = [],
    configs: any[] = [],
): Promise<void> {
    await chrome.storage.local.set({
        marco_projects: projects,
        marco_scripts: scripts,
        marco_configs: configs,
    });
}

function makeProject(overrides: Record<string, any> = {}) {
    return {
        id: "edge-proj",
        name: "Edge Project",
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: [{ pattern: "https://edge.test/*", matchType: "glob" }],
        scripts: [{ path: "edge.js", order: 1, runAt: "document_idle" }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

function makeScript(overrides: Record<string, any> = {}) {
    return {
        id: "edge.js",
        name: "edge.js",
        code: "edgeFunc()",
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };
}

async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 15));
}

function getCallsForTab(tabId: number) {
    return getScriptingCalls().filter((c) => c.tabId === tabId);
}

/* ------------------------------------------------------------------ */
/*  Disabled Projects                                                  */
/* ------------------------------------------------------------------ */

describe("Edge — Disabled projects (no scripts or rules)", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("skips project with empty scripts array", async () => {
        await seedRaw(
            [makeProject({ scripts: [] })],
            [makeScript()],
        );

        const before = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1000, url: "https://edge.test/page", frameId: 0 });
        await flush();

        expect(getScriptingCalls().length).toBe(before);
    });

    it("skips project with empty targetUrls array", async () => {
        await seedRaw(
            [makeProject({ targetUrls: [] })],
            [makeScript()],
        );

        const before = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1001, url: "https://edge.test/page", frameId: 0 });
        await flush();

        expect(getScriptingCalls().length).toBe(before);
    });

    it("skips project with both empty scripts and targetUrls", async () => {
        await seedRaw(
            [makeProject({ scripts: [], targetUrls: [] })],
            [makeScript()],
        );

        const before = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1002, url: "https://edge.test/page", frameId: 0 });
        await flush();

        expect(getScriptingCalls().length).toBe(before);
    });

    it("injects from enabled project while skipping disabled one", async () => {
        await seedRaw(
            [
                makeProject({ id: "disabled", scripts: [] }),
                makeProject({ id: "enabled", scripts: [{ path: "active.js", order: 1 }] }),
            ],
            [makeScript({ id: "active.js", name: "active.js", code: "active()" })],
        );

        handleNavigationCompleted({ tabId: 1003, url: "https://edge.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(1003);
        expect(calls.length).toBe(1);
        expect(getInjectedCode(calls[0])).toContain("active()");
    });
});

/* ------------------------------------------------------------------ */
/*  Empty Script Code                                                  */
/* ------------------------------------------------------------------ */

describe("Edge — Empty script code", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects wrapper even when script code is empty string", async () => {
        await seedRaw(
            [makeProject()],
            [makeScript({ code: "" })],
        );

        handleNavigationCompleted({ tabId: 1100, url: "https://edge.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(1100);
        expect(calls.length).toBe(1);

        const body = getInjectedCode(calls[0]);
        expect(body).toContain("try {");
        expect(body).toContain("USER_SCRIPT_ERROR");
    });

    it("injects wrapper when script code is only whitespace", async () => {
        await seedRaw(
            [makeProject()],
            [makeScript({ code: "   \n\t  " })],
        );

        handleNavigationCompleted({ tabId: 1101, url: "https://edge.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(1101);
        expect(calls.length).toBe(1);
    });

    it("skips script that does not exist in storage", async () => {
        await seedRaw(
            [makeProject({ scripts: [{ path: "missing.js", order: 1 }] })],
            [], // no scripts in store
        );

        const before = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1102, url: "https://edge.test/page", frameId: 0 });
        await flush();

        // Script resolver returns empty → 0 injections
        expect(getCallsForTab(1102).length).toBe(0);
    });
});

/* ------------------------------------------------------------------ */
/*  Malformed Config JSON                                              */
/* ------------------------------------------------------------------ */

describe("Edge — Malformed config JSON", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("malformed config JSON is injected (eval fails at runtime, not build time)", async () => {
        await seedRaw(
            [makeProject({
                scripts: [{ path: "cfg.js", order: 1, configBinding: "bad-cfg" }],
            })],
            [makeScript({ id: "cfg.js", name: "cfg.js", code: "useCfg()" })],
            [{ id: "bad-cfg", name: "bad-cfg.json", json: "{not valid json!!!", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
        );

        // With executeSerializedCode, code is passed as a string arg.
        // The injection call succeeds; the eval would fail at runtime.
        handleNavigationCompleted({ tabId: 1200, url: "https://edge.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(1200);
        expect(calls.length).toBe(1);

        // The wrapped code contains the malformed config preamble
        const body = getInjectedCode(calls[0]);
        expect(body).toContain("__MARCO_CONFIG__");
    });

    it("injects without config preamble when configBinding has no matching config", async () => {
        await seedRaw(
            [makeProject({
                scripts: [{ path: "orphan.js", order: 1, configBinding: "nonexistent" }],
            })],
            [makeScript({ id: "orphan.js", name: "orphan.js", code: "orphan()" })],
            [], // no configs
        );

        handleNavigationCompleted({ tabId: 1201, url: "https://edge.test/page", frameId: 0 });
        await flush();

        const calls = getCallsForTab(1201);
        expect(calls.length).toBe(1);

        const body = getInjectedCode(calls[0]);
        expect(body).not.toContain("__MARCO_CONFIG__");
        expect(body).toContain("orphan()");
    });

    it("empty string config JSON is injected (eval fails at runtime)", async () => {
        await seedRaw(
            [makeProject({
                scripts: [{ path: "empty-cfg.js", order: 1, configBinding: "empty-cfg" }],
            })],
            [makeScript({ id: "empty-cfg.js", name: "empty-cfg.js", code: "init()" })],
            [{ id: "empty-cfg", name: "empty-cfg.json", json: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
        );

        handleNavigationCompleted({ tabId: 1202, url: "https://edge.test/page", frameId: 0 });
        await flush();

        // With executeSerializedCode, the empty config produces invalid JS
        // but injection still succeeds — eval failure happens at runtime
        const calls = getCallsForTab(1202);
        expect(calls.length).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Concurrent Navigations                                             */
/* ------------------------------------------------------------------ */

describe("Edge — Concurrent navigations to different tabs", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects independently into concurrent tab navigations", async () => {
        await seedRaw(
            [makeProject()],
            [makeScript()],
        );

        // Fire navigations to 3 tabs simultaneously
        handleNavigationCompleted({ tabId: 1300, url: "https://edge.test/page-a", frameId: 0 });
        handleNavigationCompleted({ tabId: 1301, url: "https://edge.test/page-b", frameId: 0 });
        handleNavigationCompleted({ tabId: 1302, url: "https://edge.test/page-c", frameId: 0 });
        await flush();

        expect(getCallsForTab(1300).length).toBe(1);
        expect(getCallsForTab(1301).length).toBe(1);
        expect(getCallsForTab(1302).length).toBe(1);
    });

    it("does not cross-contaminate between matching and non-matching tabs", async () => {
        await seedRaw(
            [makeProject()],
            [makeScript()],
        );

        handleNavigationCompleted({ tabId: 1310, url: "https://edge.test/yes", frameId: 0 });
        handleNavigationCompleted({ tabId: 1311, url: "https://other.com/no", frameId: 0 });
        handleNavigationCompleted({ tabId: 1312, url: "https://edge.test/also-yes", frameId: 0 });
        await flush();

        expect(getCallsForTab(1310).length).toBe(1);
        expect(getCallsForTab(1311).length).toBe(0);
        expect(getCallsForTab(1312).length).toBe(1);
    });

    it("handles rapid re-navigation on same tab", async () => {
        await seedRaw(
            [makeProject()],
            [makeScript()],
        );

        handleNavigationCompleted({ tabId: 1320, url: "https://edge.test/first", frameId: 0 });
        handleNavigationCompleted({ tabId: 1320, url: "https://edge.test/second", frameId: 0 });
        handleNavigationCompleted({ tabId: 1320, url: "https://edge.test/third", frameId: 0 });
        await flush();

        // All 3 navigations trigger injection (no debounce in current impl)
        const calls = getCallsForTab(1320);
        expect(calls.length).toBe(3);
    });

    it("handles 10 concurrent tab navigations without errors", async () => {
        await seedRaw(
            [makeProject()],
            [makeScript()],
        );

        for (let i = 0; i < 10; i++) {
            handleNavigationCompleted({ tabId: 1400 + i, url: `https://edge.test/page-${i}`, frameId: 0 });
        }
        await flush();

        let totalInjections = 0;
        for (let i = 0; i < 10; i++) {
            totalInjections += getCallsForTab(1400 + i).length;
        }

        expect(totalInjections).toBe(10);
    });
});
