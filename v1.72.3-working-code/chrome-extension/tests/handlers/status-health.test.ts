/**
 * Unit tests — Status & Health Handlers
 *
 * Tests buildStatusResponse and buildHealthResponse.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockCookie,
} from "../mocks/chrome-storage";

installChromeMock();

const { buildStatusResponse } = await import("../../src/background/status-handler");
const { buildHealthResponse } = await import("../../src/background/health-handler");

describe("Status Handler — buildStatusResponse", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns all required status fields", async () => {
        const status = await buildStatusResponse();

        expect(status.connection).toBeDefined();
        expect(status.token).toBeDefined();
        expect(status.config).toBeDefined();
        expect(status.loggingMode).toBeDefined();
        expect(status.version).toBeDefined();
    });

    it("reports token as missing when no cookie exists", async () => {
        const status = await buildStatusResponse();

        expect(status.token.status).toBe("missing");
        expect(status.token.expiresIn).toBeNull();
    });

    it("reports token as valid when cookie exists with future expiry", async () => {
        const futureExpiry = (Date.now() / 1000) + 3600;
        setMockCookie("lovable-session-id.id", "jwt-token", futureExpiry);

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("valid");
        expect(status.token.expiresIn).toContain("m");
    });

    it("reports token as expiring when cookie expires within 5 minutes", async () => {
        const soonExpiry = (Date.now() / 1000) + 120;
        setMockCookie("lovable-session-id.id", "jwt-token", soonExpiry);

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("expiring");
        expect(status.token.expiresIn).toContain("s");
    });

    it("reports token as expired when cookie has past expiration", async () => {
        const pastExpiry = (Date.now() / 1000) - 100;
        setMockCookie("lovable-session-id.id", "jwt-token", pastExpiry);

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("expired");
    });

    it("reports token as valid when cookie has no expirationDate", async () => {
        setMockCookie("lovable-session-id.id", "session-token");

        const status = await buildStatusResponse();

        expect(status.token.status).toBe("valid");
        expect(status.token.expiresIn).toBeNull();
    });

    it("reports config defaults when no remote config loaded", async () => {
        const status = await buildStatusResponse();

        expect(status.config.status).toBe("defaults");
        expect(status.config.source).toBe("hardcoded");
    });

    it("reports version from constants", async () => {
        const status = await buildStatusResponse();

        expect(typeof status.version).toBe("string");
        expect(status.version.length).toBeGreaterThan(0);
    });
});

describe("Health Handler — buildHealthResponse", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns HEALTHY when storage is available", async () => {
        const health = await buildHealthResponse();

        expect(health.state).toBe("HEALTHY");
        expect(health.details).toHaveLength(0);
    });

    it("returns state and details fields", async () => {
        const health = await buildHealthResponse();

        expect(health).toHaveProperty("state");
        expect(health).toHaveProperty("details");
        expect(Array.isArray(health.details)).toBe(true);
    });
});
