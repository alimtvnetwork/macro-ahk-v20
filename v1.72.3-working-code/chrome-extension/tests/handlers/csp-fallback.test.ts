/**
 * Integration tests — CSP Fallback Handler
 *
 * Verifies MAIN→ISOLATED world fallback on CSP errors,
 * non-CSP error pass-through, and health state transitions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

vi.mock("../../../src/background/health-handler", () => ({
    transitionHealth: vi.fn(),
}));

const { injectWithCspFallback, isCspError } = await import(
    "../../src/background/csp-fallback"
);

/* ------------------------------------------------------------------ */
/*  CSP Error Detection                                                */
/* ------------------------------------------------------------------ */

describe("CSP Fallback — isCspError detection", () => {
    it("detects 'Content Security Policy' in error message", () => {
        const result = isCspError(
            "Refused to execute inline script because it violates the following Content Security Policy directive",
        );

        expect(result).toBe(true);
    });

    it("detects 'unsafe-eval' CSP error", () => {
        const result = isCspError(
            "Refused to evaluate a string as JavaScript because 'unsafe-eval' is not allowed",
        );

        expect(result).toBe(true);
    });

    it("detects 'EvalError' CSP error", () => {
        const result = isCspError("EvalError: call to Function() blocked by CSP");

        expect(result).toBe(true);
    });

    it("detects 'refused to evaluate' (lowercase)", () => {
        expect(isCspError("refused to evaluate inline script")).toBe(true);
    });

    it("detects 'content-security-policy' (lowercase header name)", () => {
        expect(isCspError("blocked by content-security-policy header")).toBe(true);
    });

    it("is case-insensitive for all patterns", () => {
        expect(isCspError("CONTENT SECURITY POLICY violation")).toBe(true);
        expect(isCspError("EVALERROR: blocked")).toBe(true);
        expect(isCspError("UNSAFE-EVAL not permitted")).toBe(true);
    });

    it("returns false for generic errors", () => {
        const result = isCspError("Cannot read property 'x' of undefined");

        expect(result).toBe(false);
    });

    it("returns false for empty string", () => {
        expect(isCspError("")).toBe(false);
    });

    it("returns false for null-like input", () => {
        expect(isCspError("null")).toBe(false);
    });

    it("returns false for partial non-matching keywords", () => {
        expect(isCspError("Security check failed")).toBe(false);
        expect(isCspError("Policy violation on data")).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  Successful Injection (no fallback needed)                          */
/* ------------------------------------------------------------------ */

describe("CSP Fallback — Successful MAIN injection", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns success with MAIN world when injection works", async () => {
        const result = await injectWithCspFallback(1, "console.log('ok')", "MAIN");

        expect(result.isSuccess).toBe(true);
        expect(result.world).toBe("MAIN");
        expect(result.isFallback).toBe(false);
    });

    it("returns success with ISOLATED world when preferred", async () => {
        const result = await injectWithCspFallback(1, "console.log('ok')", "ISOLATED");

        expect(result.isSuccess).toBe(true);
        expect(result.world).toBe("ISOLATED");
        expect(result.isFallback).toBe(false);
    });
});

/* ------------------------------------------------------------------ */
/*  CSP Fallback from MAIN → ISOLATED                                  */
/* ------------------------------------------------------------------ */

describe("CSP Fallback — MAIN→ISOLATED fallback", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("falls back to ISOLATED when MAIN throws CSP error", async () => {
        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async (details: any) => {
            callCount++;
            const isFirstCall = callCount === 1;

            if (isFirstCall) {
                throw new Error("Refused to evaluate a string as JavaScript because 'unsafe-eval' is not allowed");
            }

            return [{ result: null }];
        };

        const result = await injectWithCspFallback(1, "console.log('test')", "MAIN");

        expect(result.isSuccess).toBe(true);
        expect(result.world).toBe("ISOLATED");
        expect(result.isFallback).toBe(true);
    });

    it("falls back for Osano-style appendChild parser failures in MAIN world", async () => {
        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            if (callCount === 1) {
                throw new Error("Failed to execute 'appendChild' on 'Node': Unexpected identifier 'let' at HTMLHeadElement.value [as appendChild] (osano.js:1:50218)");
            }
            return [{ result: null }];
        };

        const result = await injectWithCspFallback(1, "code()", "MAIN");

        expect(result.isSuccess).toBe(true);
        expect(result.isFallback).toBe(true);
        expect(result.world).toBe("ISOLATED");
    });

    it("DOES fallback for non-CSP errors in MAIN world (v7.27: retry all MAIN failures)", async () => {
        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw new Error("Tab not found");
        };

        const result = await injectWithCspFallback(1, "code()", "MAIN");

        // v7.27: All MAIN world failures now trigger userScript fallback
        expect(result.isSuccess).toBe(false);
        expect(result.isFallback).toBe(true);
    });

    it("does NOT fallback when preferred world is already ISOLATED", async () => {
        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            throw new Error("Content Security Policy blocked");
        };

        const result = await injectWithCspFallback(1, "code()", "ISOLATED");

        expect(result.isSuccess).toBe(false);
        expect(result.isFallback).toBe(false);
        // Should only attempt once (no fallback for ISOLATED→???)
        expect(callCount).toBe(1);
    });

    it("returns failure when both MAIN and ISOLATED fail", async () => {
        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw new Error("Content Security Policy violation");
        };

        const result = await injectWithCspFallback(1, "code()", "MAIN");

        expect(result.isSuccess).toBe(false);
        expect(result.isFallback).toBe(true);
        expect(result.world).toBe("ISOLATED");
    });

    it("includes combined error message when both worlds fail", async () => {
        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw new Error("Content Security Policy — all blocked");
        };

        const result = await injectWithCspFallback(1, "code()", "MAIN");

        expect(result.isSuccess).toBe(false);
        // v7.27: Error message now includes all tier results
        expect(result.errorMessage).toContain("Content Security Policy — all blocked");
        expect(result.errorMessage).toContain("All injection tiers failed");
    });

    it("transitions health to DEGRADED on fallback", async () => {
        const { transitionHealth } = await import("../../../src/background/health-handler");

        let callCount = 0;
        (globalThis as any).chrome.scripting.executeScript = async () => {
            callCount++;
            const isFirstCall = callCount === 1;

            if (isFirstCall) {
                throw new Error("Content Security Policy blocked");
            }

            return [{ result: null }];
        };

        await injectWithCspFallback(1, "test()", "MAIN");

        expect(transitionHealth).toHaveBeenCalledWith("DEGRADED", "CSP fallback active");
    });

    it("handles non-Error thrown objects in MAIN world (falls back)", async () => {
        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw "string error without CSP";
        };

        const result = await injectWithCspFallback(1, "code()", "MAIN");

        // v7.27: All MAIN failures trigger fallback, even non-Error objects
        expect(result.isSuccess).toBe(false);
        expect(result.isFallback).toBe(true);
    });
});