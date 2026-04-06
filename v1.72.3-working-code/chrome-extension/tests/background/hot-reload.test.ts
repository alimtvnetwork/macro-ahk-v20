/**
 * Unit tests — Hot Reload
 *
 * Tests the polling mechanism that detects build-meta.json
 * changes and triggers chrome.runtime.reload().
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let reloadCalled: boolean;
let fetchMock: Mock;

beforeEach(() => {
    resetMockStorage();
    installChromeMock();

    reloadCalled = false;

    (globalThis as any).chrome.runtime.reload = () => {
        reloadCalled = true;
    };

    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    vi.useFakeTimers();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Creates a mock fetch Response returning JSON. */
function mockFetchOk(body: Record<string, unknown>): void {
    fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => body,
    });
}

/** Creates a mock fetch Response with 404. */
function mockFetchNotFound(): void {
    fetchMock.mockResolvedValueOnce({
        ok: false,
    });
}

/** Creates a mock fetch that throws. */
function mockFetchError(): void {
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Hot Reload — pollBuildMeta", () => {
    it("does not reload on first poll (baseline capture)", async () => {
        // Fresh import to reset module state
        vi.resetModules();
        installChromeMock();
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        mockFetchOk({ buildId: "abc123" });

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        await vi.advanceTimersByTimeAsync(0);

        expect(reloadCalled).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("reloads when buildId changes on second poll", async () => {
        vi.resetModules();
        installChromeMock();
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        mockFetchOk({ buildId: "build-1" });
        mockFetchOk({ buildId: "build-2" });

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        await vi.advanceTimersByTimeAsync(0);

        expect(reloadCalled).toBe(false);

        await vi.advanceTimersByTimeAsync(1000);

        expect(reloadCalled).toBe(true);
    });

    it("does not reload when buildId stays the same", async () => {
        vi.resetModules();
        installChromeMock();
        reloadCalled = false;
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        // First poll sets baseline, second poll has same id
        mockFetchOk({ buildId: "same-id" });
        mockFetchOk({ buildId: "same-id" });

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        // First poll — baseline
        await vi.advanceTimersByTimeAsync(0);

        expect(reloadCalled).toBe(false);

        // Second poll — same id
        await vi.advanceTimersByTimeAsync(1000);

        expect(reloadCalled).toBe(false);
    });

    it("silently ignores 404 responses", async () => {
        vi.resetModules();
        installChromeMock();
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        mockFetchNotFound();

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        await vi.advanceTimersByTimeAsync(0);

        expect(reloadCalled).toBe(false);
    });

    it("silently ignores fetch errors", async () => {
        vi.resetModules();
        installChromeMock();
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        mockFetchError();

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        await vi.advanceTimersByTimeAsync(0);

        expect(reloadCalled).toBe(false);
    });

    it("ignores response without buildId field", async () => {
        vi.resetModules();
        installChromeMock();
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        mockFetchOk({ version: "1.0" });

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        await vi.advanceTimersByTimeAsync(0);

        expect(reloadCalled).toBe(false);
    });

    it("does not start duplicate polling when called twice", async () => {
        vi.resetModules();
        installChromeMock();
        (globalThis as any).chrome.runtime.reload = () => {
            reloadCalled = true;
        };

        mockFetchOk({ buildId: "once" });

        const { startHotReload } = await import(
            "../../src/background/hot-reload"
        );

        startHotReload();
        startHotReload();

        await vi.advanceTimersByTimeAsync(0);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
