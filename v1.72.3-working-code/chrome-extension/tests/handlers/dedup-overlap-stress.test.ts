/**
 * Stress Tests — Overlapping URL Rules, Deduplication & Priority
 *
 * Seeds 50+ projects with overlapping URL rules, verifies
 * correct deduplication, priority ordering, and injection counts.
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

const { evaluateUrlMatches, deduplicateScripts } = await import(
    "../../src/background/project-matcher"
);

const { registerAutoInjector, handleNavigationCompleted } = await import(
    "../../src/background/auto-injector"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeProject(
    index: number,
    urls: Array<{ pattern: string; matchType: string; excludePattern?: string }>,
    scriptIds: string[],
) {
    return {
        id: `proj-${index}`,
        name: `Project ${index}`,
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: urls,
        scripts: scriptIds.map((sid, i) => ({
            path: sid,
            order: i + 1,
            runAt: "document_idle",
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeStoredScript(id: string, code: string) {
    return {
        id,
        name: `${id}.js`,
        code,
        order: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 15));
}

/* ------------------------------------------------------------------ */
/*  Deduplication under load                                           */
/* ------------------------------------------------------------------ */

describe("Stress — Deduplication with 50+ overlapping projects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("deduplicates shared script across 60 projects", async () => {
        const projects = [];

        for (let i = 0; i < 60; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://shared.test/*", matchType: "glob" }],
                    ["shared-analytics.js"],
                ),
            );
        }

        await chrome.storage.local.set({ marco_projects: projects });

        const matches = await evaluateUrlMatches("https://shared.test/page");

        expect(matches.length).toBe(60);

        const deduplicated = deduplicateScripts(matches);

        expect(deduplicated.length).toBe(1);
        expect(deduplicated[0].scriptId).toBe("shared-analytics.js");
    });

    it("preserves unique scripts from 50 projects with same URL", async () => {
        const projects = [];

        for (let i = 0; i < 50; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://unique.test/*", matchType: "glob" }],
                    [`unique-script-${i}.js`],
                ),
            );
        }

        await chrome.storage.local.set({ marco_projects: projects });

        const matches = await evaluateUrlMatches("https://unique.test/page");
        const deduplicated = deduplicateScripts(matches);

        expect(deduplicated.length).toBe(50);

        const scriptIds = deduplicated.map((d) => d.scriptId);
        const uniqueIds = new Set(scriptIds);

        expect(uniqueIds.size).toBe(50);
    });

    it("deduplicates when 30 of 50 projects share scripts", async () => {
        const projects = [];

        for (let i = 0; i < 30; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://mixed.test/*", matchType: "glob" }],
                    ["common.js"],
                ),
            );
        }

        for (let i = 30; i < 50; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://mixed.test/*", matchType: "glob" }],
                    [`distinct-${i}.js`],
                ),
            );
        }

        await chrome.storage.local.set({ marco_projects: projects });

        const matches = await evaluateUrlMatches("https://mixed.test/app");
        const deduplicated = deduplicateScripts(matches);

        // 1 shared + 20 unique = 21
        expect(deduplicated.length).toBe(21);
    });
});

/* ------------------------------------------------------------------ */
/*  Match count accuracy                                               */
/* ------------------------------------------------------------------ */

describe("Stress — Match counts with overlapping rules", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("counts matches correctly with multiple rules per project", async () => {
        const projects = [];

        for (let i = 0; i < 25; i++) {
            projects.push(
                makeProject(
                    i,
                    [
                        { pattern: "https://multi.test/*", matchType: "glob" },
                        { pattern: "https://multi.test/page", matchType: "exact" },
                    ],
                    [`script-${i}.js`],
                ),
            );
        }

        await chrome.storage.local.set({ marco_projects: projects });

        const matches = await evaluateUrlMatches("https://multi.test/page");

        // Each project has 2 rules, both match → 50 matches
        expect(matches.length).toBe(50);
    });

    it("only matching rules contribute to match count", async () => {
        const projects = [];

        for (let i = 0; i < 50; i++) {
            const isEven = i % 2 === 0;
            const pattern = isEven
                ? "https://target.test/*"
                : "https://other.test/*";

            projects.push(
                makeProject(
                    i,
                    [{ pattern, matchType: "glob" }],
                    [`script-${i}.js`],
                ),
            );
        }

        await chrome.storage.local.set({ marco_projects: projects });

        const matches = await evaluateUrlMatches("https://target.test/page");

        expect(matches.length).toBe(25);
    });

    it("excludePattern reduces match count from overlapping set", async () => {
        const projects = [];

        for (let i = 0; i < 50; i++) {
            const hasExclude = i < 20;
            const rule: any = {
                pattern: "https://filtered.test/*",
                matchType: "glob",
            };

            if (hasExclude) {
                rule.excludePattern = "^/blocked";
            }

            projects.push(
                makeProject(i, [rule], [`script-${i}.js`]),
            );
        }

        await chrome.storage.local.set({ marco_projects: projects });

        const matches = await evaluateUrlMatches("https://filtered.test/blocked/page");

        // 20 excluded + 30 matching = 30
        expect(matches.length).toBe(30);
    });
});

/* ------------------------------------------------------------------ */
/*  Injection count under overlapping rules                            */
/* ------------------------------------------------------------------ */

describe("Stress — Injection with 50+ overlapping projects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects deduplicated scripts from 50 overlapping projects", async () => {
        const projects = [];
        const scripts = [];

        for (let i = 0; i < 50; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://overlap.test/*", matchType: "glob" }],
                    ["shared.js"],
                ),
            );
        }

        scripts.push(makeStoredScript("shared.js", "sharedCode()"));

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: scripts,
            marco_configs: [],
        });

        handleNavigationCompleted({ tabId: 800, url: "https://overlap.test/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls().filter((c) => c.tabId === 800);

        // Deduplicated: 50 projects share 1 script → injected once
        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasCode = funcBody.includes("sharedCode()");
        expect(hasCode).toBe(true);
    });

    it("injects all unique scripts from 50 overlapping projects", async () => {
        const projects = [];
        const scripts = [];

        for (let i = 0; i < 50; i++) {
            const scriptId = `unique-${i}.js`;

            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://alloverlap.test/*", matchType: "glob" }],
                    [scriptId],
                ),
            );

            scripts.push(makeStoredScript(scriptId, `run_${i}()`));
        }

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: scripts,
            marco_configs: [],
        });

        handleNavigationCompleted({ tabId: 801, url: "https://alloverlap.test/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls().filter((c) => c.tabId === 801);

        expect(calls.length).toBe(50);

        const bodies = calls.map((c) => getInjectedCode(c));
        const uniqueBodies = new Set(bodies);
        expect(uniqueBodies.size).toBe(50);
    });

    it("injects nothing for non-matching URL among 50 projects", async () => {
        const projects = [];

        for (let i = 0; i < 50; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://only-here.test/*", matchType: "glob" }],
                    [`s-${i}.js`],
                ),
            );
        }

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: [],
            marco_configs: [],
        });

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 802, url: "https://nowhere.test/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("deduplicates across projects with mixed match types", async () => {
        const projects = [];
        const scripts = [];

        for (let i = 0; i < 25; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://mixed-match.test/*", matchType: "glob" }],
                    ["analytics.js"],
                ),
            );
        }

        for (let i = 25; i < 50; i++) {
            projects.push(
                makeProject(
                    i,
                    [{ pattern: "https://mixed-match.test/", matchType: "prefix" }],
                    ["analytics.js"],
                ),
            );
        }

        scripts.push(makeStoredScript("analytics.js", "track()"));

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: scripts,
            marco_configs: [],
        });

        handleNavigationCompleted({ tabId: 803, url: "https://mixed-match.test/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls().filter((c) => c.tabId === 803);

        // All 50 projects reference same script → injected once
        expect(calls.length).toBe(1);
    });
});
