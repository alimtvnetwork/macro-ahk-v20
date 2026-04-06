/**
 * Integration test — Network Handler
 *
 * Tests NETWORK_STATUS and NETWORK_REQUEST message handling,
 * ring buffer, stats computation, and session persistence.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, getMockSessionSnapshot } from "../mocks/chrome-storage";

installChromeMock();

const {
    handleNetworkStatus,
    handleNetworkRequest,
    getRecentNetworkRequests,
    getNetworkStats,
    clearNetworkRequests,
} = await import("../../src/background/network-handler");

const { MessageType } = await import("../../src/shared/messages");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildEntry(overrides: Partial<{
    method: string;
    url: string;
    status: number;
    statusText: string;
    durationMs: number;
    requestType: "xhr" | "fetch";
    timestamp: string;
    initiator: string;
}> = {}) {
    return {
        method: overrides.method ?? "GET",
        url: overrides.url ?? "https://api.example.com/data",
        status: overrides.status ?? 200,
        statusText: overrides.statusText ?? "OK",
        durationMs: overrides.durationMs ?? 42,
        requestType: overrides.requestType ?? "fetch",
        timestamp: overrides.timestamp ?? "2026-02-28T12:00:00Z",
        initiator: overrides.initiator ?? "https://example.com/page",
    };
}

function buildRequestMessage(entryOverrides: Parameters<typeof buildEntry>[0] = {}) {
    return {
        type: MessageType.NETWORK_REQUEST,
        entry: buildEntry(entryOverrides),
    } as any;
}

/* ------------------------------------------------------------------ */
/*  Tests — NETWORK_STATUS                                             */
/* ------------------------------------------------------------------ */

describe("Network Handler — NETWORK_STATUS", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        clearNetworkRequests();
    });

    it("stores online status in session storage", async () => {
        await handleNetworkStatus({
            type: MessageType.NETWORK_STATUS,
            isOnline: true,
        } as any);

        const snapshot = getMockSessionSnapshot();
        expect(snapshot["marco_network_online"]).toBe(true);
    });

    it("stores offline status in session storage", async () => {
        await handleNetworkStatus({
            type: MessageType.NETWORK_STATUS,
            isOnline: false,
        } as any);

        const snapshot = getMockSessionSnapshot();
        expect(snapshot["marco_network_online"]).toBe(false);
    });

    it("returns isOk: true", async () => {
        const result = await handleNetworkStatus({
            type: MessageType.NETWORK_STATUS,
            isOnline: true,
        } as any);

        expect(result.isOk).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Tests — NETWORK_REQUEST                                            */
/* ------------------------------------------------------------------ */

describe("Network Handler — NETWORK_REQUEST", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        clearNetworkRequests();
    });

    it("stores a single request entry", async () => {
        await handleNetworkRequest(buildRequestMessage());

        const requests = getRecentNetworkRequests();
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe("GET");
        expect(requests[0].url).toBe("https://api.example.com/data");
    });

    it("stores multiple request entries", async () => {
        await handleNetworkRequest(buildRequestMessage({ url: "https://a.com" }));
        await handleNetworkRequest(buildRequestMessage({ url: "https://b.com" }));
        await handleNetworkRequest(buildRequestMessage({ url: "https://c.com" }));

        const requests = getRecentNetworkRequests();
        expect(requests).toHaveLength(3);
    });

    it("returns isOk: false for null entry", async () => {
        const result = await handleNetworkRequest({
            type: MessageType.NETWORK_REQUEST,
            entry: null,
        } as any);

        expect(result.isOk).toBe(false);
    });

    it("persists entries to session storage", async () => {
        await handleNetworkRequest(buildRequestMessage());

        const snapshot = getMockSessionSnapshot();
        const stored = snapshot["marco_network_requests"] as any[];
        expect(stored).toHaveLength(1);
        expect(stored[0].method).toBe("GET");
    });

    it("evicts oldest entries when exceeding ring buffer capacity", async () => {
        // Fill beyond the 200 limit
        for (let i = 0; i < 210; i++) {
            await handleNetworkRequest(buildRequestMessage({
                url: `https://api.example.com/${i}`,
            }));
        }

        const requests = getRecentNetworkRequests();
        expect(requests.length).toBeLessThanOrEqual(200);

        // First entries should have been evicted
        const urls = requests.map((r) => r.url);
        expect(urls).not.toContain("https://api.example.com/0");
        expect(urls).toContain("https://api.example.com/209");
    });

    it("preserves request type (xhr vs fetch)", async () => {
        await handleNetworkRequest(buildRequestMessage({ requestType: "xhr" }));
        await handleNetworkRequest(buildRequestMessage({ requestType: "fetch" }));

        const requests = getRecentNetworkRequests();
        expect(requests[0].requestType).toBe("xhr");
        expect(requests[1].requestType).toBe("fetch");
    });

    it("preserves HTTP method", async () => {
        await handleNetworkRequest(buildRequestMessage({ method: "POST" }));
        await handleNetworkRequest(buildRequestMessage({ method: "DELETE" }));

        const requests = getRecentNetworkRequests();
        expect(requests[0].method).toBe("POST");
        expect(requests[1].method).toBe("DELETE");
    });

    it("captures error status codes", async () => {
        await handleNetworkRequest(buildRequestMessage({ status: 404, statusText: "Not Found" }));
        await handleNetworkRequest(buildRequestMessage({ status: 500, statusText: "Internal Server Error" }));

        const requests = getRecentNetworkRequests();
        expect(requests[0].status).toBe(404);
        expect(requests[1].status).toBe(500);
    });

    it("captures network errors (status 0)", async () => {
        await handleNetworkRequest(buildRequestMessage({
            status: 0,
            statusText: "Network Error",
        }));

        const requests = getRecentNetworkRequests();
        expect(requests[0].status).toBe(0);
        expect(requests[0].statusText).toBe("Network Error");
    });
});

/* ------------------------------------------------------------------ */
/*  Tests — Network Stats                                              */
/* ------------------------------------------------------------------ */

describe("Network Handler — Stats", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        clearNetworkRequests();
    });

    it("returns zeroes when no requests captured", () => {
        const stats = getNetworkStats();

        expect(stats.totalCaptured).toBe(0);
        expect(stats.byType.xhr).toBe(0);
        expect(stats.byType.fetch).toBe(0);
        expect(stats.averageDurationMs).toBe(0);
    });

    it("counts requests by type", async () => {
        await handleNetworkRequest(buildRequestMessage({ requestType: "xhr" }));
        await handleNetworkRequest(buildRequestMessage({ requestType: "xhr" }));
        await handleNetworkRequest(buildRequestMessage({ requestType: "fetch" }));

        const stats = getNetworkStats();
        expect(stats.byType.xhr).toBe(2);
        expect(stats.byType.fetch).toBe(1);
        expect(stats.totalCaptured).toBe(3);
    });

    it("buckets status codes correctly", async () => {
        await handleNetworkRequest(buildRequestMessage({ status: 200 }));
        await handleNetworkRequest(buildRequestMessage({ status: 201 }));
        await handleNetworkRequest(buildRequestMessage({ status: 301 }));
        await handleNetworkRequest(buildRequestMessage({ status: 404 }));
        await handleNetworkRequest(buildRequestMessage({ status: 500 }));
        await handleNetworkRequest(buildRequestMessage({ status: 0 }));

        const stats = getNetworkStats();
        expect(stats.byStatus["2xx"]).toBe(2);
        expect(stats.byStatus["3xx"]).toBe(1);
        expect(stats.byStatus["4xx"]).toBe(1);
        expect(stats.byStatus["5xx"]).toBe(1);
        expect(stats.byStatus["0xx"]).toBe(1);
    });

    it("computes average duration", async () => {
        await handleNetworkRequest(buildRequestMessage({ durationMs: 100 }));
        await handleNetworkRequest(buildRequestMessage({ durationMs: 200 }));
        await handleNetworkRequest(buildRequestMessage({ durationMs: 300 }));

        const stats = getNetworkStats();
        expect(stats.averageDurationMs).toBe(200);
    });

    it("clear resets all state", async () => {
        await handleNetworkRequest(buildRequestMessage());
        await handleNetworkRequest(buildRequestMessage());

        clearNetworkRequests();

        expect(getRecentNetworkRequests()).toHaveLength(0);
        expect(getNetworkStats().totalCaptured).toBe(0);
    });
});

/* ------------------------------------------------------------------ */
/*  Tests — Message Router Integration                                 */
/* ------------------------------------------------------------------ */

describe("Network Handler — Message Router Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        clearNetworkRequests();
    });

    it("NETWORK_REQUEST is registered in the message registry", async () => {
        const { HANDLER_REGISTRY } = await import(
            "../../src/background/message-registry"
        );

        const hasHandler = HANDLER_REGISTRY.has(MessageType.NETWORK_REQUEST);
        expect(hasHandler).toBe(true);
    });

    it("routes NETWORK_REQUEST through handleMessage", async () => {
        const { handleMessage } = await import(
            "../../src/background/message-router"
        );

        const response = await new Promise<any>((resolve) => {
            void handleMessage(
                buildRequestMessage({ url: "https://routed.test/api" }),
                { tab: { id: 1 } } as chrome.runtime.MessageSender,
                resolve,
            );
        });

        expect(response.isOk).toBe(true);
    });
});
