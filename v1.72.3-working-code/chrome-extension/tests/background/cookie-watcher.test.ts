/**
 * Unit tests — Cookie Watcher
 *
 * Tests the cookie change listener that detects session
 * cookie removal/updates and broadcasts to supported tabs.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

let cookieListeners: Array<(changeInfo: any) => void>;
let sentTabMessages: Array<{ tabId: number; message: any }>;

beforeEach(() => {
    resetMockStorage();
    installChromeMock();

    cookieListeners = [];
    sentTabMessages = [];

    // Override cookies.onChanged to capture listeners
    (globalThis as any).chrome.cookies.onChanged = {
        addListener: (listener: (changeInfo: any) => void) => {
            cookieListeners.push(listener);
        },
    };

    // Override tabs.sendMessage to capture broadcasts
    (globalThis as any).chrome.tabs.sendMessage = async (
        tabId: number,
        message: any,
    ) => {
        sentTabMessages.push({ tabId, message });
    };

    // Override tabs.query to support array URL filters used by cookie-watcher
    (globalThis as any).chrome.tabs.query = async (queryInfo: { url?: string | string[] }) => {
        const urlFilter = queryInfo.url;
        const hasSupportedFilter = Array.isArray(urlFilter)
            ? urlFilter.some((pattern) => typeof pattern === "string" && pattern.includes("lovable"))
            : typeof urlFilter === "string" && urlFilter.includes("lovable");

        return hasSupportedFilter ? [{ id: 1 }, { id: 2 }] : [];
    };
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Simulates a cookie change event. */
function fireCookieChange(
    name: string,
    domain: string,
    removed: boolean,
    value: string = "",
): void {
    for (const listener of cookieListeners) {
        listener({
            removed,
            cookie: { name, domain, value },
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Cookie Watcher — registerCookieWatcher", () => {
    it("registers a cookie change listener on init", async () => {
        vi.resetModules();
        installChromeMock();
        cookieListeners = [];
        (globalThis as any).chrome.cookies.onChanged = {
            addListener: (listener: any) => {
                cookieListeners.push(listener);
            },
        };

        const { registerCookieWatcher } = await import(
            "../../src/background/cookie-watcher"
        );

        registerCookieWatcher();

        expect(cookieListeners).toHaveLength(1);
    });
});

describe("Cookie Watcher — cookie change handling", () => {
    beforeEach(async () => {
        vi.resetModules();
        resetMockStorage();
        installChromeMock();

        cookieListeners = [];
        sentTabMessages = [];

        (globalThis as any).chrome.cookies.onChanged = {
            addListener: (listener: any) => {
                cookieListeners.push(listener);
            },
        };
        (globalThis as any).chrome.tabs.sendMessage = async (
            tabId: number,
            message: any,
        ) => {
            sentTabMessages.push({ tabId, message });
        };
        (globalThis as any).chrome.tabs.query = async (q: any) => {
            const urlFilter = q.url;
            const hasSupportedFilter = Array.isArray(urlFilter)
                ? urlFilter.some((pattern: string) => pattern.includes("lovable"))
                : typeof urlFilter === "string" && urlFilter.includes("lovable");
            return hasSupportedFilter ? [{ id: 1 }] : [];
        };
    });

    it("ignores cookies from non-lovable domains", async () => {
        const { registerCookieWatcher } = await import(
            "../../src/background/cookie-watcher"
        );

        registerCookieWatcher();
        fireCookieChange("session-id", "example.com", true);

        await new Promise((r) => setTimeout(r, 10));

        expect(sentTabMessages).toHaveLength(0);
    });

    it("accepts lovableproject.com domain cookies", async () => {
        const { registerCookieWatcher } = await import(
            "../../src/background/cookie-watcher"
        );

        registerCookieWatcher();
        fireCookieChange("lovable-session-id.id", "abc.lovableproject.com", false, "cookie-value");

        await new Promise((r) => setTimeout(r, 20));

        expect(sentTabMessages.length).toBeGreaterThan(0);
        expect(sentTabMessages[0].message.type).toBe("TOKEN_EXPIRED");
        expect(sentTabMessages[0].message.reason).toBe("session_cookie_updated_but_no_jwt");
    });

    it("ignores irrelevant cookie names on lovable domain", async () => {
        const { registerCookieWatcher } = await import(
            "../../src/background/cookie-watcher"
        );

        registerCookieWatcher();
        fireCookieChange("unrelated-cookie", "lovable.dev", true);

        await new Promise((r) => setTimeout(r, 10));

        expect(sentTabMessages).toHaveLength(0);
    });

    it("broadcasts TOKEN_EXPIRED when session cookie is set but no JWT can be resolved", async () => {
        const { registerCookieWatcher } = await import(
            "../../src/background/cookie-watcher"
        );

        registerCookieWatcher();
        fireCookieChange(
            "lovable-session-id.id",
            "lovable.dev",
            false,
            "new-token-value",
        );

        await new Promise((r) => setTimeout(r, 20));

        expect(sentTabMessages.length).toBeGreaterThan(0);
        const firstMessage = sentTabMessages[0].message;
        expect(firstMessage.type).toBe("TOKEN_EXPIRED");
        expect(firstMessage.reason).toBe("session_cookie_updated_but_no_jwt");
    });

    it("broadcasts TOKEN_EXPIRED when refresh cookie is removed", async () => {
        const { registerCookieWatcher } = await import(
            "../../src/background/cookie-watcher"
        );

        registerCookieWatcher();
        fireCookieChange(
            "lovable-session-id.refresh",
            "lovable.dev",
            true,
        );

        await new Promise((r) => setTimeout(r, 20));

        expect(sentTabMessages.length).toBeGreaterThan(0);
        const firstMessage = sentTabMessages[0].message;
        expect(firstMessage.type).toBe("TOKEN_EXPIRED");
        expect(firstMessage.reason).toBe("refresh_cookie_removed");
    });
});
