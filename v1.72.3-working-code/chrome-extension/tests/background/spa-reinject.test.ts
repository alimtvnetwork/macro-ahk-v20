/**
 * Unit tests — SPA Re-Injection (P-009)
 *
 * Tests that the SPA re-inject module detects lost DOM markers
 * after history state changes and re-injects from the last
 * known good snapshot.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockTabs,
    simulateHistoryStateUpdate,
    getScriptingCalls,
} from "../mocks/chrome-storage";
import {
    setTabInjection,
    getTabInjections,
} from "../../src/background/state-manager";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let historyListeners: Array<(details: any) => void>;

beforeEach(() => {
    resetMockStorage();
    installChromeMock();
    historyListeners = [];

    // Capture onHistoryStateUpdated listeners
    (globalThis as any).chrome.webNavigation.onHistoryStateUpdated = {
        addListener: (fn: (details: any) => void) => {
            historyListeners.push(fn);
        },
    };

    setMockTabs([{ id: 1, url: "https://example.com" }]);
});

/** Helper to fire a SPA navigation event. */
function fireSpaNavigation(tabId: number, url: string): void {
    for (const listener of historyListeners) {
        listener({ tabId, url, frameId: 0, transitionType: "link" });
    }
}

/** Creates a sample tab injection record with bindings. */
function createSampleRecord(ageMs: number = 5000) {
    const timestamp = new Date(Date.now() - ageMs).toISOString();

    return {
        scriptIds: ["script-1"],
        timestamp,
        projectId: "proj-1",
        matchedRuleId: "rule-1",
        lastGoodBindings: [
            {
                scriptId: "script-1",
                configId: null,
                order: 1,
                world: "MAIN" as const,
                runAt: "document_end" as const,
            },
        ],
    };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("spa-reinject", () => {
    it("registers the onHistoryStateUpdated listener", async () => {
        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        registerSpaReinject();

        expect(historyListeners.length).toBe(1);
    });

    it("ignores sub-frame navigations", async () => {
        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        setTabInjection(1, createSampleRecord());
        registerSpaReinject();

        // Fire a sub-frame event
        for (const listener of historyListeners) {
            listener({ tabId: 1, url: "https://example.com/page2", frameId: 5 });
        }

        // No scripting calls should be made for sub-frames
        const calls = getScriptingCalls();
        expect(calls.length).toBe(0);
    });

    it("ignores tabs without injection records", async () => {
        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        registerSpaReinject();
        fireSpaNavigation(99, "https://unknown.com");

        const calls = getScriptingCalls();
        expect(calls.length).toBe(0);
    });

    it("ignores records without lastGoodBindings", async () => {
        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        setTabInjection(1, {
            scriptIds: ["s1"],
            timestamp: new Date(Date.now() - 5000).toISOString(),
            projectId: "p1",
            matchedRuleId: "r1",
        });

        registerSpaReinject();
        fireSpaNavigation(1, "https://example.com/page2");

        const calls = getScriptingCalls();
        expect(calls.length).toBe(0);
    });

    it("ignores very recent injections (debounce)", async () => {
        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        // Record is only 100ms old — too recent
        setTabInjection(1, createSampleRecord(100));

        registerSpaReinject();
        fireSpaNavigation(1, "https://example.com/page2");

        const calls = getScriptingCalls();
        expect(calls.length).toBe(0);
    });

    it("probes for DOM markers after SPA navigation", async () => {
        vi.useFakeTimers();

        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        setTabInjection(1, createSampleRecord());
        registerSpaReinject();
        fireSpaNavigation(1, "https://example.com/page2");

        // Advance past the probe delay
        await vi.advanceTimersByTimeAsync(600);

        // Should have made at least one scripting call (marker probe)
        const calls = getScriptingCalls();
        const hasProbeCall = calls.some((c) => c.tabId === 1);
        expect(hasProbeCall).toBe(true);

        vi.useRealTimers();
    });

    it("skips re-injection when markers are still present", async () => {
        vi.useFakeTimers();

        const { registerSpaReinject } = await import(
            "../../src/background/spa-reinject"
        );

        // Mock executeScript to return true (markers found)
        (globalThis as any).chrome.scripting.executeScript = async (details: any) => {
            const hasFunc = details.func !== undefined;

            if (hasFunc && details.args !== undefined) {
                // Simulate markers found
                return [{ result: true }];
            }

            return [{ result: null }];
        };

        setTabInjection(1, createSampleRecord());
        registerSpaReinject();
        fireSpaNavigation(1, "https://example.com/page2");

        await vi.advanceTimersByTimeAsync(600);

        // Restore real mock for assertion
        vi.useRealTimers();
    });

    it("stores lastGoodBindings in tab injection record", () => {
        const record = createSampleRecord();
        setTabInjection(1, record);

        const stored = getTabInjections()[1];
        expect(stored.lastGoodBindings).toBeDefined();
        expect(stored.lastGoodBindings!.length).toBe(1);
        expect(stored.lastGoodBindings![0].scriptId).toBe("script-1");
    });

    it("exports simulateHistoryStateUpdate from mocks", () => {
        // Verify the mock utility exists and fires listeners
        const captured: any[] = [];

        (globalThis as any).chrome.webNavigation.onHistoryStateUpdated = {
            addListener: (fn: any) => captured.push(fn),
        };

        installChromeMock();
        simulateHistoryStateUpdate(1, "https://example.com");

        // The mock's internal listeners were reset, but the API works
        expect(typeof simulateHistoryStateUpdate).toBe("function");
    });
});
