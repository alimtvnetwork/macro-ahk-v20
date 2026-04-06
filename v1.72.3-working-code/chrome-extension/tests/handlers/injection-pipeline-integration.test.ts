/**
 * Integration test — URL Matching + Script Resolution Pipeline
 *
 * Tests the full injection pipeline from URL matching through
 * project rules to script resolution and deduplication.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";

installChromeMock();

const { handleSaveProject } = await import("../../src/background/handlers/project-handler");
const { handleSaveScript, handleSaveConfig } = await import(
    "../../src/background/handlers/script-config-handler"
);
const { evaluateUrlMatches, deduplicateScripts } = await import(
    "../../src/background/project-matcher"
);
const { resolveScriptBindings } = await import("../../src/background/script-resolver");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function seedProject(
    name: string,
    patterns: string[],
    scriptPaths: string[],
) {
    const result = await handleSaveProject({
        type: "SAVE_PROJECT",
        project: {
            name,
            version: "1.0.0",
            schemaVersion: 1,
            targetUrls: patterns.map((p) => ({ pattern: p, matchType: "glob" })),
            scripts: scriptPaths.map((path, i) => ({
                path,
                order: i + 1,
            })),
        },
    } as any);
    return result.project!;
}

async function seedScript(name: string, code: string = "console.log('test')") {
    const result = await handleSaveScript({
        type: "SAVE_SCRIPT",
        script: { name, code, order: 1, isEnabled: true },
    } as any);
    return result.script;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("URL Matching + Script Resolution — Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("matches a URL against project glob patterns", async () => {
        await seedProject("Lovable", ["https://lovable.dev/projects/*"], ["sidebar.js"]);

        const matches = await evaluateUrlMatches("https://lovable.dev/projects/abc123");

        expect(matches.length).toBe(1);
        expect(matches[0].projectName).toBe("Lovable");
    });

    it("returns no matches for non-matching URLs", async () => {
        await seedProject("Lovable", ["https://lovable.dev/projects/*"], ["sidebar.js"]);

        const matches = await evaluateUrlMatches("https://github.com/something");

        expect(matches.length).toBe(0);
    });

    it("matches multiple projects for the same URL", async () => {
        await seedProject("Project A", ["https://example.com/*"], ["a.js"]);
        await seedProject("Project B", ["https://example.com/*"], ["b.js"]);

        const matches = await evaluateUrlMatches("https://example.com/page");

        expect(matches.length).toBe(2);
    });

    it("deduplicates scripts across multiple matches", async () => {
        await seedProject("Project A", ["https://example.com/*"], ["shared.js", "a.js"]);
        await seedProject("Project B", ["https://example.com/*"], ["shared.js", "b.js"]);

        const matches = await evaluateUrlMatches("https://example.com/page");
        const deduped = deduplicateScripts(matches);

        // shared.js should appear only once
        const sharedCount = deduped.filter((s) => s.scriptId === "shared.js").length;
        expect(sharedCount).toBe(1);
    });

    it("resolves script bindings from storage", async () => {
        const script = await seedScript("my-script", "console.log('resolved')");

        const bindings = [
            {
                scriptId: script.id,
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ];

        const result = await resolveScriptBindings(bindings);

        expect(result.resolved.length).toBe(1);
        expect(result.resolved[0].injectable.code).toBe("console.log('resolved')");
        expect(result.resolved[0].world).toBe("MAIN");
    });

    it("skips disabled scripts during resolution", async () => {
        const script = await seedScript("disabled-script");

        // Disable it
        const { handleToggleScript } = await import(
            "../../src/background/handlers/script-config-handler"
        );
        await handleToggleScript({ id: script.id } as any);

        const bindings = [
            {
                scriptId: script.id,
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ];

        const result = await resolveScriptBindings(bindings);
        expect(result.resolved.length).toBe(0);
        expect(result.skipped.length).toBe(1);
    });

    it("resolves config JSON with script binding", async () => {
        const script = await seedScript("bound-script");
        const config = await handleSaveConfig({
            type: "SAVE_CONFIG",
            config: { name: "test-config", json: '{"theme":"dark"}' },
        } as any);

        const bindings = [
            {
                scriptId: script.id,
                configId: config.config.id,
                order: 1,
                world: "ISOLATED" as const,
                runAt: "document_idle" as const,
            },
        ];

        const result = await resolveScriptBindings(bindings);

        expect(result.resolved.length).toBe(1);
        expect(result.resolved[0].configJson).toBe('{"theme":"dark"}');
        expect(result.resolved[0].world).toBe("ISOLATED");
    });

    it("returns null configJson when configId doesn't match", async () => {
        const script = await seedScript("orphan-script");

        const bindings = [
            {
                scriptId: script.id,
                configId: "nonexistent-config-id",
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ];

        const result = await resolveScriptBindings(bindings);

        expect(result.resolved.length).toBe(1);
        expect(result.resolved[0].configJson).toBeNull();
    });

    it("skips missing script references gracefully", async () => {
        const bindings = [
            {
                scriptId: "completely-missing-id",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ];

        const result = await resolveScriptBindings(bindings);
        expect(result.resolved.length).toBe(0);
        expect(result.skipped.length).toBe(1);
    });

    it("preserves execution order in resolved scripts", async () => {
        const script1 = await seedScript("first");
        const script2 = await seedScript("second");
        const script3 = await seedScript("third");

        const bindings = [
            { scriptId: script3.id, configId: null, order: 3, world: "MAIN" as const, runAt: "document_idle" as const },
            { scriptId: script1.id, configId: null, order: 1, world: "MAIN" as const, runAt: "document_idle" as const },
            { scriptId: script2.id, configId: null, order: 2, world: "MAIN" as const, runAt: "document_idle" as const },
        ];

        const result = await resolveScriptBindings(bindings);

        expect(result.resolved.length).toBe(3);
        // Order should be preserved as-is (sorting happens in auto-injector)
        expect(result.resolved[0].injectable.id).toBe(script3.id);
    });
});
