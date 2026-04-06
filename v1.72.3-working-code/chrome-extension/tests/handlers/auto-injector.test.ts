/**
 * Integration tests — Auto-Injector
 *
 * Verifies the full webNavigation.onCompleted → URL matching →
 * script resolution → isolation wrapping → chrome.scripting.executeScript
 * flow against mocked chrome APIs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    simulateNavigation,
    getScriptingCalls,
    getWebNavListenerCount,
    getInjectedCode,
} from "../mocks/chrome-storage";

installChromeMock();

const { registerAutoInjector, handleNavigationCompleted } = await import(
    "../../src/background/auto-injector"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Seeds a project with URL rules and script references into storage. */
async function seedProject(overrides: Record<string, unknown> = {}): Promise<string> {
    const project = {
        id: "proj-1",
        name: "Test Project",
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: [
            { pattern: "https://example.com/*", matchType: "glob" },
        ],
        scripts: [
            { path: "main.js", order: 1, runAt: "document_idle" },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    };

    await chrome.storage.local.set({ marco_projects: [project] });
    return project.id;
}

/** Seeds a stored script into storage by name. */
async function seedScript(
    name: string,
    code: string,
    extras: Record<string, unknown> = {},
): Promise<void> {
    const existing = await chrome.storage.local.get("marco_scripts");
    const scripts = (existing["marco_scripts"] as unknown[]) ?? [];

    scripts.push({
        id: name,
        name,
        code,
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...extras,
    });

    await chrome.storage.local.set({ marco_scripts: scripts });
}

/** Seeds a stored config into storage. */
async function seedConfig(
    id: string,
    json: string,
): Promise<void> {
    const existing = await chrome.storage.local.get("marco_configs");
    const configs = (existing["marco_configs"] as unknown[]) ?? [];

    configs.push({
        id,
        name: `${id}.json`,
        json,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });

    await chrome.storage.local.set({ marco_configs: configs });
}

/** Small async flush to let promises resolve. */
async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 10));
}

/* ------------------------------------------------------------------ */
/*  Listener Registration                                              */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Registration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("does NOT register a webNavigation listener (v7.26 — manual only)", () => {
        const before = getWebNavListenerCount();
        registerAutoInjector();
        const after = getWebNavListenerCount();

        expect(after).toBe(before);
    });
});

/* ------------------------------------------------------------------ */
/*  URL Matching & Script Injection                                    */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — URL Matching", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects scripts when URL matches project glob rule", async () => {
        await seedProject();
        await seedScript("main.js", "console.log('injected')");

        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const hasInjection = calls.some((c) => c.tabId === 1);

        expect(hasInjection).toBe(true);
    });

    it("does not inject for non-matching URLs", async () => {
        await seedProject();
        await seedScript("main.js", "console.log('injected')");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 2, url: "https://other-site.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("ignores sub-frame navigations (frameId !== 0)", async () => {
        await seedProject();
        await seedScript("main.js", "console.log('injected')");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 1 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("does not inject when no projects exist", async () => {
        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("does not inject when project has no scripts", async () => {
        await seedProject({ scripts: [] });

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("does not inject when project has no URL rules", async () => {
        await seedProject({ targetUrls: [] });
        await seedScript("main.js", "console.log('hi')");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });
});

/* ------------------------------------------------------------------ */
/*  Match Types                                                        */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Match Types", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("matches exact URL rules", async () => {
        await seedProject({
            targetUrls: [{ pattern: "https://exact.com/page", matchType: "exact" }],
        });
        await seedScript("main.js", "exact()");

        handleNavigationCompleted({ tabId: 1, url: "https://exact.com/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const hasInjection = calls.some((c) => c.tabId === 1);

        expect(hasInjection).toBe(true);
    });

    it("matches prefix URL rules", async () => {
        await seedProject({
            targetUrls: [{ pattern: "https://prefix.com/app", matchType: "prefix" }],
        });
        await seedScript("main.js", "prefix()");

        handleNavigationCompleted({ tabId: 1, url: "https://prefix.com/app/dashboard", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const hasInjection = calls.some((c) => c.tabId === 1);

        expect(hasInjection).toBe(true);
    });

    it("matches regex URL rules", async () => {
        await seedProject({
            targetUrls: [{ pattern: "https://regex\\.com/v\\d+/.*", matchType: "regex" }],
        });
        await seedScript("main.js", "regex()");

        handleNavigationCompleted({ tabId: 1, url: "https://regex.com/v2/users", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const hasInjection = calls.some((c) => c.tabId === 1);

        expect(hasInjection).toBe(true);
    });

    it("rejects regex when URL does not match", async () => {
        await seedProject({
            targetUrls: [{ pattern: "https://regex\\.com/v\\d+/.*", matchType: "regex" }],
        });
        await seedScript("main.js", "regex()");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://other.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });
});

/* ------------------------------------------------------------------ */
/*  Multiple Scripts & Ordering                                        */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Multiple Scripts", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects multiple scripts for a matching project", async () => {
        await seedProject({
            scripts: [
                { path: "init.js", order: 1, runAt: "document_start" },
                { path: "main.js", order: 2, runAt: "document_idle" },
                { path: "cleanup.js", order: 3, runAt: "document_idle" },
            ],
        });
        await seedScript("init.js", "init()");
        await seedScript("main.js", "main()");
        await seedScript("cleanup.js", "cleanup()");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/app", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;
        const injectedCount = callsAfter - callsBefore;

        expect(injectedCount).toBe(3);
    });

    it("skips scripts not found in storage", async () => {
        await seedProject({
            scripts: [
                { path: "exists.js", order: 1 },
                { path: "missing.js", order: 2 },
            ],
        });
        await seedScript("exists.js", "found()");
        // missing.js is NOT seeded

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;
        const injectedCount = callsAfter - callsBefore;

        // Only the found script should be injected
        expect(injectedCount).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Config Binding Resolution                                          */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Config Binding", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects script with resolved config binding", async () => {
        await seedConfig("cfg-1", '{"apiUrl":"https://api.example.com"}');
        await seedProject({
            scripts: [
                { path: "api-client.js", order: 1, configBinding: "cfg-1" },
            ],
        });
        await seedScript("api-client.js", "fetch(config.apiUrl)", {
            configBinding: "cfg-1",
        });

        handleNavigationCompleted({ tabId: 1, url: "https://example.com/app", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const hasInjection = calls.some((c) => c.tabId === 1);

        expect(hasInjection).toBe(true);
    });

    it("injects script even when config binding is missing", async () => {
        await seedProject({
            scripts: [
                { path: "standalone.js", order: 1, configBinding: "nonexistent-cfg" },
            ],
        });
        await seedScript("standalone.js", "standalone()");

        handleNavigationCompleted({ tabId: 1, url: "https://example.com/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const hasInjection = calls.some((c) => c.tabId === 1);

        expect(hasInjection).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Multiple Projects                                                  */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Multiple Projects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("matches across multiple projects for same URL", async () => {
        const projects = [
            {
                id: "proj-a",
                name: "Project A",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://shared.com/*", matchType: "glob" }],
                scripts: [{ path: "a.js", order: 1 }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: "proj-b",
                name: "Project B",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://shared.com/*", matchType: "glob" }],
                scripts: [{ path: "b.js", order: 1 }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        await chrome.storage.local.set({ marco_projects: projects });
        await seedScript("a.js", "projA()");
        await seedScript("b.js", "projB()");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://shared.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;
        const injectedCount = callsAfter - callsBefore;

        // Both projects match, so both scripts injected
        expect(injectedCount).toBe(2);
    });

    it("only injects from matching project", async () => {
        const projects = [
            {
                id: "proj-match",
                name: "Matching",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://target.com/*", matchType: "glob" }],
                scripts: [{ path: "match.js", order: 1 }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: "proj-other",
                name: "Other",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://other.com/*", matchType: "glob" }],
                scripts: [{ path: "other.js", order: 1 }],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        await chrome.storage.local.set({ marco_projects: projects });
        await seedScript("match.js", "match()");
        await seedScript("other.js", "other()");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://target.com/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;
        const injectedCount = callsAfter - callsBefore;

        expect(injectedCount).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Deduplication                                                      */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Script Deduplication", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("deduplicates same script referenced by multiple rules", async () => {
        await seedProject({
            targetUrls: [
                { pattern: "https://example.com/*", matchType: "glob" },
                { pattern: "https://example.com/specific", matchType: "exact" },
            ],
            scripts: [{ path: "shared.js", order: 1 }],
        });
        await seedScript("shared.js", "shared()");

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 1, url: "https://example.com/specific", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;
        const injectedCount = callsAfter - callsBefore;

        // Same script matched by two rules, but injected only once
        expect(injectedCount).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Tab Isolation                                                      */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Tab Isolation", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects into correct tab ID", async () => {
        await seedProject();
        await seedScript("main.js", "tab_test()");

        handleNavigationCompleted({ tabId: 42, url: "https://example.com/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls();
        const tabCall = calls.find((c) => c.tabId === 42);

        expect(tabCall).toBeDefined();
    });

    it("handles multiple tabs navigating simultaneously", async () => {
        await seedProject();
        await seedScript("main.js", "multi_tab()");

        handleNavigationCompleted({ tabId: 10, url: "https://example.com/a", frameId: 0 });
        handleNavigationCompleted({ tabId: 20, url: "https://example.com/b", frameId: 0 });
        handleNavigationCompleted({ tabId: 30, url: "https://other.com/c", frameId: 0 }); // non-matching
        await flush();

        const calls = getScriptingCalls();
        const tab10 = calls.some((c) => c.tabId === 10);
        const tab20 = calls.some((c) => c.tabId === 20);
        const tab30 = calls.some((c) => c.tabId === 30);

        expect(tab10).toBe(true);
        expect(tab20).toBe(true);
        expect(tab30).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  Disabled Scripts                                                   */
/* ------------------------------------------------------------------ */

describe("Auto-Injector — Disabled Scripts", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("should skip scripts with isEnabled=false during navigation", async () => {
        await seedProject({
            scripts: [
                { path: "enabled.js", order: 1, runAt: "document_idle" },
                { path: "disabled.js", order: 2, runAt: "document_idle" },
            ],
        });

        await seedScript("enabled.js", "console.log('enabled')", { isEnabled: true });
        await seedScript("disabled.js", "console.log('disabled')", { isEnabled: false });

        handleNavigationCompleted({ tabId: 50, url: "https://example.com/page", frameId: 0 });
        await flush();
        await flush();

        const calls = getScriptingCalls();
        const injectedBodies = calls.map((c) => getInjectedCode(c)).join(" ");

        expect(calls.length).toBe(1);
        expect(injectedBodies).toContain("enabled");
        expect(injectedBodies).not.toContain("disabled");
    });

    it("should inject zero scripts when all are disabled", async () => {
        await seedProject({
            scripts: [
                { path: "a.js", order: 1, runAt: "document_idle" },
                { path: "b.js", order: 2, runAt: "document_idle" },
            ],
        });

        await seedScript("a.js", "console.log('a')", { isEnabled: false });
        await seedScript("b.js", "console.log('b')", { isEnabled: false });

        handleNavigationCompleted({ tabId: 51, url: "https://example.com/page", frameId: 0 });
        await flush();
        await flush();

        const calls = getScriptingCalls();
        expect(calls.length).toBe(0);
    });

    it("should treat scripts without isEnabled field as enabled (backward compat)", async () => {
        await seedProject();
        await seedScript("main.js", "console.log('legacy')");

        handleNavigationCompleted({ tabId: 52, url: "https://example.com/page", frameId: 0 });
        await flush();
        await flush();

        const calls = getScriptingCalls();
        expect(calls.length).toBe(1);
    });
});
