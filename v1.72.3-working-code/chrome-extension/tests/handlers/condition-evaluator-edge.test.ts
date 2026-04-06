/**
 * Edge-case tests — Condition Evaluator
 *
 * Covers requireCookie, requireElement, minDelayMs, and
 * requireOnline edge cases that block or allow injection.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockCookie,
} from "../mocks/chrome-storage";

installChromeMock();

const { evaluateConditions } = await import(
    "../../src/background/condition-evaluator"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function baseConditions() {
    return {
        requireElement: null as string | null,
        requireCookie: null as string | null,
        minDelayMs: 0,
        requireOnline: false,
    };
}

/** Override chrome.scripting.executeScript to simulate element presence. */
function mockElementCheck(isPresent: boolean): void {
    (globalThis as any).chrome.scripting.executeScript = async () => {
        return [{ result: isPresent }];
    };
}

/** Override network status in session storage. */
async function setNetworkStatus(status: "online" | "offline"): Promise<void> {
    await chrome.storage.session.set({ marco_network_status: status });
}

/* ------------------------------------------------------------------ */
/*  requireCookie edge cases                                           */
/* ------------------------------------------------------------------ */

describe("Condition Evaluator — requireCookie edges", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("blocks when cookie name is empty string", async () => {
        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireCookie: "",
        });

        // Empty string cookie name → cookie not found → blocks
        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("Cookie missing");
    });

    it("blocks when cookie API throws", async () => {
        (globalThis as any).chrome.cookies.get = async () => {
            throw new Error("Cookies API unavailable");
        };

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireCookie: "auth-token",
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("Cookie missing");
    });

    it("passes with exact cookie name match", async () => {
        setMockCookie("__Host-session", "value123");

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireCookie: "__Host-session",
        });

        expect(result.isMet).toBe(true);
        expect(result.failedCondition).toBeNull();
    });

    it("blocks when different cookie name exists", async () => {
        setMockCookie("other-cookie", "value");

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireCookie: "wanted-cookie",
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("wanted-cookie");
    });
});

/* ------------------------------------------------------------------ */
/*  requireElement edge cases                                          */
/* ------------------------------------------------------------------ */

describe("Condition Evaluator — requireElement edges", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("blocks when element is not found in DOM", async () => {
        mockElementCheck(false);

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireElement: "#app-root",
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("#app-root");
    });

    it("passes when element is found in DOM", async () => {
        mockElementCheck(true);

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireElement: ".dashboard-widget",
        });

        expect(result.isMet).toBe(true);
        expect(result.failedCondition).toBeNull();
    });

    it("blocks when executeScript throws for element check", async () => {
        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw new Error("Cannot access tab");
        };

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireElement: "div.content",
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("div.content");
    });

    it("blocks when executeScript returns empty results", async () => {
        (globalThis as any).chrome.scripting.executeScript = async () => [];

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireElement: "#target",
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("#target");
    });
});

/* ------------------------------------------------------------------ */
/*  minDelayMs edge cases                                              */
/* ------------------------------------------------------------------ */

describe("Condition Evaluator — minDelayMs edges", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("applies zero delay without blocking", async () => {
        const start = Date.now();

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            minDelayMs: 0,
        });

        const elapsed = Date.now() - start;

        expect(result.isMet).toBe(true);
        expect(elapsed).toBeLessThan(30);
    });

    it("applies exact delay duration", async () => {
        const start = Date.now();

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            minDelayMs: 80,
        });

        const elapsed = Date.now() - start;

        expect(result.isMet).toBe(true);
        expect(elapsed).toBeGreaterThanOrEqual(70);
    });

    it("still passes conditions after delay completes", async () => {
        setMockCookie("auth", "token");

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireCookie: "auth",
            minDelayMs: 30,
        });

        expect(result.isMet).toBe(true);
        expect(result.failedCondition).toBeNull();
    });

    it("cookie failure takes precedence over delay", async () => {
        const start = Date.now();

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireCookie: "missing",
            minDelayMs: 200,
        });

        const elapsed = Date.now() - start;

        expect(result.isMet).toBe(false);
        // Cookie check happens before delay, so should return fast
        expect(elapsed).toBeLessThan(50);
    });
});

/* ------------------------------------------------------------------ */
/*  requireOnline edge cases                                           */
/* ------------------------------------------------------------------ */

describe("Condition Evaluator — requireOnline edges", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("passes when requireOnline is false (default)", async () => {
        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireOnline: false,
        });

        expect(result.isMet).toBe(true);
    });

    it("passes when online and requireOnline is true", async () => {
        await setNetworkStatus("online");

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireOnline: true,
        });

        expect(result.isMet).toBe(true);
    });

    it("blocks when offline and requireOnline is true", async () => {
        await setNetworkStatus("offline");

        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireOnline: true,
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("offline");
    });

    it("passes when no network status is stored and requireOnline is true", async () => {
        // No status set → assume online (graceful default)
        const result = await evaluateConditions(1, {
            ...baseConditions(),
            requireOnline: true,
        });

        expect(result.isMet).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Combined condition edge cases                                      */
/* ------------------------------------------------------------------ */

describe("Condition Evaluator — combined conditions", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("blocks on first failing condition (cookie before element)", async () => {
        mockElementCheck(true);

        const result = await evaluateConditions(1, {
            requireCookie: "missing-cookie",
            requireElement: ".exists",
            minDelayMs: 0,
            requireOnline: false,
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("Cookie missing");
    });

    it("blocks on element when cookie passes", async () => {
        setMockCookie("auth", "ok");
        mockElementCheck(false);

        const result = await evaluateConditions(1, {
            requireCookie: "auth",
            requireElement: "#missing-element",
            minDelayMs: 0,
            requireOnline: false,
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("#missing-element");
    });

    it("passes all conditions together", async () => {
        setMockCookie("session", "abc");
        mockElementCheck(true);
        await setNetworkStatus("online");

        const result = await evaluateConditions(1, {
            requireCookie: "session",
            requireElement: "#app",
            minDelayMs: 10,
            requireOnline: true,
        });

        expect(result.isMet).toBe(true);
        expect(result.failedCondition).toBeNull();
    });

    it("blocks on online check after cookie and element pass", async () => {
        setMockCookie("session", "abc");
        mockElementCheck(true);
        await setNetworkStatus("offline");

        const result = await evaluateConditions(1, {
            requireCookie: "session",
            requireElement: "#app",
            minDelayMs: 0,
            requireOnline: true,
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("offline");
    });
});
