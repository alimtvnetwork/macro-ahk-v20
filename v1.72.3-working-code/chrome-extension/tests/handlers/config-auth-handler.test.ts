/**
 * Unit tests — Config & Auth Handler
 *
 * Tests GET_CONFIG, GET_TOKEN, REFRESH_TOKEN against
 * mock chrome.cookies and chrome.storage.local.
 *
 * v1.68.1: Tests updated to use JWT-like tokens (eyJ...) since
 * handleGetToken now only returns verified JWTs, not raw cookies.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockCookie,
    setMockTabs,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    handleGetConfig,
    handleGetToken,
    handleRefreshToken,
    _resetAuthCacheForTest,
} = await import("../../src/background/handlers/config-auth-handler");

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Config Auth Handler — GET_CONFIG", () => {
    beforeEach(() => {
        resetMockStorage();
        _resetAuthCacheForTest();
    });

    it("returns bundled defaults when no overrides exist", async () => {
        const result = await handleGetConfig();

        expect(result.source).toBe("hardcoded");
        expect(result.config.logLevel).toBe("info");
        expect(result.config.maxRetries).toBe(3);
    });

    it("merges local overrides over defaults", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_config_overrides: { logLevel: "debug", customKey: "abc" },
        });

        const result = await handleGetConfig();

        expect(result.source).toBe("local");
        expect(result.config.logLevel).toBe("debug");
        expect(result.config.customKey).toBe("abc");
        expect(result.config.maxRetries).toBe(3);
    });
});

describe("Config Auth Handler — GET_TOKEN", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();
        // Set up a tab with a project URL so projectId can be extracted
        setMockTabs([{ id: 1, url: "https://lovable.dev/projects/test-123" }]);
    });

    it("returns null when no cookie exists", async () => {
        const result = await handleGetToken();

        expect(result.token).toBeNull();
    });

    it("returns JWT from auth-token exchange when cookie exists", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJzdWI.sig123");

        const result = await handleGetToken();

        expect(result.token).toBe("eyJhbG.eyJzdWI.sig123");
        expect(result.refreshed).toBe(true);
    });

    it("extracts project id from bare UUID lovableproject hostnames", async () => {
        const projectId = "584600b3-0bba-43a0-a09d-ab632bf4b5ac";
        setMockTabs([{ id: 1, url: `https://${projectId}.lovableproject.com/?__lovable_token=abc` }]);
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJ1dWlk.sighost");

        const fetchMock = vi.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ token: "eyJhbG.eyJ1dWlk.sighost" }),
        }));
        (globalThis as any).fetch = fetchMock;

        const result = await handleGetToken();

        expect(result.token).toBe("eyJhbG.eyJ1dWlk.sighost");
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(`/projects/${projectId}/auth-token`),
            expect.any(Object),
        );
    });

    it("falls back to __lovable_token when cookies are unavailable", async () => {
        const signedUrlToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJwcm9qZWN0X2lkIjoiNTg0NjAwYjMtMGJiYS00M2EwLWEwOWQtYWI2MzJiZjRiNWFjIn0.sig";
        setMockTabs([{ id: 1, url: `https://584600b3-0bba-43a0-a09d-ab632bf4b5ac.lovableproject.com/?__lovable_token=${signedUrlToken}` }]);

        const result = await handleGetToken();

        expect(result.token).toBe(signedUrlToken);
        expect(result.refreshed).toBe(true);
    });

    it("caches token on subsequent calls", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJjYWNoZQ.cached");

        await handleGetToken();
        const result = await handleGetToken();

        expect(result.token).toBe("eyJhbG.eyJjYWNoZQ.cached");
    });
});

describe("Config Auth Handler — REFRESH_TOKEN", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();
        setMockTabs([{ id: 1, url: "https://lovable.dev/projects/test-123" }]);
    });

    it("clears cache and re-reads from cookie", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJvbGQ.old");
        await handleRefreshToken();

        setMockCookie("lovable-session-id.id", "eyJhbG.eyJuZXc.new");
        const result = await handleRefreshToken();

        expect(result.sessionId).toBe("eyJhbG.eyJuZXc.new");
    });

    it("returns null when cookie was removed", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJ0ZW1w.temp");
        await handleRefreshToken();

        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();

        const result = await handleRefreshToken();

        expect(result.sessionId).toBeNull();
    });
});
