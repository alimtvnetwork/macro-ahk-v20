/**
 * Unit tests — Script Resolver
 *
 * Tests resolution of script bindings to injectable scripts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

const { resolveScriptBindings } = await import(
    "../../src/background/script-resolver"
);

describe("Script Resolver", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("resolves a script binding to injectable code", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "s1",
                    name: "test-script",
                    code: "console.log('hello');",
                    order: 1,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            {
                scriptId: "s1",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(1);
        expect(result.resolved[0].injectable.code).toBe("console.log('hello');");
        expect(result.resolved[0].world).toBe("MAIN");
    });

    it("returns empty for missing script", async () => {
        const result = await resolveScriptBindings([
            {
                scriptId: "nonexistent",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(0);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].reason).toBe("missing");
    });

    it("resolves config JSON when configId is provided", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "s1",
                    name: "script",
                    code: "run();",
                    order: 1,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
            marco_configs: [
                {
                    id: "c1",
                    name: "config",
                    json: '{"key":"value"}',
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            {
                scriptId: "s1",
                configId: "c1",
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(1);
        expect(result.resolved[0].configJson).toBe('{"key":"value"}');
    });

    it("finds script by name as fallback", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "uuid-123",
                    name: "my-script.js",
                    code: "doStuff();",
                    order: 1,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            {
                scriptId: "my-script.js",
                configId: null,
                order: 1,
                world: "ISOLATED" as const,
                runAt: "document_start" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(1);
        expect(result.resolved[0].injectable.code).toBe("doStuff();");
        expect(result.resolved[0].world).toBe("ISOLATED");
    });

    it("skips disabled scripts (isEnabled=false)", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "s-disabled",
                    name: "disabled-script",
                    code: "console.log('should not run');",
                    order: 1,
                    isEnabled: false,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            {
                scriptId: "s-disabled",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(0);
        expect(result.skipped).toHaveLength(1);
        expect(result.skipped[0].reason).toBe("disabled");
    });

    it("includes enabled scripts (isEnabled=true)", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "s-enabled",
                    name: "enabled-script",
                    code: "console.log('runs');",
                    order: 1,
                    isEnabled: true,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            {
                scriptId: "s-enabled",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(1);
    });

    it("includes scripts with undefined isEnabled (default enabled)", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "s-default",
                    name: "default-script",
                    code: "console.log('default');",
                    order: 1,
                    createdAt: "2026-01-01",
                    updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            {
                scriptId: "s-default",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_idle" as const,
            },
        ]);

        expect(result.resolved).toHaveLength(1);
    });

    it("filters disabled from mixed enabled/disabled set", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_scripts: [
                {
                    id: "s1", name: "enabled", code: "a();", order: 1,
                    isEnabled: true, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
                {
                    id: "s2", name: "disabled", code: "b();", order: 2,
                    isEnabled: false, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
                {
                    id: "s3", name: "also-enabled", code: "c();", order: 3,
                    isEnabled: true, createdAt: "2026-01-01", updatedAt: "2026-01-01",
                },
            ],
        });

        const result = await resolveScriptBindings([
            { scriptId: "s1", configId: null, order: 1, world: "MAIN" as const, runAt: "document_idle" as const },
            { scriptId: "s2", configId: null, order: 2, world: "MAIN" as const, runAt: "document_idle" as const },
            { scriptId: "s3", configId: null, order: 3, world: "MAIN" as const, runAt: "document_idle" as const },
        ]);

        expect(result.resolved).toHaveLength(2);
        expect(result.skipped).toHaveLength(1);
        expect(result.resolved[0].injectable.code).toBe("a();");
        expect(result.resolved[1].injectable.code).toBe("c();");
    });
});
