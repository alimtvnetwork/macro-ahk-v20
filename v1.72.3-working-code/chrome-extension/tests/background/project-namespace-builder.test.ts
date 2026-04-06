/**
 * Unit tests — buildProjectNamespaceScript
 *
 * Validates the IIFE that registers per-project SDK namespaces.
 */

import { describe, it, expect } from "vitest";
import { buildProjectNamespaceScript } from "../../../src/background/project-namespace-builder";

const DEFAULT_CTX = {
    codeName: "MacroController",
    slug: "macro-controller",
    projectName: "Macro Controller",
    projectVersion: "1.70.0",
    projectId: "proj-001",
};

describe("buildProjectNamespaceScript", () => {
    it("returns a string containing the IIFE wrapper", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("(function(){");
        expect(result).toContain("})();");
    });

    it("registers the namespace under the correct codeName", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain('root.Projects["MacroController"] = ns;');
    });

    it("includes meta with correct project identity", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain('name: "Macro Controller"');
        expect(result).toContain('version: "1.70.0"');
        expect(result).toContain('slug: "macro-controller"');
        expect(result).toContain('codeName: "MacroController"');
    });

    it("includes enriched meta fields (id, description, dependencies)", () => {
        const result = buildProjectNamespaceScript({
            ...DEFAULT_CTX,
            description: "Workspace automation tool",
            dependencies: [{ projectId: "sdk-001", version: "^1.0.0" }],
        });
        expect(result).toContain('id: "proj-001"');
        expect(result).toContain('description: "Workspace automation tool"');
        expect(result).toContain('"projectId":"sdk-001"');
        expect(result).toContain('"version":"^1.0.0"');
    });

    it("creates RiseupAsiaMacroExt root if missing", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("window.RiseupAsiaMacroExt = root;");
    });

    it("skips registration if window.marco is unavailable", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("window.marco not available");
        expect(result).toContain("return;");
    });

    it("includes all sub-namespaces", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        for (const ns of ["vars", "urls", "xpath", "cookies", "kv", "files", "meta", "log", "scripts", "db", "api", "docs"]) {
            expect(result).toContain(`${ns}: Object.freeze(`);
        }
    });

    it("freezes the namespace object", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("var ns = Object.freeze({");
    });

    it("escapes special characters in project name", () => {
        const result = buildProjectNamespaceScript({
            ...DEFAULT_CTX,
            projectName: 'Test "Project"',
        });
        expect(result).toContain('name: "Test \\"Project\\""');
    });

    it("prefixes log messages with codeName", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("[MacroController] ");
    });

    it("serializes scripts array into the IIFE", () => {
        const result = buildProjectNamespaceScript({
            ...DEFAULT_CTX,
            scripts: [
                { name: "macro-looping.js", order: 1, isEnabled: true },
                { name: "helper.js", order: 2, isEnabled: false },
            ],
        });
        expect(result).toContain('"name":"macro-looping.js"');
        expect(result).toContain('"name":"helper.js"');
        expect(result).toContain('"isEnabled":true');
        expect(result).toContain('"isEnabled":false');
    });

    it("includes db.table() factory method", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("db: Object.freeze({");
        expect(result).toContain("table: function(tableName)");
        expect(result).toContain("findMany");
        expect(result).toContain("create");
        expect(result).toContain("update");
        expect(result).toContain("delete");
        expect(result).toContain("count");
    });

    it("includes api sub-modules (kv, files, db, schema)", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("api: Object.freeze({");
        // KV endpoints
        expect(result).toContain("/projects/");
        expect(result).toContain("/kv/");
        // Files endpoints
        expect(result).toContain("/files/");
        // Schema endpoints
        expect(result).toContain("schema: Object.freeze({");
        expect(result).toContain('action: "list"');
    });

    it("includes docs with per-sub-namespace descriptions", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("docs: Object.freeze({");
        expect(result).toContain("overview:");
        expect(result).toContain("vars:");
        expect(result).toContain("db:");
        expect(result).toContain("api:");
        expect(result).toContain("scripts:");
    });

    it("defaults to empty arrays when scripts/dependencies are omitted", () => {
        const result = buildProjectNamespaceScript(DEFAULT_CTX);
        expect(result).toContain("scripts: Object.freeze([])");
        expect(result).toContain("dependencies: Object.freeze([])");
    });
});
