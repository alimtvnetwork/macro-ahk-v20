/**
 * Marco Extension — Config & Auth Handler
 *
 * Handles GET_CONFIG, GET_TOKEN, REFRESH_TOKEN messages.
 * Uses chrome.cookies for bearer token and chrome.storage.local
 * for config cascade (remote > local > bundled defaults).
 *
 * @see spec/05-chrome-extension/02-config-json-schema.md — Config JSON schema
 * @see spec/05-chrome-extension/04-cookie-and-auth.md — Cookie & auth strategy
 * @see spec/05-chrome-extension/36-cookie-only-bearer.md — Cookie-only bearer flow
 */

import {
    resolveConfigCascade,
    getRemoteFetchStatus,
} from "../remote-config-fetcher";
import { logBgWarnError, logCaughtError, BgLogTag, type CaughtError} from "../bg-logger";
import {
    buildCookieUrlCandidates,
    readCookieValueFromCandidates,
} from "../cookie-helpers";
import { readAllProjects } from "./project-helpers";
import type { CookieBinding } from "../../shared/project-types";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const COOKIE_URL = "https://lovable.dev";
const COOKIE_SESSION_ID = "lovable-session-id.id";
const COOKIE_SESSION_ID_V2 = "lovable-session-id-v2";
const COOKIE_SESSION_ID_LEGACY = "lovable-session-id";
const COOKIE_REFRESH_TOKEN = "lovable-session-id.refresh";
const COOKIE_SESSION_ID_SECURE = "__Secure-lovable-session-id.id";
const COOKIE_REFRESH_TOKEN_SECURE = "__Secure-lovable-session-id.refresh";
const COOKIE_SESSION_ID_HOST = "__Host-lovable-session-id.id";
const COOKIE_REFRESH_TOKEN_HOST = "__Host-lovable-session-id.refresh";
const AUTH_API_BASE = "https://api.lovable.dev";
const TOKEN_CACHE_TTL_MS = 30_000;
const AUTH_READY_TIMEOUT_MS = 12_000;
const AUTH_READY_RETRY_INTERVAL_MS = 300;

const SESSION_COOKIE_NAME_CANDIDATES = [
    COOKIE_SESSION_ID_V2,
    COOKIE_SESSION_ID,
    COOKIE_SESSION_ID_SECURE,
    COOKIE_SESSION_ID_HOST,
    COOKIE_SESSION_ID_LEGACY,
] as const;

const REFRESH_COOKIE_NAME_CANDIDATES = [
    COOKIE_REFRESH_TOKEN,
    COOKIE_REFRESH_TOKEN_SECURE,
    COOKIE_REFRESH_TOKEN_HOST,
] as const;

const PLATFORM_TAB_PATTERNS = [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://lovable.app/*",
    "https://*.lovable.app/*",
    "https://lovableproject.com/*",
    "https://*.lovableproject.com/*",
    "http://localhost/*",
    "https://localhost/*",
] as const;

const AUTH_COOKIE_NAME_PATTERN = /(lovable|session|token|auth)/i;

/* ------------------------------------------------------------------ */
/*  Project Cookie Resolution                                          */
/* ------------------------------------------------------------------ */

/**
 * Resolves session and refresh cookie names from the active project's
 * dependency chain. Always appends hardcoded fallbacks for compatibility
 * when stored project bindings are stale.
 */
async function resolveSessionCookieNamesFromProjects(_projectId?: string | null): Promise<{
    sessionNames: readonly string[];
    refreshNames: readonly string[];
}> {
    try {
        const projects = await readAllProjects();
        const cookieBindings: CookieBinding[] = [];

        // Collect cookie bindings from all projects (SDK first since it's global)
        for (const project of projects) {
            if (project.cookies && project.cookies.length > 0) {
                cookieBindings.push(...project.cookies);
            }
        }

        const sessionNamesFromBindings = cookieBindings
            .filter((c) => c.role === "session")
            .map((c) => c.cookieName)
            .filter((name): name is string => typeof name === "string" && name.length > 0);
        const refreshNamesFromBindings = cookieBindings
            .filter((c) => c.role === "refresh")
            .map((c) => c.cookieName)
            .filter((name): name is string => typeof name === "string" && name.length > 0);

        return {
            sessionNames: [...new Set([...sessionNamesFromBindings, ...SESSION_COOKIE_NAME_CANDIDATES])],
            refreshNames: [...new Set([...refreshNamesFromBindings, ...REFRESH_COOKIE_NAME_CANDIDATES])],
        };
    } catch {
        return {
            sessionNames: SESSION_COOKIE_NAME_CANDIDATES,
            refreshNames: REFRESH_COOKIE_NAME_CANDIDATES,
        };
    }
}

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let cachedSessionId: string | null = null;
let cachedRefreshToken: string | null = null;
let cachedAt = 0;
let isRefreshing = false;

/** Resets module-level auth cache. Exported for test use only. */
export function _resetAuthCacheForTest(): void {
    cachedSessionId = null;
    cachedRefreshToken = null;
    cachedAt = 0;
    isRefreshing = false;
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface SessionTokens {
    sessionId: string | null;
    refreshToken: string | null;
}

interface CookieLookupResult {
    value: string | null;
    cookieName: string | null;
}

interface CookieDiscoverySummary {
    checkedUrls: string[];
    authLikeCookieNames: string[];
}

interface TokenCandidateResult {
    token: string | null;
    cookieName?: string;
}

/* ------------------------------------------------------------------ */
/*  Default Config                                                     */
/* ------------------------------------------------------------------ */

/** Returns the bundled default configuration. */
function getBundledDefaults(): Record<string, unknown> {
    return {
        logLevel: "info",
        maxRetries: 3,
        timeoutMs: 5000,
        injectionMode: "programmatic",
        configMethod: "globalObject",
    };
}

/* ------------------------------------------------------------------ */
/*  GET_CONFIG                                                         */
/* ------------------------------------------------------------------ */

/** Retrieves the merged config using the 3-tier cascade. */
export async function handleGetConfig(): Promise<{
    config: Record<string, unknown>;
    source: "local" | "remote" | "hardcoded";
}> {
    const defaults = getBundledDefaults();
    const cascadeResult = await resolveConfigCascade(defaults);

    return {
        config: cascadeResult.config,
        source: cascadeResult.source,
    };
}

/** Returns the remote fetch status for UI display. */
export function getConfigFetchStatus() {
    return getRemoteFetchStatus();
}

/* ------------------------------------------------------------------ */
/*  GET_TOKEN  (with auth-ready wait)                                  */
/* ------------------------------------------------------------------ */

/**
 * Resolves a JWT from direct cookie access, platform localStorage, or signed URL fallback.
 *
 * Network auth-token exchange is intentionally disabled to avoid noisy 401s.
 * See root-cause: spec/17-app-issues/80-auth-token-bridge-null-on-preview.md
 */
// eslint-disable-next-line max-lines-per-function
export async function handleGetToken(
    _projectId?: string,
    tabUrlHint?: string,
): Promise<{ token: string | null; refreshed: boolean; errorMessage?: string; cookieName?: string }> {
    const cachedTokenIsJwt = cachedSessionId !== null && isLikelyJwt(cachedSessionId);
    const isCacheValid = cachedTokenIsJwt
        && (Date.now() - cachedAt) < TOKEN_CACHE_TTL_MS;

    if (isCacheValid) {
        return { token: cachedSessionId, refreshed: false };
    }

    const projectId = _projectId ?? await getActiveTabProjectId(tabUrlHint);
    const resolvedCookieNames = await resolveSessionCookieNamesFromProjects(projectId);
    const primaryUrl = await resolvePrimaryUrl(tabUrlHint);
    const tokenCandidate = await waitForTokenCandidate(resolvedCookieNames, primaryUrl, tabUrlHint);

    if (tokenCandidate.token !== null) {
        cachedSessionId = tokenCandidate.token;
        cachedAt = Date.now();
        return {
            token: tokenCandidate.token,
            refreshed: true,
            cookieName: tokenCandidate.cookieName,
        };
    }

    const sessionLookup = await readCookieValueByNameCandidates(
        resolvedCookieNames.sessionNames,
        primaryUrl,
    );

    if (sessionLookup.value !== null) {
        logBgWarnError(BgLogTag.CONFIG_AUTH, "GET_TOKEN: session cookie exists but no JWT could be derived after auth-ready wait");
        return {
            token: null,
            refreshed: false,
            errorMessage: "Session cookie exists, but JWT cookie/localStorage lookup failed after waiting for auth restoration.",
        };
    }

    const cookieDiscovery = await discoverAuthCookieNames(primaryUrl);

    return {
        token: null,
        refreshed: false,
        errorMessage: buildMissingCookieMessage(
            cookieDiscovery,
            resolvedCookieNames.sessionNames,
            resolvedCookieNames.refreshNames,
        ),
    };
}

/* ------------------------------------------------------------------ */
/*  GET_TOKENS  (both session + refresh)                               */
/* ------------------------------------------------------------------ */

/** Reads both session cookies and returns them as a pair. */
export async function handleGetTokens(): Promise<SessionTokens> {
    const activeTabUrl = await getActiveTabUrl();
    const primaryUrl = activeTabUrl ?? COOKIE_URL;
    const resolved = await resolveSessionCookieNamesFromProjects();

    const sessionLookup = await readCookieValueByNameCandidates(
        resolved.sessionNames,
        primaryUrl,
    );
    const refreshLookup = await readCookieValueByNameCandidates(
        resolved.refreshNames,
        primaryUrl,
    );
    const sessionId = sessionLookup.value;
    const refreshToken = refreshLookup.value;

    cachedSessionId = null;
    cachedRefreshToken = refreshToken;
    cachedAt = 0;

    return { sessionId, refreshToken };
}

/* ------------------------------------------------------------------ */
/*  REFRESH_TOKEN  (forced re-read + auth-ready wait)                  */
/* ------------------------------------------------------------------ */

/** Forces cookie re-read and API refresh. */
// eslint-disable-next-line max-lines-per-function
export async function handleRefreshToken(
    projectId?: string,
    tabUrlHint?: string,
): Promise<SessionTokens & { authToken?: string; errorMessage?: string }> {
    cachedSessionId = null;
    cachedRefreshToken = null;
    cachedAt = 0;

    const primaryUrl = await resolvePrimaryUrl(tabUrlHint);
    const resolved = await resolveSessionCookieNamesFromProjects(projectId);
    const sessionLookup = await readCookieValueByNameCandidates(
        resolved.sessionNames,
        primaryUrl,
    );
    const refreshLookup = await readCookieValueByNameCandidates(
        resolved.refreshNames,
        primaryUrl,
    );
    const sessionId = sessionLookup.value;
    const refreshToken = refreshLookup.value;
    const tokenCandidate = await waitForTokenCandidate(resolved, primaryUrl, tabUrlHint);
    const authToken = tokenCandidate.token;

    cachedSessionId = authToken ?? null;
    cachedRefreshToken = refreshToken;
    cachedAt = authToken ? Date.now() : 0;

    if (authToken) {
        return { sessionId, refreshToken, authToken };
    }

    const cookieDiscovery = await discoverAuthCookieNames(primaryUrl);
    return {
        sessionId,
        refreshToken,
        authToken: undefined,
        errorMessage: buildMissingCookieMessage(
            cookieDiscovery,
            resolved.sessionNames,
            resolved.refreshNames,
        ),
    };
}

/* ------------------------------------------------------------------ */
/*  Auto-Refresh Logic                                                 */
/* ------------------------------------------------------------------ */

/** Attempts to get a fresh auth token without any auth-token network exchange. */
async function attemptAutoRefresh(
    projectId?: string,
): Promise<string | null> {
    if (isRefreshing) {
        return null;
    }

    isRefreshing = true;

    try {
        const refreshResult = await handleRefreshToken(projectId);
        const authToken = refreshResult.authToken ?? null;

        if (authToken !== null) {
            cachedSessionId = authToken;
            cachedAt = Date.now();
            console.log("[config-auth] Auto-refresh successful (cookie/localStorage)");
            return authToken;
        }

        logBgWarnError(BgLogTag.CONFIG_AUTH, "Auto-refresh returned no token");
        return null;
    } catch (refreshError) {
        logRefreshError(refreshError);
        return null;
    } finally {
        isRefreshing = false;
    }
}

/**
 * Legacy helper kept for compatibility.
 *
 * Network auth-token exchange is disabled; this now resolves a JWT only from
 * direct cookies, platform localStorage, or signed URL tokens.
 */
export async function fetchAuthToken(
    _bearerToken: string | null,
    projectId?: string,
    tabUrlHint?: string,
): Promise<string | null> {
    const primaryUrl = await resolvePrimaryUrl(tabUrlHint);
    const resolved = await resolveSessionCookieNamesFromProjects(projectId);
    const tokenCandidate = await waitForTokenCandidate(resolved, primaryUrl, tabUrlHint);

    if (tokenCandidate.token !== null) {
        return tokenCandidate.token;
    }

    const sessionCookieLookup = await readCookieValueByNameCandidates(
        resolved.sessionNames,
        primaryUrl,
    );

    if (sessionCookieLookup.value !== null) {
        logBgWarnError(BgLogTag.CONFIG_AUTH, "Session cookie exists but auth-token exchange is disabled because the cookie is not a JWT");
    }

    return null;
}

/** Checks if a token looks like a JWT (3-part base64 starting with eyJ). */
function isLikelyJwt(token: string): boolean {
    return token.startsWith("eyJ") && token.split(".").length === 3;
}

async function waitForTokenCandidate(
    resolvedCookieNames: { sessionNames: readonly string[]; refreshNames: readonly string[] },
    primaryUrl: string,
    tabUrlHint?: string,
): Promise<TokenCandidateResult> {
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < AUTH_READY_TIMEOUT_MS) {
        const candidate = await readTokenCandidateOnce(resolvedCookieNames, primaryUrl, tabUrlHint);

        if (candidate.token !== null) {
            return candidate;
        }

        await new Promise<void>((resolve) => {
            setTimeout(resolve, AUTH_READY_RETRY_INTERVAL_MS);
        });
    }

    return readTokenCandidateOnce(resolvedCookieNames, primaryUrl, tabUrlHint);
}

async function readTokenCandidateOnce(
    resolvedCookieNames: { sessionNames: readonly string[]; refreshNames: readonly string[] },
    primaryUrl: string,
    tabUrlHint?: string,
): Promise<TokenCandidateResult> {
    const sessionLookup = await readCookieValueByNameCandidates(
        resolvedCookieNames.sessionNames,
        primaryUrl,
    );

    if (sessionLookup.value !== null && isLikelyJwt(sessionLookup.value)) {
        console.log("[config-auth] token wait: found JWT directly in session cookie");
        return {
            token: sessionLookup.value,
            cookieName: sessionLookup.cookieName ?? COOKIE_SESSION_ID,
        };
    }

    const localStorageJwt = await readSupabaseJwtFromPlatformTabs(tabUrlHint);
    if (localStorageJwt !== null) {
        console.log("[config-auth] token wait: found JWT in platform tab localStorage");
        return {
            token: localStorageJwt,
            cookieName: "localStorage[sb-*-auth-token]",
        };
    }

    const signedUrlToken = await resolveSignedUrlTokenCandidate(tabUrlHint, primaryUrl);

    if (signedUrlToken !== null) {
        console.log("[config-auth] token wait: using signed URL token fallback");
        return {
            token: signedUrlToken,
            cookieName: "signedUrl[__lovable_token]",
        };
    }

    return { token: null };
}

interface TokenValidationResult {
    isValid: boolean;
    status: number | null;
}

/** Validates a token structurally without any network call. */
async function validateToken(
    token: string,
    _projectId?: string,
): Promise<TokenValidationResult> {
    return {
        isValid: isLikelyJwt(token),
        status: null,
    };
}

function logRefreshError(refreshError: CaughtError): void {
    logCaughtError(BgLogTag.CONFIG_AUTH, "Error refreshing session", refreshError);
}

async function readCookieValueByNameCandidates(
    cookieNames: readonly string[],
    primaryUrl: string,
): Promise<CookieLookupResult> {
    for (const cookieName of cookieNames) {
        const value = await readCookieValueFromCandidates(cookieName, primaryUrl);
        if (value !== null) {
            return { value, cookieName };
        }
    }

    return { value: null, cookieName: null };
}

async function discoverAuthCookieNames(primaryUrl: string): Promise<CookieDiscoverySummary> {
    const checkedUrls = buildCookieUrlCandidates(primaryUrl);

    try {
        const allCookies = await chrome.cookies.getAll({});
        const authLikeCookieNames = allCookies
            .filter((cookie) => AUTH_COOKIE_NAME_PATTERN.test(cookie.name))
            .map((cookie) => cookie.name)
            .filter((name, index, arr) => arr.indexOf(name) === index)
            .sort();

        return {
            checkedUrls,
            authLikeCookieNames,
        };
    } catch {
        return {
            checkedUrls,
            authLikeCookieNames: [],
        };
    }
}

function buildMissingCookieMessage(
    cookieDiscovery: CookieDiscoverySummary,
    expectedSessionNames: readonly string[],
    expectedRefreshNames: readonly string[],
): string {
    const discovered = cookieDiscovery.authLikeCookieNames.length > 0
        ? cookieDiscovery.authLikeCookieNames.join(", ")
        : "none";

    return [
        `No JWT found after waiting ${Math.round(AUTH_READY_TIMEOUT_MS / 1000)}s for auth restoration.`,
        `Checked cookie URLs: ${cookieDiscovery.checkedUrls.join(" | ")}`,
        `Expected session cookie names: ${expectedSessionNames.join(", ")}`,
        `Expected refresh cookie names: ${expectedRefreshNames.join(", ")}`,
        `Discovered auth-like cookie names: ${discovered}`,
    ].join(" ");
}

async function getActivePlatformTabs(tabUrlHint?: string): Promise<chrome.tabs.Tab[]> {
    const hintedUrl = typeof tabUrlHint === "string" && tabUrlHint.length > 0
        ? tabUrlHint
        : null;

    if (hintedUrl !== null) {
        const hintedTabs = await chrome.tabs.query({ url: hintedUrl });
        if (hintedTabs.length > 0) {
            return hintedTabs;
        }
    }

    const tabs = await chrome.tabs.query({ url: [...PLATFORM_TAB_PATTERNS] });
    return tabs;
}

// eslint-disable-next-line max-lines-per-function
async function readSupabaseJwtFromPlatformTabs(tabUrlHint?: string): Promise<string | null> {
    const tabs = await getActivePlatformTabs(tabUrlHint);

    for (const tab of tabs) {
        if (typeof tab.id !== "number") continue;

        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: function scanLocalStorageForJwt(): string | null { // eslint-disable-line sonarjs/cognitive-complexity -- localStorage scan with priority matching
                    try {
                        const len = localStorage.length;
                        // Priority 1: Supabase auth token (sb-*-auth-token)
                        for (let i = 0; i < len; i++) {
                            const key = localStorage.key(i);
                            if (!key) continue;
                            if (key.startsWith("sb-") && key.includes("-auth-token")) {
                                const raw = localStorage.getItem(key);
                                if (!raw) continue;
                                try {
                                    const parsed = JSON.parse(raw);
                                    const token = parsed?.access_token
                                        ?? parsed?.currentSession?.access_token
                                        ?? parsed?.session?.access_token;
                                    if (typeof token === "string" && token.startsWith("eyJ") && token.split(".").length === 3) {
                                        return token;
                                    }
                                } catch {
                                    if (raw.startsWith("eyJ") && raw.split(".").length === 3) {
                                        return raw;
                                    }
                                }
                            }
                        }
                        // Priority 2: Lovable-specific auth keys
                        const lovableKeys = ["lovable-auth-token", "lovable:token", "auth-token", "supabase.auth.token"];
                        for (let j = 0; j < lovableKeys.length; j++) {
                            const val = localStorage.getItem(lovableKeys[j]);
                            if (!val) continue;
                            try {
                                const p2 = JSON.parse(val);
                                const t2 = p2?.access_token ?? p2?.currentSession?.access_token ?? p2?.token;
                                if (typeof t2 === "string" && t2.startsWith("eyJ") && t2.split(".").length === 3) return t2;
                            } catch {
                                if (val.startsWith("eyJ") && val.split(".").length === 3) return val;
                            }
                        }
                    } catch {
                        // localStorage may be unavailable in some contexts
                    }
                    return null;
                },
            });

            const token = result?.[0]?.result;
            if (typeof token === "string" && isLikelyJwt(token)) {
                return token;
            }
        } catch {
            // Tab may be unavailable or restricted.
        }
    }

    return null;
}

/** Extracts project ID from the active tab URL.
 *  Supports both path-based (/projects/{id}) and subdomain-based
 *  (id-preview--{id}.lovable.app) URL formats.
 */
async function getActiveTabProjectId(tabUrlHint?: string): Promise<string | null> {
    const hasTabUrlHint = typeof tabUrlHint === "string" && tabUrlHint.length > 0;
    if (hasTabUrlHint) {
        return extractProjectIdFromUrl(tabUrlHint);
    }

    const tabUrl = await getActiveTabUrl();
    const hasUrl = tabUrl !== null && tabUrl.length > 0;

    if (!hasUrl) {
        return null;
    }

    return extractProjectIdFromUrl(tabUrl!);
}

async function resolvePrimaryUrl(tabUrlHint?: string): Promise<string> {
    if (typeof tabUrlHint === "string" && tabUrlHint.length > 0) {
        return tabUrlHint;
    }

    const activeTabUrl = await getActiveTabUrl();
    return activeTabUrl ?? COOKIE_URL;
}

function extractSignedUrlTokenFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        const token = parsed.searchParams.get("__lovable_token")
            ?? parsed.searchParams.get("lovable_token");

        return token && isLikelyJwt(token)
            ? token
            : null;
    } catch {
        return null;
    }
}

async function resolveSignedUrlTokenCandidate(
    tabUrlHint?: string,
    primaryUrl?: string,
): Promise<string | null> {
    const hintedToken = extractSignedUrlTokenFromUrl(tabUrlHint);
    if (hintedToken) {
        return hintedToken;
    }

    const primaryToken = extractSignedUrlTokenFromUrl(primaryUrl);
    if (primaryToken) {
        return primaryToken;
    }

    const activeTabUrl = await getActiveTabUrl();
    return extractSignedUrlTokenFromUrl(activeTabUrl);
}

/** Extracts project ID from a URL string. */
function extractProjectIdFromUrl(url: string): string | null {
    // Pattern 1: /projects/{id} (editor URL)
    const pathMatch = url.match(/\/projects\/([^/?#]+)/);
    if (pathMatch?.[1]) {
        return pathMatch[1];
    }

    // Pattern 2: subdomain --{id}.lovable.app (preview URL)
    const subdomainMatch = url.match(/\/\/[^/]*--([a-f0-9-]{36})\.lovable\.app/i);
    if (subdomainMatch?.[1]) {
        return subdomainMatch[1];
    }

    return null;
}

/** Gets the active tab's URL. */
async function getActiveTabUrl(): Promise<string | null> {
    try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        const firstTab = tabs[0];
        return typeof firstTab?.url === "string" ? firstTab.url : null;
    } catch {
        return null;
    }
}
