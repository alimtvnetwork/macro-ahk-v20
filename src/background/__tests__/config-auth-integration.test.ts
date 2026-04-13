import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Integration tests for fetchAuthToken / handleGetToken / handleRefreshToken.
 *
 * These tests mock chrome.cookies, chrome.tabs, chrome.scripting, chrome.storage,
 * and global fetch to validate the current no-network auth resolution waterfall:
 *
 *   1. Session cookie JWT
 *   2. Supabase localStorage JWT scan
 *   3. Signed URL token fallback
 *   4. Error diagnostics when nothing resolves
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
    frameUrls?: Map<number, Array<{ frameId: number; url?: string }>>;
    storageData?: Record<string, unknown>;
}) {
    const cookieStore = options.cookies ?? new Map();
    const tabs = options.tabs ?? [];
    const scriptResults = options.scriptResults ?? new Map();
    const frameUrls = options.frameUrls ?? new Map();
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
            executeScript: vi.fn(async ({ target }: { target: { tabId: number; allFrames?: boolean } }) => {
                const raw = scriptResults.get(target.tabId);
                const result = typeof raw === "function" ? await raw() : raw;

                if (target.allFrames && Array.isArray(result)) {
                    return result.map((entry) => ({ result: entry }));
                }

                return [{ result }];
            }),
        },
        webNavigation: {
            getAllFrames: vi.fn(async ({ tabId }: { tabId: number }) => frameUrls.get(tabId) ?? []),
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
    frameUrls?: Map<number, Array<{ frameId: number; url?: string }>>;
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
    it("returns JWT directly from a JWT session cookie", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: FAKE_JWT },
        ]);

        const { mod } = await setupTest({ tabs, cookies });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBe(FAKE_JWT);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("falls back to localStorage JWT when the session cookie is opaque", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, FAKE_JWT);

        const cookies = makeCookieStore([
            { url: "https://lovable.dev", name: "lovable-session-id-v2", value: "session-opaque" },
        ]);

        const { mod } = await setupTest({ tabs, scriptResults, cookies });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBe(FAKE_JWT);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("returns a signed URL token when cookies are unavailable", async () => {
        const signedUrlToken = FAKE_JWT;
        const previewUrl = `https://id-preview--${PROJECT_ID}.lovable.app/?__lovable_token=${signedUrlToken}`;
        const tabs = [
            { id: 1, url: previewUrl, active: true } as chrome.tabs.Tab,
        ];

        const { mod } = await setupTest({ tabs });

        const result = await mod.fetchAuthToken(null, PROJECT_ID, previewUrl);
        expect(result).toBe(signedUrlToken);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("returns null when no cookie, localStorage JWT, or signed URL token exists", async () => {
        const tabs = [
            { id: 1, url: `https://lovable.dev/projects/${PROJECT_ID}`, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, null);

        const { mod } = await setupTest({ tabs, scriptResults });

        const result = await mod.fetchAuthToken(null, PROJECT_ID);
        expect(result).toBeNull();
        expect(globalThis.fetch).not.toHaveBeenCalled();
    }, 15_000);
});

/* ------------------------------------------------------------------ */
/*  handleGetToken Tests                                               */
/* ------------------------------------------------------------------ */
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

    it("returns a session cookie JWT directly when present", async () => {
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
        expect(result.errorMessage).toContain("No JWT found after waiting 12s for auth restoration");
    }, 15_000);

    it("finds a signed URL token in a preview frame when the top-level editor URL has no token", async () => {
        const editorUrl = `https://lovable.dev/projects/${PROJECT_ID}`;
        const previewUrl = `https://id-preview--${PROJECT_ID}.lovable.app/?__lovable_token=${FAKE_JWT}`;
        const tabs = [
            { id: 1, url: editorUrl, active: true } as chrome.tabs.Tab,
        ];
        const frameUrls = new Map<number, Array<{ frameId: number; url?: string }>>();
        frameUrls.set(1, [
            { frameId: 0, url: editorUrl },
            { frameId: 1, url: previewUrl },
        ]);

        const { mod } = await setupTest({ tabs, frameUrls });

        const result = await mod.handleGetToken(PROJECT_ID, editorUrl);
        expect(result.token).toBe(FAKE_JWT);
        expect(result.cookieName).toBe("signedUrl[__lovable_token]");
    });

    it("finds a JWT in a preview frame localStorage when the top-level editor frame has none", async () => {
        const editorUrl = `https://lovable.dev/projects/${PROJECT_ID}`;
        const tabs = [
            { id: 1, url: editorUrl, active: true } as chrome.tabs.Tab,
        ];

        const scriptResults = new Map<number, unknown>();
        scriptResults.set(1, [null, FAKE_JWT]);

        const { mod } = await setupTest({ tabs, scriptResults });

        const result = await mod.handleGetToken(PROJECT_ID, editorUrl);
        expect(result.token).toBe(FAKE_JWT);
        expect(result.cookieName).toBe("localStorage[sb-*-auth-token]");
    });
});

/* ------------------------------------------------------------------ */
/*  handleRefreshToken Tests                                           */
/* ------------------------------------------------------------------ */

describe("handleRefreshToken — integration", () => {
    it("clears cache and re-reads cookies + localStorage", async () => {
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
    }, 15_000);
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
