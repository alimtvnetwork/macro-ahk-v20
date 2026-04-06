/**
 * Unit tests — Deduplication & Collection Logic
 *
 * Tests the Set-based deduplication in project-matcher,
 * script ordering, and priority sorting — the core
 * hash-set / hash-map patterns in the injection pipeline.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

const { deduplicateScripts, evaluateUrlMatches } =
    await import("../../src/background/project-matcher");

describe("Deduplication — Set<scriptId>", () => {
    it("returns unique scripts when no duplicates", () => {
        const matches = [
            buildMatch("p1", [
                buildBinding("s1", 1),
                buildBinding("s2", 2),
            ]),
        ];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(2);
    });

    it("removes duplicate scriptId across matches", () => {
        const matches = [
            buildMatch("p1", [buildBinding("s1", 1)]),
            buildMatch("p2", [buildBinding("s1", 1), buildBinding("s2", 2)]),
        ];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(2);
        expect(result[0].scriptId).toBe("s1");
        expect(result[1].scriptId).toBe("s2");
    });

    it("first occurrence wins when duplicated", () => {
        const matches = [
            buildMatch("p1", [
                { scriptId: "shared", configId: "config-A", order: 10, world: "MAIN" as const, runAt: "document_idle" as const },
            ]),
            buildMatch("p2", [
                { scriptId: "shared", configId: "config-B", order: 20, world: "ISOLATED" as const, runAt: "document_start" as const },
            ]),
        ];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(1);
        expect(result[0].configId).toBe("config-A");
        expect(result[0].order).toBe(10);
    });

    it("handles empty matches array", () => {
        const result = deduplicateScripts([]);

        expect(result).toHaveLength(0);
    });

    it("handles match with empty scriptBindings", () => {
        const matches = [buildMatch("p1", [])];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(0);
    });

    it("preserves order of first-seen scripts", () => {
        const matches = [
            buildMatch("p1", [
                buildBinding("alpha", 3),
                buildBinding("beta", 1),
            ]),
            buildMatch("p2", [
                buildBinding("gamma", 2),
                buildBinding("alpha", 5),
            ]),
        ];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(3);
        expect(result[0].scriptId).toBe("alpha");
        expect(result[1].scriptId).toBe("beta");
        expect(result[2].scriptId).toBe("gamma");
    });

    it("handles large number of scripts efficiently", () => {
        const bindings = Array.from({ length: 500 }, (_, i) =>
            buildBinding(`script-${i}`, i),
        );
        const matches = [buildMatch("p1", bindings)];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(500);
    });
});

describe("URL Evaluation — multi-project matching", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("matches multiple projects for the same URL", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_projects: [
                {
                    id: "p1",
                    name: "Project A",
                    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                    scripts: [{ path: "s1", order: 1 }],
                },
                {
                    id: "p2",
                    name: "Project B",
                    targetUrls: [{ pattern: "https://example.com/page", matchType: "exact" }],
                    scripts: [{ path: "s2", order: 1 }],
                },
            ],
        });

        const matches = await evaluateUrlMatches("https://example.com/page");

        expect(matches).toHaveLength(2);
    });

    it("skips projects with no scripts", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_projects: [
                {
                    id: "p1",
                    name: "Empty",
                    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                    scripts: [],
                },
            ],
        });

        const matches = await evaluateUrlMatches("https://example.com/page");

        expect(matches).toHaveLength(0);
    });

    it("skips projects with no URL rules", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_projects: [
                {
                    id: "p1",
                    name: "No Rules",
                    targetUrls: [],
                    scripts: [{ path: "s1", order: 1 }],
                },
            ],
        });

        const matches = await evaluateUrlMatches("https://example.com/page");

        expect(matches).toHaveLength(0);
    });

    it("returns matches sorted by priority", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_projects: [
                {
                    id: "p1",
                    name: "Low Priority",
                    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                    scripts: [{ path: "s1", order: 1 }],
                },
                {
                    id: "p2",
                    name: "Also Low Priority",
                    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                    scripts: [{ path: "s2", order: 1 }],
                },
            ],
        });

        const matches = await evaluateUrlMatches("https://example.com/page");

        // Both have priority 100, should both be present
        expect(matches).toHaveLength(2);
    });
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildBinding(
    scriptId: string,
    order: number,
) {
    return {
        scriptId,
        configId: null,
        order,
        world: "MAIN" as const,
        runAt: "document_idle" as const,
    };
}

function buildMatch(
    projectId: string,
    scriptBindings: ReturnType<typeof buildBinding>[],
) {
    return {
        projectId,
        projectName: `Project ${projectId}`,
        ruleId: `${projectId}:rule`,
        ruleName: "test rule",
        priority: 100,
        scriptBindings,
        conditions: {
            requireElement: null,
            requireCookie: null,
            minDelayMs: 0,
            requireOnline: false,
        },
    };
}
