/**
 * Unit tests — Project Matcher
 *
 * Tests URL evaluation and script deduplication.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

const { evaluateUrlMatches, deduplicateScripts } = await import(
    "../../src/background/project-matcher"
);

/** Seeds a test project into mock storage. */
async function seedProject(project: Record<string, unknown>): Promise<void> {
    await (globalThis as any).chrome.storage.local.set({
        marco_projects: [project],
    });
}

describe("Project Matcher — evaluateUrlMatches", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns empty when no projects exist", async () => {
        const matches = await evaluateUrlMatches("https://lovable.dev/projects/abc");

        expect(matches).toHaveLength(0);
    });

    it("matches a glob rule", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [{ pattern: "https://lovable.dev/projects/*", matchType: "glob" }],
            scripts: [{ path: "s1", order: 1 }],
        });

        const matches = await evaluateUrlMatches("https://lovable.dev/projects/abc-123");

        expect(matches).toHaveLength(1);
        expect(matches[0].projectId).toBe("p1");
    });

    it("returns empty for non-matching URL", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [{ pattern: "https://lovable.dev/projects/*", matchType: "glob" }],
            scripts: [{ path: "s1", order: 1 }],
        });

        const matches = await evaluateUrlMatches("https://google.com/search");

        expect(matches).toHaveLength(0);
    });

    it("excludes URL when pathname matches excludePattern", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [
                {
                    pattern: "https://app.test/*",
                    matchType: "glob",
                    excludePattern: "^/admin",
                },
            ],
            scripts: [{ path: "s1", order: 1 }],
        });

        const excluded = await evaluateUrlMatches("https://app.test/admin/settings");
        const included = await evaluateUrlMatches("https://app.test/dashboard");

        expect(excluded).toHaveLength(0);
        expect(included).toHaveLength(1);
    });

    it("matches when excludePattern does not match pathname", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [
                {
                    pattern: "https://app.test/*",
                    matchType: "glob",
                    excludePattern: "^/api/",
                },
            ],
            scripts: [{ path: "s1", order: 1 }],
        });

        const matches = await evaluateUrlMatches("https://app.test/dashboard");

        expect(matches).toHaveLength(1);
    });

    it("matches when excludePattern is undefined", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [
                { pattern: "https://app.test/*", matchType: "glob" },
            ],
            scripts: [{ path: "s1", order: 1 }],
        });

        const matches = await evaluateUrlMatches("https://app.test/anything");

        expect(matches).toHaveLength(1);
    });

    it("matches when excludePattern is empty string", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [
                {
                    pattern: "https://app.test/*",
                    matchType: "glob",
                    excludePattern: "",
                },
            ],
            scripts: [{ path: "s1", order: 1 }],
        });

        const matches = await evaluateUrlMatches("https://app.test/page");

        expect(matches).toHaveLength(1);
    });

    it("handles invalid excludePattern regex gracefully", async () => {
        await seedProject({
            id: "p1",
            name: "Test",
            targetUrls: [
                {
                    pattern: "https://app.test/*",
                    matchType: "glob",
                    excludePattern: "[invalid(",
                },
            ],
            scripts: [{ path: "s1", order: 1 }],
        });

        const matches = await evaluateUrlMatches("https://app.test/page");

        // Invalid regex should not exclude — fail open
        expect(matches).toHaveLength(1);
    });
});

describe("Project Matcher — deduplicateScripts", () => {
    it("removes duplicate script IDs", () => {
        const matches = [
            {
                projectId: "p1",
                projectName: "A",
                ruleId: "r1",
                ruleName: "Rule 1",
                priority: 100,
                scriptBindings: [
                    { scriptId: "s1", configId: null, order: 1, world: "MAIN" as const, runAt: "document_idle" as const },
                ],
                conditions: { requireElement: null, requireCookie: null, minDelayMs: 0, requireOnline: false },
            },
            {
                projectId: "p2",
                projectName: "B",
                ruleId: "r2",
                ruleName: "Rule 2",
                priority: 200,
                scriptBindings: [
                    { scriptId: "s1", configId: null, order: 1, world: "MAIN" as const, runAt: "document_idle" as const },
                    { scriptId: "s2", configId: null, order: 2, world: "MAIN" as const, runAt: "document_idle" as const },
                ],
                conditions: { requireElement: null, requireCookie: null, minDelayMs: 0, requireOnline: false },
            },
        ];

        const result = deduplicateScripts(matches);

        expect(result).toHaveLength(2);
        expect(result[0].scriptId).toBe("s1");
        expect(result[1].scriptId).toBe("s2");
    });
});
