import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Integration tests for fetchAuthToken / handleGetToken / handleRefreshToken.
 *
 * These tests mock chrome.cookies, chrome.tabs, chrome.scripting, chrome.storage,
 * and global fetch to validate the full auth resolution waterfall:
 *
 *   1. Platform-tab-based auth-token exchange (credentials:'include')
 *   2. Service worker direct fetch with Cookie header
 *   3. Session cookie JWT fallback
 *   4. Supabase localStorage JWT scan
 *   5. Signed URL token fallback
 *   6. Error diagnostics when nothing resolves
 */

/* ------------------------------------------------------------------ */
/*  Test JWT                                                           */
/* ------------------------------------------------------------------ */

const FAKE_JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OTk5OX0.fakesig";
const FAKE_REFRESH = "refresh-opaque-token";
const PROJECT_ID = "584600b3-0bba-43a0-a09d-ab632bf4b5ac";

/* ------------------------------------------------------------------ */
/*  Chrome API Mocks                                                   */
/* ------------------------------------------------------------------ */

type CookieStore = Map<string, Map<string, { name: string; value: string; domain: string }>>;

function buildChromeMock(options: {
    cookies?: CookieStore;
    tabs?: chrome.tabs.Tab[];
    scriptResults?: Map<number, unknown>;
    storageData?: Record<string, unknown>;
}) {
    const cookieStore = options.cookies ?? new Map();
    const tabs = options.tabs ?? [];
    const scriptResults = options.scriptResults ?? new Map();
    const storageData = options.storageData ?? {};

    return {
        cookies: {
            get: vi.fn(async ({ url, name }: { url: string; name: string }) => {
                // Match cookies by URL origin
                for (const [candidateUrl, cookieMap] of cookieStore) {
                    if (url.startsWith(candidateUrl) || candidateUrl.startsWith(url.replace(/\/$/, ""))) {
                        const cookie = cookieMap.get(name);
                        if (cookie) return cookie;
                    }
                }
                return null;
            }),
            getAll: vi.fn(async ({ url }: { url: string }) => {
                const results: Array<{ name: string; value: string; domain: string }> = [];
                for (const [candidateUrl, cookieMap] of cookieStore) {
                    if (url.startsWith(candidateUrl) || candidateUrl.startsWith(url.replace(/\/$/, ""))) {
                        results.push(...cookieMap.values());
                    }
                }
                return results;
            }),
        },
        tabs: {
            query: vi.fn(async () => tabs),
            get: vi.fn(async (tabId: number) => tabs.find(t => t.id === tabId) ?? null),
        },
        scripting: {
            executeScript: vi.fn(async ({ target }: { target: { tabId: number } }) => {
                const result = scriptResults.get(target.tabId);
                return [{ result: typeof result === "function" ? await result() : result }];
            }),
        },
        storage: {
            local: {
                get: vi.fn(async (keys: string | string[]) => {
                    if (typeof keys === "string") return { [keys]: storageData[keys] };
                    const result: Record<string, unknown> = {};
                    for (const key of keys) result[key] = storageData[key];
                    return result;
                }),
                set: vi.fn(async () => {}),
            },
        },
        runtime: {
            id: "mock-extension-id",
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Setup / Teardown                                                   */
/* ------------------------------------------------------------------ */

let originalChrome: unknown;
let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
    originalChrome = (globalThis as Record<string, unknown>).chrome;
    originalFetch = globalThis.fetch;
});

afterEach(() => {
    (globalThis as Record<string, unknown>).chrome = originalChrome;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.resetModules();
});

/**
 * Installs chrome mock + fetch mock and dynamically imports the module
 * (fresh import per test to reset module-level cache).
 */
async function setupTest(options: {
    cookies?: CookieStore;
    tabs?: chrome.tabs.Tab[];
    scriptResults?: Map<number, unknown>;
    storageData?: Record<string, unknown>;
    fetchResponses?: Map<string, { ok: boolean; status: number; json: unknown }>;
}) {
    const chromeMock = buildChromeMock(options);
    (globalThis as Record<string, unknown>).chrome = chromeMock;

    const fetchResponses = options.fetchResponses ?? new Map();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();

        for (const [pattern, response] of fetchResponses) {
            if (url.includes(pattern)) {
                return {
                    ok: response.ok,
                    status: response.status,
                    json: async () => response.json,
                    text: async () => JSON.stringify(response.json),
                } as Response;
            }
        }

        return { ok: false, status: 404, json: async () => ({}) } as Response;
    }) as typeof fetch;

    // Dynamic import to get fresh module state
    const mod = await import("@/background/handlers/config-auth-handler");
    mod._resetAuthCacheForTest();
    return { mod, chromeMock };
}

function makeCookieStore(entries: Array<{ url: string; name: string; value: string; domain?: string }>): CookieStore {
    const store: CookieStore = new Map();
    for (const entry of entries) {
        if (!store.has(entry.url)) store.set(entry.url, new Map());
        store.get(entry.url)!.set(entry.name, {
            name: entry.name,
            value: entry.value,
            domain: entry.domain ?? new URL(entry.url).hostname,
        });
    }
    return store;
}

/* ------------------------------------------------------------------ */
/*  fetchAuthToken Tests                                               */
/* ------------------------------------------------------------------ */

describe("fetchAuthToken — integration", () => {
    it("returns null when no project ID is available", async () => {
        const { mod } = await setupTest({
            tabs: [], // no active tabs → no project ID
        });

        const result = await mod.fetchAuthToken(null);
        expect(result).toBeNull();
    });

    it("returns JWT via platform tab strategy when cookies exist", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, FAKE_JWT); // executeScript returns JWT

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "session-opaque" },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBe(FAKE_JWT);
    });

    it("falls back to direct fetch when platform tab strategy fails", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, null); // platform tab returns null

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "session-val" },
        ]);

        const fetchResponses = new Map([
            [`/projects/${PROJECT_ID}/auth-token`, { ok: true, status: 200, json: { token: FAKE_JWT } }],
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies, fetchResponses });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBe(FAKE_JWT);
    });

    it("returns null when no cookies and no signed URL token", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const { mod } = await setupTest({ tabs });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBeNull();
    });

    it("discards non-JWT tokens from auth endpoint", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, null);

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "cookie-val" },
        ]);

        const fetchResponses = new Map([
            [`/projects/${PROJECT_ID}/auth-token`, { ok: true, status: 200, json: { token: "not-a-jwt" } }],
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies, fetchResponses });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBeNull();
    });

    it("prefers lovable.dev tabs over lovable.app tabs", async () => {
        const tabs = [
            { id: 2, url: "https://some-preview.lovable.app/", active: false } as chrome.tabs.Tab,
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, FAKE_JWT);
        scriptResults.set(2, "eyJbad.bad.bad"); // should not be reached

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "val" },
        ]);

        const { mod, chromeMock } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBe(FAKE_JWT);

        // Verify tab 1 (lovable.dev) was tried first
        const calls = chromeMock.scripting.executeScript.mock.calls;
        const tabIds = calls.map((c: unknown[]) => (c[0] as { target: { tabId: number } }).target.tabId);
        expect(tabIds[0]).toBe(1);
    });
});

/* ------------------------------------------------------------------ */
/*  handleGetToken Tests                                               */
/* ------------------------------------------------------------------ */

describe("handleGetToken — integration", () => {
    it("returns cached JWT when cache is valid", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, FAKE_JWT);

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "val" },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        // First call populates cache
        const first = await mod.handleGetToken(PROJECT_ID);
        expect(first.token).toBe(FAKE_JWT);
        expect(first.refreshed).toBe(true);

        // Second call returns from cache
        const second = await mod.handleGetToken(PROJECT_ID);
        expect(second.token).toBe(FAKE_JWT);
        expect(second.refreshed).toBe(false);
    });

    it("falls back to session cookie JWT when auth-token exchange fails", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, null); // platform tab returns null

        // Session cookie IS a JWT directly (some environments)
        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: FAKE_JWT },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.handleGetToken(PROJECT_ID);
        expect(result.token).toBe(FAKE_JWT);
        expect(result.cookieName).toBe("lovable-session-id-v2");
    });

    it("returns error message when no auth method succeeds", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const { mod } = await setupTest({ tabs });

        const result = await mod.handleGetToken(PROJECT_ID);
        expect(result.token).toBeNull();
        expect(result.errorMessage).toBeDefined();
        expect(result.errorMessage).toContain("Session cookie not found");
    });
});

/* ------------------------------------------------------------------ */
/*  handleRefreshToken Tests                                           */
/* ------------------------------------------------------------------ */

describe("handleRefreshToken — integration", () => {
    it("clears cache and re-reads cookies + auth-token", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, FAKE_JWT);

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "session-val" },
            { url: "https://lovable.dev", name: "lovable-session-id.refresh", value: FAKE_REFRESH },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.handleRefreshToken(PROJECT_ID);
        expect(result.authToken).toBe(FAKE_JWT);
        expect(result.sessionId).toBe("session-val");
        expect(result.refreshToken).toBe(FAKE_REFRESH);
    });

    it("returns error message when refresh fails completely", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const { mod } = await setupTest({ tabs });

        const result = await mod.handleRefreshToken(PROJECT_ID);
        expect(result.authToken).toBeUndefined();
        expect(result.errorMessage).toBeDefined();
    });
});

/* ------------------------------------------------------------------ */
/*  Cookie URL Candidate Coverage                                      */
/* ------------------------------------------------------------------ */

describe("Cookie resolution — URL candidates", () => {
    it("finds lovable.dev cookies when active tab is a preview URL", async () => {
        const previewUrl = `https://id-preview--${PROJECT_ID}.lovable.app/`;
        const tabs = [
            { id: 1, url: previewUrl, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, FAKE_JWT);

        // Cookie is set on lovable.dev, not lovable.app
        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "session-from-dev", domain: ".lovable.dev" },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.handleGetToken(undefined, previewUrl);
        expect(result.token).toBe(FAKE_JWT);
    });

    it("tries v2 cookie name before legacy names", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, null); // no platform tab JWT

        // Both v2 and legacy cookies exist — v2 is a JWT, legacy is not
        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: FAKE_JWT },
            { url: "https://lovable.dev", name: "lovable-session-id.id", value: "not-jwt" },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.handleGetToken(PROJECT_ID);
        expect(result.token).toBe(FAKE_JWT);
        expect(result.cookieName).toBe("lovable-session-id-v2");
    });
});
