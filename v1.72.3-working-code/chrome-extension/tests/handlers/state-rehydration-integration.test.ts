/**
 * Integration test — State Manager Rehydration
 *
 * Tests the full state lifecycle: set state → persist →
 * rehydrate → verify all fields restored.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, setMockTabs, getMockSessionSnapshot } from "../mocks/chrome-storage";

installChromeMock();

const {
    setActiveProjectId,
    getActiveProjectId,
    setTabInjection,
    getTabInjections,
    removeTabInjection,
    setHealthState,
    getHealthState,
    setCurrentSessionId,
    getCurrentSessionId,
    setPersistenceMode,
    saveTransientState,
    rehydrateState,
} = await import("../../src/background/state-manager");

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("State Manager — Rehydration Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        // Reset module state
        setActiveProjectId(null);
        setHealthState("HEALTHY");
        setCurrentSessionId("");
        setPersistenceMode("memory");
    });

    it("roundtrips active project ID through session storage", async () => {
        setActiveProjectId("project-abc");
        await saveTransientState();

        // Simulate service worker restart
        setActiveProjectId(null);
        setMockTabs([]);
        await rehydrateState();

        expect(getActiveProjectId()).toBe("project-abc");
    });

    it("roundtrips health state through session storage", async () => {
        setHealthState("DEGRADED");
        await saveTransientState();

        setHealthState("HEALTHY");
        setMockTabs([]);
        await rehydrateState();

        expect(getHealthState()).toBe("DEGRADED");
    });

    it("roundtrips session ID through session storage", async () => {
        setCurrentSessionId("session-xyz");
        await saveTransientState();

        setCurrentSessionId("");
        setMockTabs([]);
        await rehydrateState();

        expect(getCurrentSessionId()).toBe("session-xyz");
    });

    it("roundtrips tab injections through session storage", async () => {
        setTabInjection(42, {
            scriptIds: ["script-1", "script-2"],
            timestamp: "2026-02-28T00:00:00Z",
            projectId: "proj-1",
            matchedRuleId: "rule-1",
        });

        await saveTransientState();

        // Simulate restart - tab 42 still exists
        setMockTabs([{ id: 42 }]);
        await rehydrateState();

        const injections = getTabInjections();
        expect(injections[42]).toBeDefined();
        expect(injections[42].scriptIds).toEqual(["script-1", "script-2"]);
    });

    it("prunes closed tabs during rehydration", async () => {
        setTabInjection(42, {
            scriptIds: ["script-1"],
            timestamp: "2026-02-28T00:00:00Z",
            projectId: "proj-1",
            matchedRuleId: "rule-1",
        });

        setTabInjection(99, {
            scriptIds: ["script-2"],
            timestamp: "2026-02-28T00:00:00Z",
            projectId: "proj-1",
            matchedRuleId: "rule-2",
        });

        await saveTransientState();

        // Only tab 42 still open after restart
        setMockTabs([{ id: 42 }]);
        await rehydrateState();

        const injections = getTabInjections();
        expect(injections[42]).toBeDefined();
        expect(injections[99]).toBeUndefined();
    });

    it("uses default state when no session data exists", async () => {
        setMockTabs([]);
        await rehydrateState();

        expect(getActiveProjectId()).toBeNull();
        expect(getHealthState()).toBe("HEALTHY");
        expect(getCurrentSessionId()).toBe("");
    });

    it("removeTabInjection cleans up correctly", () => {
        setTabInjection(42, {
            scriptIds: ["s1"],
            timestamp: "2026-02-28T00:00:00Z",
            projectId: "p1",
            matchedRuleId: "r1",
        });

        expect(getTabInjections()[42]).toBeDefined();

        removeTabInjection(42);
        expect(getTabInjections()[42]).toBeUndefined();
    });

    it("saves transient state to session storage", async () => {
        setActiveProjectId("test-project");
        setHealthState("ERROR");
        await saveTransientState();

        const snapshot = getMockSessionSnapshot();
        expect(snapshot["marco_transient_state"]).toBeDefined();

        const state = snapshot["marco_transient_state"] as any;
        expect(state.activeProjectId).toBe("test-project");
        expect(state.healthState).toBe("ERROR");
        expect(state.lastFlushTimestamp).toBeTruthy();
    });
});
