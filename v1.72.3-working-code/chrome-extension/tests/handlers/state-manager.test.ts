/**
 * Unit tests — State Manager
 *
 * Tests rehydrateState, saveTransientState, tab pruning,
 * and getter/setter round-trips against mocked chrome APIs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getMockSessionSnapshot,
    setMockTabs,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    rehydrateState,
    saveTransientState,
    getActiveProjectId,
    setActiveProjectId,
    getTabInjections,
    setTabInjection,
    removeTabInjection,
    getHealthState,
    setHealthState,
    getCurrentSessionId,
    setCurrentSessionId,
    setPersistenceMode,
} = await import("../../src/background/state-manager");

/** Builds a sample TransientState for seeding session storage. */
function sampleState(overrides: Record<string, unknown> = {}) {
    return {
        activeProjectId: "proj-1",
        tabInjections: {
            10: {
                scriptIds: ["s1"],
                timestamp: "2026-01-01T00:00:00Z",
                projectId: "proj-1",
                matchedRuleId: "rule-1",
            },
            20: {
                scriptIds: ["s2"],
                timestamp: "2026-01-01T00:00:00Z",
                projectId: "proj-1",
                matchedRuleId: "rule-2",
            },
        },
        healthState: "DEGRADED",
        currentSessionId: "session-abc",
        persistenceMode: "opfs",
        lastFlushTimestamp: "2026-01-01T00:00:00Z",
        ...overrides,
    };
}

describe("State Manager — rehydrateState", () => {
    beforeEach(() => {
        resetMockStorage();
        setMockTabs([]);
        setActiveProjectId(null);
        setHealthState("HEALTHY");
        setCurrentSessionId("");
        setPersistenceMode("memory");
    });

    it("restores state from chrome.storage.session", async () => {
        setMockTabs([{ id: 10 }, { id: 20 }]);
        await chrome.storage.session.set({ marco_transient_state: sampleState() });

        await rehydrateState();

        expect(getActiveProjectId()).toBe("proj-1");
        expect(getHealthState()).toBe("DEGRADED");
        expect(getCurrentSessionId()).toBe("session-abc");
    });

    it("uses defaults when no state is stored", async () => {
        await rehydrateState();

        expect(getActiveProjectId()).toBeNull();
        expect(getHealthState()).toBe("HEALTHY");
        expect(getCurrentSessionId()).toBe("");
    });

    it("restores tab injections for valid tabs", async () => {
        setMockTabs([{ id: 10 }, { id: 20 }]);
        await chrome.storage.session.set({ marco_transient_state: sampleState() });

        await rehydrateState();

        const injections = getTabInjections();
        expect(Object.keys(injections)).toHaveLength(2);
        expect(injections[10].scriptIds).toEqual(["s1"]);
    });
});

describe("State Manager — tab pruning", () => {
    beforeEach(() => {
        resetMockStorage();
        setMockTabs([]);
        setActiveProjectId(null);
        setHealthState("HEALTHY");
        setCurrentSessionId("");
        setPersistenceMode("memory");
    });

    it("removes injections for tabs that no longer exist", async () => {
        setMockTabs([{ id: 10 }]); // tab 20 is gone
        await chrome.storage.session.set({ marco_transient_state: sampleState() });

        await rehydrateState();

        const injections = getTabInjections();
        expect(Object.keys(injections)).toHaveLength(1);
        expect(injections[10]).toBeDefined();
        expect(injections[20]).toBeUndefined();
    });

    it("removes all injections when no tabs exist", async () => {
        setMockTabs([]);
        await chrome.storage.session.set({ marco_transient_state: sampleState() });

        await rehydrateState();

        expect(Object.keys(getTabInjections())).toHaveLength(0);
    });
});

describe("State Manager — saveTransientState", () => {
    beforeEach(() => {
        resetMockStorage();
        setActiveProjectId(null);
        setHealthState("HEALTHY");
        setCurrentSessionId("");
        setPersistenceMode("memory");
    });

    it("persists current state to chrome.storage.session", async () => {
        setActiveProjectId("proj-42");
        setHealthState("ERROR");
        setCurrentSessionId("sess-xyz");
        setPersistenceMode("opfs");

        await saveTransientState();

        const snapshot = getMockSessionSnapshot();
        const state = snapshot["marco_transient_state"] as any;

        expect(state.activeProjectId).toBe("proj-42");
        expect(state.healthState).toBe("ERROR");
        expect(state.currentSessionId).toBe("sess-xyz");
        expect(state.persistenceMode).toBe("opfs");
        expect(state.lastFlushTimestamp).toBeTruthy();
    });

    it("includes tab injections in saved state", async () => {
        setTabInjection(99, {
            scriptIds: ["s5"],
            timestamp: "2026-02-01T00:00:00Z",
            projectId: "proj-9",
            matchedRuleId: "rule-9",
        });

        await saveTransientState();

        const snapshot = getMockSessionSnapshot();
        const state = snapshot["marco_transient_state"] as any;

        expect(state.tabInjections[99].scriptIds).toEqual(["s5"]);
    });
});

describe("State Manager — getters/setters", () => {
    beforeEach(() => {
        setActiveProjectId(null);
        setHealthState("HEALTHY");
        setCurrentSessionId("");
    });

    it("setTabInjection and removeTabInjection work correctly", () => {
        setTabInjection(1, {
            scriptIds: ["a"],
            timestamp: "t",
            projectId: "p",
            matchedRuleId: "r",
        });

        expect(getTabInjections()[1]).toBeDefined();

        removeTabInjection(1);
        expect(getTabInjections()[1]).toBeUndefined();
    });

    it("health state round-trips", () => {
        setHealthState("FATAL");
        expect(getHealthState()).toBe("FATAL");
    });
});
