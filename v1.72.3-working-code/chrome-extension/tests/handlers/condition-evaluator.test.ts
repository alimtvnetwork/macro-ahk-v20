/**
 * Unit tests — Condition Evaluator
 *
 * Tests injection condition checks: cookie, element, delay.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

const { evaluateConditions } = await import(
    "../../src/background/condition-evaluator"
);

describe("Condition Evaluator", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns met when no conditions are required", async () => {
        const result = await evaluateConditions(1, {
            requireElement: null,
            requireCookie: null,
            minDelayMs: 0,
            requireOnline: false,
        });

        expect(result.isMet).toBe(true);
        expect(result.failedCondition).toBeNull();
    });

    it("fails when required cookie is missing", async () => {
        const result = await evaluateConditions(1, {
            requireElement: null,
            requireCookie: "session-token",
            minDelayMs: 0,
            requireOnline: false,
        });

        expect(result.isMet).toBe(false);
        expect(result.failedCondition).toContain("Cookie missing");
    });

    it("passes when required cookie exists", async () => {
        const mockChrome = (globalThis as any).chrome;
        mockChrome.cookies._setCookie("session-token", "abc123");

        const result = await evaluateConditions(1, {
            requireElement: null,
            requireCookie: "session-token",
            minDelayMs: 0,
            requireOnline: false,
        });

        expect(result.isMet).toBe(true);
    });

    it("applies delay without failing", async () => {
        const startTime = Date.now();

        const result = await evaluateConditions(1, {
            requireElement: null,
            requireCookie: null,
            minDelayMs: 50,
            requireOnline: false,
        });

        const elapsed = Date.now() - startTime;

        expect(result.isMet).toBe(true);
        expect(elapsed).toBeGreaterThanOrEqual(40);
    });
});
