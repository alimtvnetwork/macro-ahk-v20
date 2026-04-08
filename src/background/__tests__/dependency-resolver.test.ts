import { describe, it, expect } from "vitest";
import {
    resolveInjectionOrder,
    satisfiesVersion,
    type ProjectNode,
} from "@/background/dependency-resolver";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeNode(overrides: Partial<ProjectNode> & { id: string }): ProjectNode {
    return {
        name: overrides.id,
        version: "1.0.0",
        isGlobal: false,
        dependencies: [],
        ...overrides,
    };
}

/* ------------------------------------------------------------------ */
/*  satisfiesVersion                                                   */
/* ------------------------------------------------------------------ */

describe("satisfiesVersion", () => {
    it("exact match passes", () => {
        expect(satisfiesVersion("1.2.3", "1.2.3")).toBe(true);
    });

    it("exact match rejects different patch", () => {
        expect(satisfiesVersion("1.2.4", "1.2.3")).toBe(false);
    });

    it("caret range passes within same major", () => {
        expect(satisfiesVersion("1.5.0", "^1.0.0")).toBe(true);
    });

    it("caret range rejects different major", () => {
        expect(satisfiesVersion("2.0.0", "^1.0.0")).toBe(false);
    });

    it("tilde range passes within same minor", () => {
        expect(satisfiesVersion("1.2.9", "~1.2.0")).toBe(true);
    });

    it("tilde range rejects different minor", () => {
        expect(satisfiesVersion("1.3.0", "~1.2.0")).toBe(false);
    });

    it("non-semver falls back to string equality", () => {
        expect(satisfiesVersion("latest", "latest")).toBe(true);
        expect(satisfiesVersion("latest", "stable")).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  resolveInjectionOrder                                              */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
describe("resolveInjectionOrder", () => {
    it("single project returns its ID", () => {
        const result = resolveInjectionOrder([makeNode({ id: "A" })]);
        expect(result.isSuccess).toBe(true);
        expect(result.order).toEqual(["A"]);
    });

    it("resolves simple A→B dependency (B first)", () => {
        const result = resolveInjectionOrder([
            makeNode({ id: "A", dependencies: [{ projectId: "B", version: "^1.0.0" }] }),
            makeNode({ id: "B" }),
        ]);
        expect(result.isSuccess).toBe(true);
        expect(result.order.indexOf("B")).toBeLessThan(result.order.indexOf("A"));
    });

    it("global projects sort before non-global at same degree", () => {
        const result = resolveInjectionOrder([
            makeNode({ id: "non-global" }),
            makeNode({ id: "global-sdk", isGlobal: true }),
        ]);
        expect(result.isSuccess).toBe(true);
        expect(result.order[0]).toBe("global-sdk");
    });

    it("global projects load before active project even without explicit dep", () => {
        // This simulates the implicit global dependency policy
        const nodes: ProjectNode[] = [
            makeNode({ id: "active-project" }),
            makeNode({ id: "macro-sdk", isGlobal: true }),
            makeNode({ id: "xpath-helpers", isGlobal: true }),
        ];
        const result = resolveInjectionOrder(nodes);
        expect(result.isSuccess).toBe(true);
        // Both globals should appear before active-project
        const activeIdx = result.order.indexOf("active-project");
        expect(result.order.indexOf("macro-sdk")).toBeLessThan(activeIdx);
        expect(result.order.indexOf("xpath-helpers")).toBeLessThan(activeIdx);
    });

    it("detects circular dependencies", () => {
        const result = resolveInjectionOrder([
            makeNode({ id: "A", dependencies: [{ projectId: "B", version: "1.0.0" }] }),
            makeNode({ id: "B", dependencies: [{ projectId: "A", version: "1.0.0" }] }),
        ]);
        expect(result.isSuccess).toBe(false);
        expect(result.errorMessage).toContain("Circular dependency");
    });

    it("rejects unknown dependency reference", () => {
        const result = resolveInjectionOrder([
            makeNode({ id: "A", dependencies: [{ projectId: "missing", version: "1.0.0" }] }),
        ]);
        expect(result.isSuccess).toBe(false);
        expect(result.errorMessage).toContain("missing");
    });

    it("rejects version mismatch", () => {
        const result = resolveInjectionOrder([
            makeNode({ id: "A", dependencies: [{ projectId: "B", version: "^2.0.0" }] }),
            makeNode({ id: "B", version: "1.5.0" }),
        ]);
        expect(result.isSuccess).toBe(false);
        expect(result.errorMessage).toContain("Version mismatch");
    });

    it("handles transitive deps: A→B→C (order: C, B, A)", () => {
        const result = resolveInjectionOrder([
            makeNode({ id: "A", dependencies: [{ projectId: "B", version: "^1.0.0" }] }),
            makeNode({ id: "B", dependencies: [{ projectId: "C", version: "^1.0.0" }] }),
            makeNode({ id: "C" }),
        ]);
        expect(result.isSuccess).toBe(true);
        expect(result.order.indexOf("C")).toBeLessThan(result.order.indexOf("B"));
        expect(result.order.indexOf("B")).toBeLessThan(result.order.indexOf("A"));
    });

    it("global + explicit dep: global first, then dep, then active", () => {
        const result = resolveInjectionOrder([
            makeNode({
                id: "active",
                dependencies: [{ projectId: "lib", version: "^1.0.0" }],
            }),
            makeNode({ id: "lib" }),
            makeNode({ id: "sdk", isGlobal: true }),
        ]);
        expect(result.isSuccess).toBe(true);
        // sdk (global) → lib (dep) → active
        expect(result.order.indexOf("sdk")).toBeLessThan(result.order.indexOf("active"));
        expect(result.order.indexOf("lib")).toBeLessThan(result.order.indexOf("active"));
    });

    it("diamond dependency resolves without duplication", () => {
        // A→B, A→C, B→D, C→D
        const result = resolveInjectionOrder([
            makeNode({ id: "A", dependencies: [
                { projectId: "B", version: "1.0.0" },
                { projectId: "C", version: "1.0.0" },
            ]}),
            makeNode({ id: "B", dependencies: [{ projectId: "D", version: "1.0.0" }] }),
            makeNode({ id: "C", dependencies: [{ projectId: "D", version: "1.0.0" }] }),
            makeNode({ id: "D" }),
        ]);
        expect(result.isSuccess).toBe(true);
        expect(result.order).toHaveLength(4);
        expect(result.order.indexOf("D")).toBeLessThan(result.order.indexOf("B"));
        expect(result.order.indexOf("D")).toBeLessThan(result.order.indexOf("C"));
    });
});
