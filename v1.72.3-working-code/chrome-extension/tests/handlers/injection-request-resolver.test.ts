/**
 * Unit tests — Injection Request Resolver
 *
 * Tests type guards, sorting logic, and resolution dispatch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the script-resolver dependency
vi.mock("../../../src/background/script-resolver", () => ({
    resolveScriptBindings: vi.fn().mockResolvedValue({
        resolved: [],
        skipped: [],
    }),
}));

// Mock chrome.storage
beforeEach(() => {
    (globalThis as any).chrome = {
        storage: {
            local: { get: vi.fn().mockResolvedValue({}) },
            session: { get: vi.fn().mockResolvedValue({}) },
        },
    };
});

import { resolveInjectionRequestScripts } from "../../src/background/handlers/injection-request-resolver";

describe("resolveInjectionRequestScripts — Type Guards", () => {
    it("recognizes InjectableScript objects (with id, code, order)", async () => {
        const scripts = [
            { id: "script-1", code: "console.log('hi')", order: 1, name: "test" },
        ];

        const result = await resolveInjectionRequestScripts(scripts);
        expect(result.prepared.length).toBe(1);
        expect(result.prepared[0].injectable.id).toBe("script-1");
        expect(result.skipped.length).toBe(0);
    });

    it("marks non-injectable objects as skipped", async () => {
        const scripts = [
            { invalid: true },
        ];

        const result = await resolveInjectionRequestScripts(scripts);
        expect(result.prepared.length).toBe(0);
        expect(result.skipped.length).toBe(1);
    });

    it("handles empty scripts array", async () => {
        const result = await resolveInjectionRequestScripts([]);
        expect(result.prepared).toEqual([]);
        expect(result.skipped).toEqual([]);
    });
});

describe("resolveInjectionRequestScripts — Sorting", () => {
    it("sorts injectable scripts by order", async () => {
        const scripts = [
            { id: "b", code: "b()", order: 3, name: "b" },
            { id: "a", code: "a()", order: 1, name: "a" },
            { id: "c", code: "c()", order: 2, name: "c" },
        ];

        const result = await resolveInjectionRequestScripts(scripts);
        const ids = result.prepared.map((p) => p.injectable.id);
        expect(ids).toEqual(["a", "c", "b"]);
    });
});

describe("resolveInjectionRequestScripts — Project Entries", () => {
    it("detects project script entries (path + order, no code)", async () => {
        const { resolveScriptBindings } = await import("../../src/background/script-resolver");
        (resolveScriptBindings as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
            resolved: [
                {
                    injectable: { id: "resolved-1", code: "x()", order: 1 },
                    configJson: null,
                },
            ],
            skipped: [],
        });

        const scripts = [
            { path: "scripts/main.js", order: 1 },
        ];

        const result = await resolveInjectionRequestScripts(scripts);
        expect(result.prepared.length).toBe(1);
    });
});
