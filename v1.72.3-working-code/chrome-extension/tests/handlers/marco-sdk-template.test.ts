/**
 * Unit tests — Marco SDK Template
 *
 * Tests IIFE generation, context embedding, and string escaping.
 */

import { describe, it, expect } from "vitest";
import { buildMarcoSdkScript } from "../../src/background/marco-sdk-template";

describe("buildMarcoSdkScript", () => {
    it("generates an IIFE string", () => {
        const result = buildMarcoSdkScript({
            projectId: "proj-1",
            scriptId: "script-1",
            configId: "cfg-1",
            urlRuleId: "rule-1",
        });

        expect(result).toContain("(function(){");
        expect(result).toContain("})();");
    });

    it("embeds context values in output", () => {
        const result = buildMarcoSdkScript({
            projectId: "my-project",
            scriptId: "my-script",
            configId: "my-config",
            urlRuleId: "my-rule",
        });

        expect(result).toContain('"my-project"');
        expect(result).toContain('"my-script"');
        expect(result).toContain('"my-config"');
        expect(result).toContain('"my-rule"');
    });

    it("escapes double quotes in context values", () => {
        const result = buildMarcoSdkScript({
            projectId: 'has"quote',
            scriptId: "safe",
            configId: "",
            urlRuleId: "",
        });

        expect(result).toContain('has\\"quote');
        expect(result).not.toContain('has"quote');
    });

    it("escapes backslashes in context values", () => {
        const result = buildMarcoSdkScript({
            projectId: "path\\to\\project",
            scriptId: "s",
            configId: "",
            urlRuleId: "",
        });

        expect(result).toContain("path\\\\to\\\\project");
    });

    it("escapes newlines in context values", () => {
        const result = buildMarcoSdkScript({
            projectId: "line1\nline2",
            scriptId: "s",
            configId: "",
            urlRuleId: "",
        });

        expect(result).toContain("line1\\nline2");
        expect(result).not.toContain("line1\nline2\"");
    });

    it("creates window.marco with log, store, and context", () => {
        const result = buildMarcoSdkScript({
            projectId: "p",
            scriptId: "s",
            configId: "c",
            urlRuleId: "r",
        });

        expect(result).toContain("window.marco=");
        expect(result).toContain("marco.log");
        expect(result).toContain("marco.store");
        expect(result).toContain("context:Object.freeze");
    });

    it("guards against double initialization but bootstraps RiseupAsiaMacroExt", () => {
        const result = buildMarcoSdkScript({
            projectId: "p",
            scriptId: "s",
            configId: "",
            urlRuleId: "",
        });

        // When window.marco exists, should still ensure RiseupAsiaMacroExt then return
        expect(result).toContain("if(window.marco){");
        expect(result).toContain("window.RiseupAsiaMacroExt");
        expect(result).toContain("return;");
    });

    it("freezes the marco object", () => {
        const result = buildMarcoSdkScript({
            projectId: "p",
            scriptId: "s",
            configId: "",
            urlRuleId: "",
        });

        expect(result).toContain("Object.freeze(window.marco)");
    });

    it("handles empty context values", () => {
        const result = buildMarcoSdkScript({
            projectId: "",
            scriptId: "",
            configId: "",
            urlRuleId: "",
        });

        expect(result).toContain('projectId:""');
        expect(result).toContain('scriptId:""');
    });
});
