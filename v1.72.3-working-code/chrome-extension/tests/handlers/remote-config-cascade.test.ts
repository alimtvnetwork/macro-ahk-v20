/**
 * Integration test — Remote Config 3-Tier Cascade
 *
 * Tests the full cascade: remote > local > bundled defaults.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, getMockStoreSnapshot } from "../mocks/chrome-storage";

installChromeMock();

const { resolveConfigCascade, getRemoteFetchStatus } = await import(
    "../../src/background/remote-config-fetcher"
);

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Remote Config — 3-Tier Cascade", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns bundled defaults when no overrides exist", async () => {
        const defaults = { logLevel: "info", timeoutMs: 5000 };
        const result = await resolveConfigCascade(defaults);

        expect(result.source).toBe("hardcoded");
        expect(result.config.logLevel).toBe("info");
        expect(result.config.timeoutMs).toBe(5000);
    });

    it("merges local overrides over defaults", async () => {
        await chrome.storage.local.set({
            marco_config_overrides: { logLevel: "debug", customKey: "custom" },
        });

        const defaults = { logLevel: "info", timeoutMs: 5000 };
        const result = await resolveConfigCascade(defaults);

        expect(result.source).toBe("local");
        expect(result.config.logLevel).toBe("debug");
        expect(result.config.timeoutMs).toBe(5000);
        expect(result.config.customKey).toBe("custom");
    });

    it("returns hardcoded when remote is disabled", async () => {
        await chrome.storage.local.set({
            marco_remote_config: {
                isEnabled: false,
                endpointUrl: "https://config.example.com/config.json",
                refreshIntervalMinutes: 60,
                mergeStrategy: "deep",
                authHeader: "",
            },
        });

        const defaults = { logLevel: "info" };
        const result = await resolveConfigCascade(defaults);

        expect(result.source).toBe("hardcoded");
    });

    it("falls back to local when remote URL is empty", async () => {
        await chrome.storage.local.set({
            marco_remote_config: {
                isEnabled: true,
                endpointUrl: "",
                refreshIntervalMinutes: 60,
                mergeStrategy: "deep",
                authHeader: "",
            },
            marco_config_overrides: { logLevel: "warn" },
        });

        const defaults = { logLevel: "info" };
        const result = await resolveConfigCascade(defaults);

        expect(result.source).toBe("local");
        expect(result.config.logLevel).toBe("warn");
    });

    it("getRemoteFetchStatus returns null values initially", () => {
        const status = getRemoteFetchStatus();

        expect(status.lastFetchedAt).toBeNull();
        expect(status.lastFetchError).toBeNull();
    });

    it("local overrides replace top-level keys", async () => {
        await chrome.storage.local.set({
            marco_config_overrides: {
                logLevel: "error",
                newKey: "added",
            },
        });

        const defaults = {
            logLevel: "info",
            timeoutMs: 5000,
        };

        const result = await resolveConfigCascade(defaults);

        expect(result.source).toBe("local");
        expect(result.config.logLevel).toBe("error");
        expect(result.config.timeoutMs).toBe(5000);
        expect(result.config.newKey).toBe("added");
    });
});
