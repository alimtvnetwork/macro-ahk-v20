/**
 * Integration test — Auth Flow (Token Lifecycle)
 *
 * Tests the full auth flow: cookie-based token retrieval,
 * caching, refresh, and status reporting.
 *
 * v1.68.1: Updated to use JWT-like tokens (eyJ...) since
 * handleGetToken now only returns verified JWTs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, setMockCookie, setMockTabs } from "../mocks/chrome-storage";

installChromeMock();

const {
    handleGetToken,
    handleRefreshToken,
    handleGetConfig,
    _resetAuthCacheForTest,
} = await import("../../src/background/handlers/config-auth-handler");

const { buildStatusResponse } = await import("../../src/background/status-handler");

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Auth Flow — Token Lifecycle Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();
        // Ensure tabs have a project URL for auth-token exchange
        setMockTabs([{ id: 1, url: "https://lovable.dev/projects/test-proj" }]);
    });

    it("returns null token when no cookie exists", async () => {
        const result = await handleGetToken();

        expect(result.token).toBeNull();
    });

    it("reads token from lovable-session-id.id cookie via exchange", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJ0ZXN0.value");

        const result = await handleGetToken();

        expect(result.token).toBe("eyJhbG.eyJ0ZXN0.value");
    });

    it("returns consistent token across multiple calls", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJjb25z.consistent");

        const first = await handleGetToken();
        const second = await handleGetToken();

        expect(first.token).toBe("eyJhbG.eyJjb25z.consistent");
        expect(second.token).toBe("eyJhbG.eyJjb25z.consistent");
    });

    it("refresh forces cookie re-read", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJvcmlnaW5hbA.original");
        await handleGetToken(); // Cache it

        // Update the cookie
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJyZWZyZXNoZWQ.refreshed");

        const refreshed = await handleRefreshToken();
        expect(refreshed.sessionId).toBe("eyJhbG.eyJyZWZyZXNoZWQ.refreshed");
    });

    it("refresh returns null when cookie removed", async () => {
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJzb29u.soon");
        await handleGetToken();

        // Simulate cookie deletion
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();

        const refreshed = await handleRefreshToken();
        expect(refreshed.sessionId).toBeNull();
    });

    it("status reports valid token with expiration", async () => {
        const futureExpiry = Date.now() / 1000 + 3600;
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJ2YWxpZA.valid", futureExpiry);

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("valid");
        expect(status.token.expiresIn).toContain("m");
    });

    it("status reports expired token", async () => {
        const pastExpiry = Date.now() / 1000 - 100;
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJleHBpcmVk.expired", pastExpiry);

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("expired");
    });

    it("status reports expiring token when < 5 minutes", async () => {
        const soonExpiry = Date.now() / 1000 + 120;
        setMockCookie("lovable-session-id.id", "eyJhbG.eyJleHBpcmluZw.expiring", soonExpiry);

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("expiring");
        expect(status.token.expiresIn).toContain("s");
    });

    it("status reports missing token", async () => {
        const status = await buildStatusResponse();

        expect(status.token.status).toBe("missing");
    });

    it("config defaults returned when no overrides", async () => {
        const result = await handleGetConfig();

        expect(result.config.logLevel).toBe("info");
        expect(result.config.timeoutMs).toBe(5000);
        expect(result.source).toBe("hardcoded");
    });

    it("config merges local overrides", async () => {
        await chrome.storage.local.set({
            marco_config_overrides: { logLevel: "debug" },
        });

        const result = await handleGetConfig();

        expect(result.config.logLevel).toBe("debug");
        expect(result.config.timeoutMs).toBe(5000);
        expect(result.source).toBe("local");
    });

    it("status includes version", async () => {
        const status = await buildStatusResponse();

        expect(status.version).toBeTruthy();
    });

    it("status connection reflects health state", async () => {
        const { setHealthState } = await import("../../src/background/state-manager");

        setHealthState("HEALTHY");
        const healthyStatus = await buildStatusResponse();
        expect(healthyStatus.connection).toBe("online");

        setHealthState("DEGRADED");
        const degradedStatus = await buildStatusResponse();
        expect(degradedStatus.connection).toBe("degraded");

        setHealthState("FATAL");
        const fatalStatus = await buildStatusResponse();
        expect(fatalStatus.connection).toBe("offline");
    });
});
