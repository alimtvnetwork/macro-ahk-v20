import { describe, it, expect } from "vitest";

/**
 * Tests for the global project injection policy and auth token
 * resolution strategy. These are logic-level tests that validate
 * the algorithms without requiring chrome.* APIs.
 *
 * The actual injection handler uses chrome.scripting which can't
 * run in vitest, so we test the pure logic extracted here.
 */

/* ------------------------------------------------------------------ */
/*  Global Script Collection Logic                                     */
/* ------------------------------------------------------------------ */

interface MinimalProject {
    id: string;
    name: string;
    isGlobal?: boolean;
    scripts?: Array<{ path: string; order: number }>;
    dependencies?: Array<{ projectId: string; version: string }>;
}

/**
 * Mirrors the collectGlobalScripts logic from injection-handler.ts
 */
function collectGlobalScripts(globalProjects: MinimalProject[]): unknown[] {
    const scripts: unknown[] = [];
    for (const gp of globalProjects) {
        if (!gp.scripts?.length) continue;
        const baseOrder = -2000 + scripts.length;
        for (const script of gp.scripts) {
            scripts.push({ ...script, order: baseOrder + script.order });
        }
    }
    return scripts;
}

/**
 * Mirrors the global-aware dependency collection from prependDependencyScripts
 */
function collectRelevantProjectIds(
    activeProject: MinimalProject,
    allProjects: MinimalProject[],
): Set<string> {
    const relevantIds = new Set<string>([activeProject.id]);

    // Always include globals
    for (const p of allProjects) {
        if (p.isGlobal === true) relevantIds.add(p.id);
    }

    // Traverse explicit dependencies
    const queue = [...(activeProject.dependencies ?? []).map((d) => d.projectId)];
    while (queue.length > 0) {
        const depId = queue.shift()!;
        if (relevantIds.has(depId)) continue;
        relevantIds.add(depId);
        const depProject = allProjects.find((p) => p.id === depId);
        if (depProject?.dependencies) {
            for (const sub of depProject.dependencies) {
                if (!relevantIds.has(sub.projectId)) queue.push(sub.projectId);
            }
        }
    }

    return relevantIds;
}

describe("Global Project Injection Policy", () => {
    it("includes global projects even when active has no explicit deps", () => {
        const active: MinimalProject = { id: "my-project", name: "My Project" };
        const allProjects: MinimalProject[] = [
            active,
            { id: "sdk", name: "Macro SDK", isGlobal: true, scripts: [{ path: "sdk.js", order: 0 }] },
            { id: "xpath", name: "XPath Helpers", isGlobal: true, scripts: [{ path: "xpath.js", order: 0 }] },
        ];

        const ids = collectRelevantProjectIds(active, allProjects);
        expect(ids.has("sdk")).toBe(true);
        expect(ids.has("xpath")).toBe(true);
        expect(ids.has("my-project")).toBe(true);
    });

    it("includes both globals and explicit deps", () => {
        const active: MinimalProject = {
            id: "my-project", name: "My Project",
            dependencies: [{ projectId: "lib-a", version: "^1.0.0" }],
        };
        const allProjects: MinimalProject[] = [
            active,
            { id: "sdk", name: "SDK", isGlobal: true },
            { id: "lib-a", name: "Lib A" },
        ];

        const ids = collectRelevantProjectIds(active, allProjects);
        expect(ids.has("sdk")).toBe(true);
        expect(ids.has("lib-a")).toBe(true);
    });

    it("handles transitive deps alongside globals", () => {
        const active: MinimalProject = {
            id: "active", name: "Active",
            dependencies: [{ projectId: "lib-b", version: "1.0.0" }],
        };
        const allProjects: MinimalProject[] = [
            active,
            { id: "sdk", name: "SDK", isGlobal: true },
            { id: "lib-b", name: "Lib B", dependencies: [{ projectId: "lib-c", version: "1.0.0" }] },
            { id: "lib-c", name: "Lib C" },
        ];

        const ids = collectRelevantProjectIds(active, allProjects);
        expect(ids).toEqual(new Set(["active", "sdk", "lib-b", "lib-c"]));
    });

    it("does not duplicate globals that are also explicit deps", () => {
        const active: MinimalProject = {
            id: "active", name: "Active",
            dependencies: [{ projectId: "sdk", version: "^1.0.0" }],
        };
        const allProjects: MinimalProject[] = [
            active,
            { id: "sdk", name: "SDK", isGlobal: true },
        ];

        const ids = collectRelevantProjectIds(active, allProjects);
        expect([...ids]).toHaveLength(2); // active + sdk (no duplication)
    });
});

describe("collectGlobalScripts (fallback)", () => {
    it("returns empty for projects with no scripts", () => {
        const result = collectGlobalScripts([{ id: "sdk", name: "SDK", isGlobal: true }]);
        expect(result).toHaveLength(0);
    });

    it("collects scripts with negative order values", () => {
        const globals: MinimalProject[] = [
            { id: "sdk", name: "SDK", isGlobal: true, scripts: [
                { path: "sdk.js", order: 0 },
                { path: "helpers.js", order: 1 },
            ]},
        ];
        const result = collectGlobalScripts(globals);
        expect(result).toHaveLength(2);
        expect((result[0] as { order: number }).order).toBeLessThan(0);
        expect((result[1] as { order: number }).order).toBeLessThan(0);
    });

    it("preserves script order within a global project", () => {
        const globals: MinimalProject[] = [
            { id: "sdk", name: "SDK", isGlobal: true, scripts: [
                { path: "a.js", order: 0 },
                { path: "b.js", order: 1 },
            ]},
        ];
        const result = collectGlobalScripts(globals) as Array<{ order: number }>;
        expect(result[0].order).toBeLessThan(result[1].order);
    });

    it("orders scripts from first global before second global", () => {
        const globals: MinimalProject[] = [
            { id: "sdk", name: "SDK", isGlobal: true, scripts: [{ path: "sdk.js", order: 0 }] },
            { id: "xpath", name: "XPath", isGlobal: true, scripts: [{ path: "xpath.js", order: 0 }] },
        ];
        const result = collectGlobalScripts(globals) as Array<{ order: number; path: string }>;
        expect(result).toHaveLength(2);
        expect(result[0].path).toBe("sdk.js");
        expect(result[1].path).toBe("xpath.js");
    });
});

/* ------------------------------------------------------------------ */
/*  Auth Token Resolution Logic                                        */
/* ------------------------------------------------------------------ */

describe("Auth: isLikelyJwt", () => {
    // Mirror of the isLikelyJwt function from config-auth-handler.ts
    function isLikelyJwt(token: string): boolean {
        return token.startsWith("eyJ") && token.split(".").length === 3;
    }

    it("accepts valid JWT format", () => {
        expect(isLikelyJwt("eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature")).toBe(true);
    });

    it("rejects non-JWT strings", () => {
        expect(isLikelyJwt("not-a-jwt")).toBe(false);
        expect(isLikelyJwt("")).toBe(false);
        expect(isLikelyJwt("eyJ.only-two-parts")).toBe(false);
    });

    it("rejects cookie values that look similar", () => {
        expect(isLikelyJwt("abc123-session-cookie-value")).toBe(false);
    });
});

describe("Auth: buildAuthCookieHeader", () => {
    interface CookieLookupResult {
        value: string | null;
        cookieName: string | null;
    }

    function buildAuthCookieHeader(
        sessionLookup: CookieLookupResult,
        refreshLookup: CookieLookupResult,
    ): string {
        const parts: string[] = [];
        if (sessionLookup.value !== null) {
            parts.push(`${sessionLookup.cookieName ?? "lovable-session-id.id"}=${sessionLookup.value}`);
        }
        if (refreshLookup.value !== null) {
            parts.push(`${refreshLookup.cookieName ?? "lovable-session-id.refresh"}=${refreshLookup.value}`);
        }
        return parts.join("; ");
    }

    it("builds header with both session and refresh", () => {
        const header = buildAuthCookieHeader(
            { value: "sess-val", cookieName: "lovable-session-id-v2" },
            { value: "ref-val", cookieName: "lovable-session-id.refresh" },
        );
        expect(header).toBe("lovable-session-id-v2=sess-val; lovable-session-id.refresh=ref-val");
    });

    it("returns empty string when no cookies found", () => {
        const header = buildAuthCookieHeader(
            { value: null, cookieName: null },
            { value: null, cookieName: null },
        );
        expect(header).toBe("");
    });

    it("returns session only when no refresh", () => {
        const header = buildAuthCookieHeader(
            { value: "sess", cookieName: "lovable-session-id-v2" },
            { value: null, cookieName: null },
        );
        expect(header).toBe("lovable-session-id-v2=sess");
    });
});

describe("Auth: extractProjectIdFromUrl", () => {
    function extractProjectIdFromUrl(url: string): string | null {
        const pathMatch = url.match(/\/projects\/([^/?#]+)/);
        if (pathMatch) return pathMatch[1];

        try {
            const hostname = new URL(url).hostname;
            const firstLabel = hostname.split(".")[0] ?? "";

            const idPreviewMatch = firstLabel.match(/^id-preview--([a-f0-9-]{36})$/i);
            if (idPreviewMatch) return idPreviewMatch[1];

            const previewSuffixMatch = firstLabel.match(/^([a-f0-9-]{36})(?:--preview|-preview)$/i);
            if (previewSuffixMatch) return previewSuffixMatch[1];

            const bareUuidMatch = firstLabel.match(/^([a-f0-9-]{36})$/i);
            if (bareUuidMatch) return bareUuidMatch[1];
        } catch { /* ignore */ }

        return null;
    }

    const UUID = "584600b3-0bba-43a0-a09d-ab632bf4b5ac";

    it("extracts from /projects/{id} path", () => {
        expect(extractProjectIdFromUrl(`https://lovable.dev/projects/${UUID}`)).toBe(UUID);
    });

    it("extracts from id-preview--{uuid} subdomain", () => {
        expect(extractProjectIdFromUrl(`https://id-preview--${UUID}.lovable.app/`)).toBe(UUID);
    });

    it("extracts from {uuid}--preview subdomain", () => {
        expect(extractProjectIdFromUrl(`https://${UUID}--preview.lovable.app/`)).toBe(UUID);
    });

    it("extracts from bare UUID subdomain", () => {
        expect(extractProjectIdFromUrl(`https://${UUID}.lovableproject.com/`)).toBe(UUID);
    });

    it("returns null for unrelated URLs", () => {
        expect(extractProjectIdFromUrl("https://google.com/")).toBeNull();
    });
});
