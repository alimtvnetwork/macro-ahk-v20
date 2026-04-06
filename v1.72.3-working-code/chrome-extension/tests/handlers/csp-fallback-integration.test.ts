/**
 * Integration tests — CSP Fallback Flow
 *
 * Seeds a project with scripts, simulates webNavigation,
 * mocks CSP rejection on MAIN world, and verifies automatic
 * ISOLATED world retry through the full auto-injector pipeline.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    simulateNavigation,
    getScriptingCalls,
} from "../mocks/chrome-storage";

installChromeMock();

vi.mock("../../../src/background/health-handler", () => ({
    transitionHealth: vi.fn(),
    recoverHealth: vi.fn(),
}));

const { registerAutoInjector, handleNavigationCompleted } = await import(
    "../../src/background/auto-injector"
);

const { transitionHealth } = await import(
    "../../../src/background/health-handler"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function seedProject(opts: {
    projectId?: string;
    urls: Array<{ pattern: string; matchType: string }>;
    scripts: Array<{ path: string; order: number; code: string; configBinding?: string }>;
    configs?: Array<{ id: string; json: string }>;
}): Promise<void> {
    const project = {
        id: opts.projectId ?? "csp-proj",
        name: "CSP Test Project",
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: opts.urls,
        scripts: opts.scripts.map((s) => ({
            path: s.path,
            order: s.order,
            runAt: "document_idle",
            configBinding: s.configBinding,
        })),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    const storedScripts = opts.scripts.map((s) => ({
        id: s.path,
        name: s.path,
        code: s.code,
        order: s.order,
        configBinding: s.configBinding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    const storedConfigs = (opts.configs ?? []).map((c) => ({
        id: c.id,
        name: `${c.id}.json`,
        json: c.json,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    }));

    await chrome.storage.local.set({
        marco_projects: [project],
        marco_scripts: storedScripts,
        marco_configs: storedConfigs,
    });
}

async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 15));
}

function getCallsForTab(tabId: number) {
    return getScriptingCalls().filter((c) => c.tabId === tabId);
}

/* ------------------------------------------------------------------ */
/*  CSP Fallback — Full Pipeline                                       */
/* ------------------------------------------------------------------ */

describe("Integration — CSP fallback through auto-injector", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
        vi.clearAllMocks();
    });

    it("retries in ISOLATED world when MAIN is CSP-blocked", async () => {
        await seedProject({
            urls: [{ pattern: "https://strict-csp.test/*", matchType: "glob" }],
            scripts: [{ path: "widget.js", order: 1, code: "initWidget()" }],
        });

        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async (details: any) => {
            callCount++;
            if (callCount === 1) {
                throw new Error(
                    "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not allowed",
                );
            }
            return [{ result: null }];
        };

        handleNavigationCompleted({ tabId: 900, url: "https://strict-csp.test/page", frameId: 0 });
        await flush();

        // Two calls: MAIN (rejected) → ISOLATED (success)
        expect(callCount).toBe(2);
    });

    it("transitions health to DEGRADED on CSP fallback", async () => {
        await seedProject({
            urls: [{ pattern: "https://csp-health.test/*", matchType: "glob" }],
            scripts: [{ path: "health.js", order: 1, code: "check()" }],
        });

        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error("Content Security Policy directive violated");
            }
            return [{ result: null }];
        };

        handleNavigationCompleted({ tabId: 901, url: "https://csp-health.test/app", frameId: 0 });
        await flush();

        expect(transitionHealth).toHaveBeenCalledWith("DEGRADED", "CSP fallback active");
    });

    it("injects all scripts even when first triggers CSP fallback", async () => {
        await seedProject({
            urls: [{ pattern: "https://multi-csp.test/*", matchType: "glob" }],
            scripts: [
                { path: "first.js", order: 1, code: "first()" },
                { path: "second.js", order: 2, code: "second()" },
            ],
        });

        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            // First call (MAIN for script 1) fails with CSP
            if (callCount === 1) {
                throw new Error("Content Security Policy blocked eval");
            }
            return [{ result: null }];
        };

        handleNavigationCompleted({ tabId: 902, url: "https://multi-csp.test/page", frameId: 0 });
        await flush();

        // script 1: MAIN (fail) + ISOLATED (ok) = 2 calls
        // script 2: MAIN (ok) = 1 call
        // Total = 3 (or 4 if script 2 also hits CSP on MAIN then retries)
        expect(callCount).toBeGreaterThanOrEqual(3);
    });

    it("retries in ISOLATED world when MAIN fails with Osano-style appendChild parse error", async () => {
        await seedProject({
            urls: [{ pattern: "https://osano-block.test/*", matchType: "glob" }],
            scripts: [{ path: "osano.js", order: 1, code: "initOsanoCase()" }],
        });

        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error("Failed to execute 'appendChild' on 'Node': Unexpected identifier 'let' at HTMLHeadElement.value [as appendChild] (osano.js:1:50218)");
            }
            return [{ result: null }];
        };

        handleNavigationCompleted({ tabId: 903, url: "https://osano-block.test/page", frameId: 0 });
        await flush();

        expect(callCount).toBe(2);
        expect(transitionHealth).toHaveBeenCalledWith("DEGRADED", "CSP fallback active");
    });

    it("DOES retry for non-CSP errors in MAIN world (v7.27: all MAIN failures trigger fallback)", async () => {
        await seedProject({
            urls: [{ pattern: "https://non-csp.test/*", matchType: "glob" }],
            scripts: [{ path: "broken.js", order: 1, code: "broken()" }],
        });

        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            throw new Error("Cannot access contents of the page");
        };

        handleNavigationCompleted({ tabId: 904, url: "https://non-csp.test/page", frameId: 0 });
        await flush();

        // v7.27: All MAIN world errors now trigger the full 4-tier fallback chain
        expect(callCount).toBeGreaterThan(1);
        expect(transitionHealth).toHaveBeenCalledWith("DEGRADED", "CSP fallback active");
    });

    it("handles total failure when both MAIN and ISOLATED are blocked", async () => {
        await seedProject({
            urls: [{ pattern: "https://total-block.test/*", matchType: "glob" }],
            scripts: [{ path: "blocked.js", order: 1, code: "blocked()" }],
        });

        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw new Error("Content Security Policy violation");
        };

        handleNavigationCompleted({ tabId: 904, url: "https://total-block.test/page", frameId: 0 });
        await flush();

        // Should not throw — error is handled gracefully
        expect(transitionHealth).toHaveBeenCalledWith("DEGRADED", "CSP fallback active");
    });

    it("CSP fallback works with config-bound scripts", async () => {
        await seedProject({
            urls: [{ pattern: "https://cfg-csp.test/*", matchType: "glob" }],
            scripts: [
                {
                    path: "configured.js",
                    order: 1,
                    code: "init(window.__MARCO_CONFIG__)",
                    configBinding: "app-cfg",
                },
            ],
            configs: [{ id: "app-cfg", json: '{"env":"test"}' }],
        });

        let callCount = 0;
        const capturedWorlds: string[] = [];
        (globalThis as any).chrome.scripting.executeScript = async (details: any) => {
            callCount++;
            capturedWorlds.push(details.world);
            if (callCount === 1) {
                throw new Error("Refused to evaluate due to Content Security Policy");
            }
            return [{ result: null }];
        };

        handleNavigationCompleted({ tabId: 905, url: "https://cfg-csp.test/dashboard", frameId: 0 });
        await flush();

        expect(callCount).toBe(2);
        expect(capturedWorlds[0]).toBe("MAIN");
        expect(capturedWorlds[1]).toBe("ISOLATED");
    });

    it("captures world transition from MAIN to ISOLATED in calls", async () => {
        await seedProject({
            urls: [{ pattern: "https://world-track.test/*", matchType: "glob" }],
            scripts: [{ path: "track.js", order: 1, code: "track()" }],
        });

        const capturedWorlds: string[] = [];
        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async (details: any) => {
            callCount++;
            capturedWorlds.push(details.world);
            if (callCount === 1) {
                throw new Error("unsafe-eval is not an allowed source");
            }
            return [{ result: null }];
        };

        handleNavigationCompleted({ tabId: 906, url: "https://world-track.test/page", frameId: 0 });
        await flush();

        expect(capturedWorlds).toEqual(["MAIN", "ISOLATED"]);
    });
});
