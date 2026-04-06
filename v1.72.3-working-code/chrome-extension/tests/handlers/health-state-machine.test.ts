/**
 * Integration tests — Health State Machine Transitions
 *
 * Verifies HEALTHY → DEGRADED → ERROR → FATAL flow
 * and recovery paths via transitionHealth / recoverHealth.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    getHealthState,
    setHealthState,
} = await import("../../src/background/state-manager");

const {
    transitionHealth,
    recoverHealth,
} = await import("../../src/background/health-handler");

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
    resetMockStorage();
    setHealthState("HEALTHY");
});

/* ------------------------------------------------------------------ */
/*  Forward Transitions                                                */
/* ------------------------------------------------------------------ */

describe("Health State Machine — Forward Transitions", () => {
    it("transitions HEALTHY → DEGRADED", () => {
        transitionHealth("DEGRADED", "Elevated error rate");

        expect(getHealthState()).toBe("DEGRADED");
    });

    it("transitions HEALTHY → ERROR", () => {
        transitionHealth("ERROR", "Storage unavailable");

        expect(getHealthState()).toBe("ERROR");
    });

    it("transitions HEALTHY → FATAL", () => {
        transitionHealth("FATAL", "WASM crash");

        expect(getHealthState()).toBe("FATAL");
    });

    it("transitions DEGRADED → ERROR", () => {
        setHealthState("DEGRADED");
        transitionHealth("ERROR", "High error rate");

        expect(getHealthState()).toBe("ERROR");
    });

    it("transitions DEGRADED → FATAL", () => {
        setHealthState("DEGRADED");
        transitionHealth("FATAL", "Unrecoverable");

        expect(getHealthState()).toBe("FATAL");
    });

    it("transitions ERROR → FATAL", () => {
        setHealthState("ERROR");
        transitionHealth("FATAL", "Database corruption");

        expect(getHealthState()).toBe("FATAL");
    });

    it("walks full chain HEALTHY → DEGRADED → ERROR → FATAL", () => {
        expect(getHealthState()).toBe("HEALTHY");

        transitionHealth("DEGRADED", "Step 1");
        expect(getHealthState()).toBe("DEGRADED");

        transitionHealth("ERROR", "Step 2");
        expect(getHealthState()).toBe("ERROR");

        transitionHealth("FATAL", "Step 3");
        expect(getHealthState()).toBe("FATAL");
    });
});

/* ------------------------------------------------------------------ */
/*  Blocked Transitions (no upgrade via transitionHealth)              */
/* ------------------------------------------------------------------ */

describe("Health State Machine — Blocked Transitions", () => {
    it("does NOT transition DEGRADED → HEALTHY", () => {
        setHealthState("DEGRADED");
        transitionHealth("HEALTHY", "Attempted upgrade");

        expect(getHealthState()).toBe("DEGRADED");
    });

    it("does NOT transition ERROR → DEGRADED", () => {
        setHealthState("ERROR");
        transitionHealth("DEGRADED", "Attempted upgrade");

        expect(getHealthState()).toBe("ERROR");
    });

    it("does NOT transition ERROR → HEALTHY", () => {
        setHealthState("ERROR");
        transitionHealth("HEALTHY", "Attempted upgrade");

        expect(getHealthState()).toBe("ERROR");
    });

    it("does NOT transition FATAL → ERROR", () => {
        setHealthState("FATAL");
        transitionHealth("ERROR", "Attempted upgrade");

        expect(getHealthState()).toBe("FATAL");
    });

    it("does NOT transition FATAL → HEALTHY", () => {
        setHealthState("FATAL");
        transitionHealth("HEALTHY", "Attempted upgrade");

        expect(getHealthState()).toBe("FATAL");
    });

    it("stays at same level on same-state transition", () => {
        setHealthState("DEGRADED");
        transitionHealth("DEGRADED", "Same level");

        expect(getHealthState()).toBe("DEGRADED");
    });
});

/* ------------------------------------------------------------------ */
/*  Recovery                                                           */
/* ------------------------------------------------------------------ */

describe("Health State Machine — Recovery Paths", () => {
    it("recoverHealth resets DEGRADED → HEALTHY", () => {
        setHealthState("DEGRADED");
        recoverHealth();

        expect(getHealthState()).toBe("HEALTHY");
    });

    it("recoverHealth resets ERROR → HEALTHY", () => {
        setHealthState("ERROR");
        recoverHealth();

        expect(getHealthState()).toBe("HEALTHY");
    });

    it("recoverHealth resets FATAL → HEALTHY", () => {
        setHealthState("FATAL");
        recoverHealth();

        expect(getHealthState()).toBe("HEALTHY");
    });

    it("recoverHealth is idempotent when already HEALTHY", () => {
        recoverHealth();

        expect(getHealthState()).toBe("HEALTHY");
    });

    it("can degrade again after recovery", () => {
        transitionHealth("ERROR", "First failure");
        expect(getHealthState()).toBe("ERROR");

        recoverHealth();
        expect(getHealthState()).toBe("HEALTHY");

        transitionHealth("DEGRADED", "Second issue");
        expect(getHealthState()).toBe("DEGRADED");
    });

    it("full cycle: HEALTHY → FATAL → recover → DEGRADED → ERROR", () => {
        transitionHealth("FATAL", "Crash");
        expect(getHealthState()).toBe("FATAL");

        recoverHealth();
        expect(getHealthState()).toBe("HEALTHY");

        transitionHealth("DEGRADED", "Mild issue");
        expect(getHealthState()).toBe("DEGRADED");

        transitionHealth("ERROR", "Escalated");
        expect(getHealthState()).toBe("ERROR");
    });
});
