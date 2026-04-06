/**
 * Unit tests — Token Seeder
 *
 * Tests cookie reading and localStorage injection into tabs.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let mockCookies: Map<string, string>;
let scriptingCalls: any[];
let mockTabs: Map<number, { url?: string }>;

beforeEach(() => {
    vi.resetModules();
    mockCookies = new Map();
    scriptingCalls = [];
    mockTabs = new Map();

    (globalThis as any).chrome = {
        cookies: {
            get: vi.fn(async (details: { url: string; name: string }) => {
                const value = mockCookies.get(details.name);
                return value !== undefined ? { name: details.name, value } : null;
            }),
        },
        tabs: {
            get: vi.fn(async (tabId: number) => {
                const tab = mockTabs.get(tabId);
                if (!tab) throw new Error("Tab not found");
                return { id: tabId, url: tab.url };
            }),
            query: vi.fn(async () => {
                return [];
            }),
        },
        scripting: {
            executeScript: vi.fn(async (details: any) => {
                scriptingCalls.push(details);
                if (details.func) {
                    try {
                        details.func(...(details.args ?? []));
                    } catch { /* ignore */ }
                }
                return [{ result: null }];
            }),
        },
    };

    // Mock fetch for auth-token exchange (returns 401 by default in tests)
    (globalThis as any).fetch = vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ type: "unauthorized", message: "Invalid token" }),
    }));
});

describe("Token Seeder — URL Filtering", () => {
    it("skips unsupported URLs (non-Lovable domains)", async () => {
        mockTabs.set(1, { url: "https://google.com/search" });

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        expect(scriptingCalls.length).toBe(0);
    });

    it("processes lovable.dev URLs", async () => {
        mockTabs.set(1, { url: "https://lovable.dev/projects/abc" });
        mockCookies.set("lovable-session-id.id", "session-123");

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        expect(scriptingCalls.length).toBe(1);
        expect(scriptingCalls[0].world).toBe("MAIN");
    });

    it("processes lovable.app URLs", async () => {
        mockTabs.set(2, { url: "https://preview.lovable.app/page" });
        mockCookies.set("lovable-session-id.id", "token-abc");

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(2);

        expect(scriptingCalls.length).toBe(1);
    });

    it("processes lovableproject preview URLs", async () => {
        mockTabs.set(4, { url: "https://584600b3-0bba-43a0-a09d-ab632bf4b5ac.lovableproject.com/?__lovable_token=abc" });
        mockCookies.set("lovable-session-id.id", "token-preview");

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(4);

        expect(scriptingCalls.length).toBe(1);
    });

    it("processes localhost URLs", async () => {
        mockTabs.set(3, { url: "http://localhost:3000/test" });
        mockCookies.set("lovable-session-id.refresh", "refresh-xyz");

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(3);

        expect(scriptingCalls.length).toBe(1);
    });
});

describe("Token Seeder — Cookie Resolution", () => {
    it("does not seed raw cookie values when no JWT available", async () => {
        mockTabs.set(1, { url: "https://lovable.dev/projects/abc" });
        // No cookies set — auth-token exchange will fail, Supabase scan returns null

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        // Should call executeScript once for Supabase scan, but NOT for seeding
        const seedCalls = scriptingCalls.filter((c: any) => c.args && c.args.length > 1);
        expect(seedCalls.length).toBe(0);
    });

    it("injects using __lovable_token when cookies are unavailable", async () => {
        const signedUrlToken = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJwcm9qZWN0X2lkIjoiNTg0NjAwYjMtMGJiYS00M2EwLWEwOWQtYWI2MzJiZjRiNWFjIn0.sig";
        mockTabs.set(1, { url: `https://584600b3-0bba-43a0-a09d-ab632bf4b5ac.lovableproject.com/?__lovable_token=${signedUrlToken}` });

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        const seedCalls = scriptingCalls.filter((c: any) => c.args && c.args.length > 1);
        expect(seedCalls.length).toBe(1);
        expect(seedCalls[0].args?.[0]).toBe(signedUrlToken);
    });

    it("injects when only session cookie exists", async () => {
        mockTabs.set(1, { url: "https://lovable.dev/test" });
        mockCookies.set("lovable-session-id.id", "session-only");

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        expect(scriptingCalls.length).toBe(1);
    });

    it("injects when only refresh cookie exists", async () => {
        mockTabs.set(1, { url: "https://lovable.dev/test" });
        mockCookies.set("lovable-session-id.refresh", "refresh-only");

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        expect(scriptingCalls.length).toBe(1);
    });
});

describe("Token Seeder — Error Handling", () => {
    it("handles tab not found gracefully", async () => {
        // Tab 999 not in mockTabs
        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(999);

        expect(scriptingCalls.length).toBe(0);
    });

    it("handles tab without URL gracefully", async () => {
        mockTabs.set(1, {}); // no url property

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");
        await seedTokensIntoTab(1);

        expect(scriptingCalls.length).toBe(0);
    });

    it("handles scripting execution failure gracefully", async () => {
        mockTabs.set(1, { url: "https://lovable.dev/test" });
        mockCookies.set("lovable-session-id.id", "token");
        (globalThis as any).chrome.scripting.executeScript = vi.fn().mockRejectedValue(new Error("Cannot access tab"));

        const { seedTokensIntoTab } = await import("../../src/background/handlers/token-seeder");

        // Should not throw
        await expect(seedTokensIntoTab(1)).resolves.toBeUndefined();
    });
});
