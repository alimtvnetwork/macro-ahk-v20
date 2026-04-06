/**
 * Unit tests — Injection Wrapper
 *
 * Tests the error isolation wrapper, config preamble, and SDK injection.
 */

import { describe, it, expect, vi } from "vitest";

/* ── Mock state-manager (used by injection-wrapper for projectId) ── */
vi.mock("@/background/state-manager", () => ({
    getActiveProjectId: () => "test-project-id",
}));

import { wrapWithIsolation } from "../../src/background/handlers/injection-wrapper";

describe("Injection Wrapper — wrapWithIsolation", () => {
    it("wraps code in an IIFE", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "doStuff();", order: 1 },
            null,
        );

        expect(result).toContain("(function()");
        expect(result).toContain("doStuff();");
        expect(result).toContain("})();");
    });

    it("wraps code in a try-catch block", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "riskyCall();", order: 1 },
            null,
        );

        expect(result).toContain("try {");
        expect(result).toContain("} catch (__marcoErr)");
    });

    it("sends USER_SCRIPT_ERROR on catch", () => {
        const result = wrapWithIsolation(
            { id: "test-script", code: "x();", order: 1 },
            null,
        );

        expect(result).toContain('type: "USER_SCRIPT_ERROR"');
        expect(result).toContain('"test-script"');
        expect(result).toContain("__marcoErr.message");
        expect(result).toContain("__marcoErr.stack");
    });

    it("includes config preamble when configJson is provided", () => {
        const configJson = '{"key":"value"}';
        const result = wrapWithIsolation(
            { id: "s1", code: "run();", order: 1 },
            configJson,
        );

        expect(result).toContain("window.__MARCO_CONFIG__");
        expect(result).toContain('{"key":"value"}');
    });

    it("does not include config preamble when configJson is null", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "run();", order: 1 },
            null,
        );

        expect(result).not.toContain("__MARCO_CONFIG__");
    });

    it("escapes script ID in JSON.stringify for safety", () => {
        const result = wrapWithIsolation(
            { id: 'script"with"quotes', code: "x();", order: 1 },
            null,
        );

        expect(result).toContain('script\\"with\\"quotes');
    });

    it("preserves multiline user code", () => {
        const multiline = "const a = 1;\nconst b = 2;\nconsole.log(a + b);";
        const result = wrapWithIsolation(
            { id: "s1", code: multiline, order: 1 },
            null,
        );

        expect(result).toContain("const a = 1;");
        expect(result).toContain("const b = 2;");
        expect(result).toContain("console.log(a + b);");
    });

    it("truncates scriptCode snippet to 500 chars", () => {
        const longCode = "x".repeat(1000);
        const result = wrapWithIsolation(
            { id: "s1", code: longCode, order: 1 },
            null,
        );

        const expectedSnippet = JSON.stringify("x".repeat(500));
        expect(result).toContain(`scriptCode: ${expectedSnippet}`);
    });

    it("handles empty code string", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "", order: 1 },
            null,
        );

        expect(result).toContain("try {");
        expect(result).toContain("} catch (__marcoErr)");
    });
});

describe("Injection Wrapper — Config Preamble Placement", () => {
    it("places config preamble before user code", () => {
        const config = '{"apiUrl":"https://api.test"}';
        const result = wrapWithIsolation(
            { id: "s1", code: "runApp();", order: 1 },
            config,
        );

        const configIdx = result.indexOf("window.__MARCO_CONFIG__");
        const codeIdx = result.indexOf("runApp();");
        expect(configIdx).toBeLessThan(codeIdx);
    });

    it("places config preamble inside the error-isolation IIFE", () => {
        const config = '{"a":1}';
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            config,
        );

        // The wrapper IIFE is the one containing "use strict" and try/catch
        const strictPos = result.indexOf('"use strict"');
        const configPos = result.indexOf("window.__MARCO_CONFIG__");
        const tryCatchPos = result.indexOf("} catch (__marcoErr)");

        expect(configPos).toBeGreaterThan(strictPos);
        expect(configPos).toBeLessThan(tryCatchPos);
    });

    it("handles complex nested config JSON", () => {
        const config = '{"nested":{"deep":{"value":42}},"arr":[1,2,3]}';
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            config,
        );

        expect(result).toContain(`window.__MARCO_CONFIG__ = ${config};`);
    });

    it("config preamble is placed before try block", () => {
        const config = '{"x":true}';
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            config,
        );

        const configPos = result.indexOf("window.__MARCO_CONFIG__");
        const tryPos = result.indexOf("try {");

        expect(configPos).toBeLessThan(tryPos);
    });
});

describe("Injection Wrapper — Prompt JSON Preamble (removed in v7.43)", () => {
    it("does NOT inject __MARCO_PROMPTS__ for any script (prompts now fetched dynamically via bridge)", () => {
        const result = wrapWithIsolation(
            { id: "default-macro-looping", name: "macro-looping.js", code: "window.__MARCO_PROMPTS__;", order: 1 },
            null,
        );

        expect(result).not.toContain("window.__MARCO_PROMPTS__ =");
    });
});

describe("Injection Wrapper — SDK Injection", () => {
    it("injects marco SDK before the error-isolation IIFE", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            null,
        );

        expect(result).toContain("window.marco");
        const sdkPos = result.indexOf("window.marco");
        const tryPos = result.indexOf("try {");
        expect(sdkPos).toBeLessThan(tryPos);
    });

    it("includes script and config context in SDK", () => {
        const result = wrapWithIsolation(
            { id: "my-script", code: "x();", order: 1, configBinding: "cfg-1" },
            null,
        );

        expect(result).toContain("my-script");
        expect(result).toContain("cfg-1");
        expect(result).toContain("projectId");
    });

    it("SDK is a frozen object", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            null,
        );

        expect(result).toContain("Object.freeze(window.marco.log)");
        expect(result).toContain("Object.freeze(window.marco.store)");
        expect(result).toContain("Object.freeze(window.marco)");
    });

    it("SDK includes logging methods", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            null,
        );

        expect(result).toContain("log:{info:");
        expect(result).toContain("warn:");
        expect(result).toContain("error:");
        expect(result).toContain("debug:");
    });

    it("SDK includes store methods", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            null,
        );

        expect(result).toContain("store:{");
        expect(result).toContain("set:");
        expect(result).toContain("get:");
        expect(result).toContain("delete:");
        expect(result).toContain("setGlobal:");
        expect(result).toContain("getGlobal:");
    });

    it("SDK skips marco creation if window.marco already exists but still bootstraps RiseupAsiaMacroExt", () => {
        const result = wrapWithIsolation(
            { id: "s1", code: "x();", order: 1 },
            null,
        );

        // When window.marco exists, it should still bootstrap RiseupAsiaMacroExt then return
        expect(result).toContain("if(window.marco){");
        expect(result).toContain("window.RiseupAsiaMacroExt");
        expect(result).toContain("return;");
    });
});
