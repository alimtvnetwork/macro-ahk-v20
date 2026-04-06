/**
 * Marco Extension — Config & Auth Handler
 *
 * Handles GET_CONFIG, GET_TOKEN, REFRESH_TOKEN messages.
 * Uses chrome.cookies for bearer token and chrome.storage.local
 * for config cascade (remote > local > bundled defaults).
 */

import {
    resolveConfigCascade,
    getRemoteFetchStatus,
} from "../remote-config-fetcher";
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
/*  GET_TOKEN  (with auto-refresh on expiry)                           */
/* ------------------------------------------------------------------ */

/**
 * Reads session cookie and exchanges it for a proper auth token (JWT).
 *
 * See root-cause: spec/02-app-issues/80-auth-token-bridge-null-on-preview.md
 */
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

    // ── Strategy 1 (most reliable): Supabase localStorage JWT from platform tabs ──
    // This is the fastest and most reliable method — no cross-origin issues,
    // no cookie-header stripping, works on all Chrome versions.
    const localStorageJwt = await readSupabaseJwtFromPlatformTabs(tabUrlHint);
    if (localStorageJwt !== null) {
        console.log("[config-auth] GET_TOKEN: found JWT in platform tab localStorage");
        cachedSessionId = localStorageJwt;
        cachedAt = Date.now();
        return {
            token: localStorageJwt,
            refreshed: true,
            cookieName: "localStorage[sb-*-auth-token]",
        };
    }

    // ── Strategy 2: Auth-token endpoint exchange via platform tab ──
    // Uses credentials:'include' from a lovable.dev tab's MAIN world.
    const resolvedCookieNames = await resolveSessionCookieNamesFromProjects(projectId);
    const authToken = await fetchAuthToken(null, projectId ?? undefined, tabUrlHint);

    if (authToken !== null) {
        console.log("[config-auth] GET_TOKEN: obtained JWT from auth-token endpoint");
        cachedSessionId = authToken;
        cachedAt = Date.now();
        return {
            token: authToken,
            refreshed: true,
            cookieName: COOKIE_SESSION_ID,
        };
    }

    // ── Strategy 3: Session cookie is already a JWT ──
    const primaryUrl = await resolvePrimaryUrl(tabUrlHint);
    const sessionLookup = await readCookieValueByNameCandidates(
        resolvedCookieNames.sessionNames,
        primaryUrl,
    );
    if (sessionLookup.value !== null && isLikelyJwt(sessionLookup.value)) {
        cachedSessionId = sessionLookup.value;
        cachedAt = Date.now();
        return {
            token: sessionLookup.value,
            refreshed: true,
            cookieName: sessionLookup.cookieName ?? COOKIE_SESSION_ID,
        };
    }

    if (sessionLookup.value !== null) {
        console.warn("[config-auth] GET_TOKEN: session cookie exists but no JWT could be derived");
        return {
            token: null,
            refreshed: false,
            errorMessage: "Session cookie exists, but JWT exchange/storage fallback failed.",
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
/*  REFRESH_TOKEN  (forced re-read + API refresh)                      */
/* ------------------------------------------------------------------ */

/** Forces cookie re-read and API refresh. */
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

    // Strategy 1 (most reliable): Supabase localStorage JWT
    let authToken = await readSupabaseJwtFromPlatformTabs(tabUrlHint);

    // Strategy 2: Auth-token endpoint exchange
    if (!authToken) {
        authToken = await fetchAuthToken(null, projectId, tabUrlHint);
    }

    // Strategy 3: Session cookie is already a JWT
    if (!authToken && sessionId && isLikelyJwt(sessionId)) {
        authToken = sessionId;
    }

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

/** Attempts to get a fresh auth token via credentials-based exchange. */
async function attemptAutoRefresh(
    projectId?: string,
): Promise<string | null> {
    if (isRefreshing) {
        return null;
    }

    isRefreshing = true;

    try {
        // v1.68.1: Use credentials:'include' — no need to read cookies manually
        const authToken = await fetchAuthToken(null, projectId);

        if (authToken !== null) {
            cachedSessionId = authToken;
            cachedAt = Date.now();
            console.log("[config-auth] Auto-refresh successful (JWT)");
            return authToken;
        }

        console.warn("[config-auth] Auto-refresh returned no token");
        return null;
    } catch (refreshError) {
        logRefreshError(refreshError);
        return null;
    } finally {
        isRefreshing = false;
    }
}

/**
 * Calls GET /projects/{projectId}/auth-token using cookie credentials.
 *
 * v1.68.1 FIX: The session cookie is NOT a JWT — sending it as
 * `Authorization: Bearer <cookie>` always returns 401 "Invalid token".
 * Instead, use `credentials: 'include'` so the browser sends the
 * HttpOnly session cookie natively in the Cookie header.
 */
export async function fetchAuthToken(
    _bearerToken: string | null,
    projectId?: string,
    tabUrlHint?: string,
): Promise<string | null> {
    const projectIdCandidates = await getProjectIdCandidates(projectId, tabUrlHint);

    if (projectIdCandidates.length === 0) {
        console.warn("[config-auth] No project ID available for auth-token call");
        return null;
    }

    const primaryUrl = await resolvePrimaryUrl(tabUrlHint);
    const resolved = await resolveSessionCookieNamesFromProjects();

    const sessionCookieLookup = await readCookieValueByNameCandidates(
        resolved.sessionNames,
        primaryUrl,
    );
    const refreshCookieLookup = await readCookieValueByNameCandidates(
        resolved.refreshNames,
        primaryUrl,
    );

    const cookieHeader = buildAuthCookieHeader(
        sessionCookieLookup,
        refreshCookieLookup,
    );
    const signedUrlToken = await resolveSignedUrlTokenCandidate(tabUrlHint, primaryUrl);

    if (!cookieHeader) {
        // Diagnostic: dump all cookies visible to the extension for debugging
        try {
            const candidateUrls = buildCookieUrlCandidates(primaryUrl);
            console.warn("[config-auth] No session cookie found. Diagnostics:", {
                primaryUrl,
                candidateUrls,
                sessionNames: [...resolved.sessionNames],
                refreshNames: [...resolved.refreshNames],
            });
            for (const url of candidateUrls.slice(0, 4)) {
                try {
                    const allCookies = await chrome.cookies.getAll({ url });
                    const names = allCookies.map(c => `${c.name} (domain=${c.domain})`);
                    console.warn(`[config-auth] Cookies for ${url}:`, names.length > 0 ? names : "(none)");
                } catch (e) {
                    console.warn(`[config-auth] getAll failed for ${url}:`, e);
                }
            }
        } catch { /* diagnostic-only */ }

        if (signedUrlToken !== null) {
            console.log("[config-auth] Using signed URL token fallback (no auth cookies available)");
            return signedUrlToken;
        }

        console.warn("[config-auth] No auth cookies found — cannot call auth-token endpoint");
        return null;
    }

    // Strategy 1: Execute fetch from a platform tab's MAIN world where
    // credentials: 'include' actually works (cookies sent natively).
    // This bypasses the MV3 service worker forbidden-header limitation
    // where the `cookie` header is silently stripped from fetch() calls.
    const tabBasedToken = await fetchAuthTokenViaPlatformTab(projectIdCandidates);
    if (tabBasedToken !== null) {
        return tabBasedToken;
    }

    // Strategy 2: Direct fetch from service worker with manual Cookie header.
    // This may fail on Chrome 120+ due to forbidden-header enforcement,
    // but works on some Chromium variants (Brave, older Chrome).
    for (const candidateProjectId of projectIdCandidates) {
        const url = `${AUTH_API_BASE}/projects/${candidateProjectId}/auth-token`;

        try {
            const response = await fetch(url, {
                method: "GET",
                headers: {
                    "accept": "application/json",
                    "cookie": cookieHeader,
                },
            });

            const isOk = response.ok;

            if (!isOk) {
                console.warn(`[config-auth] Auth-token endpoint returned HTTP ${response.status} for project ${candidateProjectId}`);
                continue;
            }

            const data = await response.json();
            const newToken: string | null = data.token ?? data.access_token ?? data.authToken ?? null;

            if (newToken && isLikelyJwt(newToken)) {
                console.log(`[config-auth] auth-token exchange returned valid JWT for project ${candidateProjectId} (direct fetch)`);
                return newToken;
            }

            if (newToken) {
                console.warn("[config-auth] auth-token exchange returned non-JWT token — discarding");
            }
        } catch (fetchError) {
            logRefreshError(fetchError);
        }
    }

    if (signedUrlToken !== null) {
        console.log("[config-auth] Falling back to signed URL token after auth-token exchange failure");
        return signedUrlToken;
    }

    return null;
}

/**
 * Executes the auth-token fetch from within a platform tab's MAIN world.
 * This is the primary strategy because:
 *
 * 1. MV3 service worker fetch() silently strips the `Cookie` header
 *    (it's a "forbidden header name" per the Fetch spec).
 * 2. In a page's MAIN world, fetch() with credentials:'include'
 *    naturally sends HttpOnly cookies set on that domain.
 * 3. This ensures the lovable.dev session cookie is sent to api.lovable.dev.
 *
 * See: spec/02-app-issues/80-auth-token-bridge-null-on-preview.md
 */
async function fetchAuthTokenViaPlatformTab(
    projectIdCandidates: string[],
): Promise<string | null> {
    const platformTabs = await getActivePlatformTabs();

    // Prefer lovable.dev tabs (where cookies are set), then any platform tab
    const sortedTabs = [...platformTabs].sort((a, b) => {
        const aIsLovableDev = a.url?.includes("lovable.dev") ? 0 : 1;
        const bIsLovableDev = b.url?.includes("lovable.dev") ? 0 : 1;
        return aIsLovableDev - bIsLovableDev;
    });

    for (const tab of sortedTabs) {
        if (typeof tab.id !== "number") continue;

        for (const candidateProjectId of projectIdCandidates) {
            try {
                const result = await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: "MAIN",
                    func: async (apiBase: string, projId: string): Promise<string | null> => {
                        try {
                            const resp = await fetch(`${apiBase}/projects/${projId}/auth-token`, {
                                method: "GET",
                                credentials: "include",
                                headers: { "accept": "application/json" },
                            });
                            if (!resp.ok) return null;
                            const data = await resp.json();
                            const token = data.token ?? data.access_token ?? data.authToken ?? null;
                            if (typeof token === "string" && token.startsWith("eyJ") && token.split(".").length === 3) {
                                return token;
                            }
                            return null;
                        } catch {
                            return null;
                        }
                    },
                    args: [AUTH_API_BASE, candidateProjectId],
                });

                const token = result?.[0]?.result;
                if (typeof token === "string" && isLikelyJwt(token)) {
                    console.log(
                        "[config-auth] auth-token exchange via platform tab (tabId=%d, project=%s) returned valid JWT",
                        tab.id, candidateProjectId,
                    );
                    return token;
                }
            } catch (err) {
                // Tab may be restricted or closed — try next
                const reason = err instanceof Error ? err.message : String(err);
                console.warn("[config-auth] Platform tab fetch failed (tabId=%d): %s", tab.id, reason);
            }
        }
    }

    return null;
}

function buildAuthCookieHeader(
    sessionLookup: CookieLookupResult,
    refreshLookup: CookieLookupResult,
): string {
    const parts: string[] = [];

    if (sessionLookup.value !== null) {
        parts.push(`${sessionLookup.cookieName ?? COOKIE_SESSION_ID}=${sessionLookup.value}`);
    }

    if (refreshLookup.value !== null) {
        parts.push(`${refreshLookup.cookieName ?? COOKIE_REFRESH_TOKEN}=${refreshLookup.value}`);
    }

    return parts.join("; ");
}

async function getProjectIdCandidates(
    explicitProjectId?: string,
    tabUrlHint?: string,
): Promise<string[]> {
    const candidates = new Set<string>();

    if (typeof explicitProjectId === "string" && explicitProjectId.length > 0) {
        candidates.add(explicitProjectId);
    }

    if (typeof tabUrlHint === "string" && tabUrlHint.length > 0) {
        const hintedProjectId = extractProjectIdFromUrl(tabUrlHint);
        if (hintedProjectId) {
            candidates.add(hintedProjectId);
        }
    }

    const activeProjectId = await getActiveTabProjectId();
    if (activeProjectId) {
        candidates.add(activeProjectId);
    }

    return [...candidates];
}

/** Checks if a token looks like a JWT (3-part base64 starting with eyJ). */
function isLikelyJwt(token: string): boolean {
    return token.startsWith("eyJ") && token.split(".").length === 3;
}

interface TokenValidationResult {
    isValid: boolean;
    status: number | null;
}

/** Validates a token by probing the API (lightweight check). */
async function validateToken(
    token: string,
    projectId?: string,
): Promise<TokenValidationResult> {
    const resolvedProjectId = projectId ?? await getActiveTabProjectId();
    const hasProjectId = resolvedProjectId !== null;

    if (!hasProjectId) {
        // Can't validate without project ID — assume valid
        return { isValid: true, status: null };
    }

    try {
        const url = `${AUTH_API_BASE}/projects/${resolvedProjectId}/auth-token`;
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "accept": "*/*",
                "authorization": `Bearer ${token}`,
            },
        });

        // Only 401 is definitive token-expired for fallback blocking.
        if (response.status === 401) {
            return { isValid: false, status: 401 };
        }

        // 403 can be project-permission mismatch while token is still valid elsewhere.
        if (response.status === 403) {
            return { isValid: true, status: 403 };
        }

        return { isValid: response.ok, status: response.status };
    } catch {
        // Network error — assume valid to avoid blocking
        return { isValid: true, status: null };
    }
}

/** Returns the active tab URL when available. */
async function getActiveTabUrl(): Promise<string | null> {
    try {
        const tabs = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        return tabs[0]?.url ?? null;
    } catch {
        return null;
    }
}

async function getActivePlatformTabs(tabUrlHint?: string): Promise<chrome.tabs.Tab[]> {
    const byHint: chrome.tabs.Tab[] = [];

    if (typeof tabUrlHint === "string" && tabUrlHint.length > 0) {
        try {
            const hintedTabs = await chrome.tabs.query({ url: [tabUrlHint] });
            byHint.push(...hintedTabs);
        } catch {
            // Ignore hint query failures.
        }
    }

    const patternTabs = await chrome.tabs.query({ url: [...PLATFORM_TAB_PATTERNS] });

    const merged = new Map<number, chrome.tabs.Tab>();
    for (const tab of byHint) {
        if (typeof tab.id === "number") merged.set(tab.id, tab);
    }
    for (const tab of patternTabs) {
        if (typeof tab.id === "number") merged.set(tab.id, tab);
    }

    return [...merged.values()];
}

async function readSupabaseJwtFromPlatformTabs(tabUrlHint?: string): Promise<string | null> {
    const tabs = await getActivePlatformTabs(tabUrlHint);

    for (const tab of tabs) {
        if (typeof tab.id !== "number") continue;

        try {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: "MAIN",
                func: function scanLocalStorageForJwt(): string | null {
                    try {
                        var len = localStorage.length;
                        // Priority 1: Supabase auth token (sb-*-auth-token)
                        for (var i = 0; i < len; i++) {
                            var key = localStorage.key(i);
                            if (!key) continue;
                            if (key.startsWith("sb-") && key.includes("-auth-token")) {
                                var raw = localStorage.getItem(key);
                                if (!raw) continue;
                                try {
                                    var parsed = JSON.parse(raw);
                                    var token = parsed?.access_token
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
                        var lovableKeys = ["lovable-auth-token", "lovable:token", "auth-token", "supabase.auth.token"];
                        for (var j = 0; j < lovableKeys.length; j++) {
                            var val = localStorage.getItem(lovableKeys[j]);
                            if (!val) continue;
                            try {
                                var p2 = JSON.parse(val);
                                var t2 = p2?.access_token ?? p2?.currentSession?.access_token ?? p2?.token;
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
    if (pathMatch) return pathMatch[1];

    try {
        const hostname = new URL(url).hostname;
        const firstLabel = hostname.split(".")[0] ?? "";

        // Pattern 2: id-preview--{uuid}.{domain}
        const idPreviewLabelMatch = firstLabel.match(/^id-preview--([a-f0-9-]{36})$/i);
        if (idPreviewLabelMatch) return idPreviewLabelMatch[1];

        // Pattern 3: {uuid}--preview.{domain} or {uuid}-preview.{domain}
        const previewSuffixLabelMatch = firstLabel.match(/^([a-f0-9-]{36})(?:--preview|-preview)$/i);
        if (previewSuffixLabelMatch) return previewSuffixLabelMatch[1];

        // Pattern 4: bare UUID subdomain: {uuid}.lovableproject.com
        const bareUuidLabelMatch = firstLabel.match(/^([a-f0-9-]{36})$/i);
        if (bareUuidLabelMatch) return bareUuidLabelMatch[1];
    } catch {
        // Fall through to legacy string regex checks below.
    }

    // Legacy fallback regexes (defensive)
    const subdomainMatch = url.match(/id-preview--([a-f0-9-]{36})\./i);
    if (subdomainMatch) return subdomainMatch[1];

    const altSubdomainMatch = url.match(/([a-f0-9-]{36})(?:--preview|-preview)\./i);
    if (altSubdomainMatch) return altSubdomainMatch[1];

    const bareUuidSubdomainMatch = url.match(/https?:\/\/([a-f0-9-]{36})\.[^/]+/i);
    if (bareUuidSubdomainMatch) return bareUuidSubdomainMatch[1];

    return null;
}

/* ------------------------------------------------------------------ */
/*  Cookie Reader                                                      */
/* ------------------------------------------------------------------ */

async function readCookieValueByNameCandidates(
    cookieNames: readonly string[],
    primaryUrl: string,
): Promise<CookieLookupResult> {
    for (const cookieName of cookieNames) {
        let value: string | null = null;

        try {
            value = await readCookieValueFromCandidates(cookieName, primaryUrl);
        } catch (cookieError) {
            const errorMessage = cookieError instanceof Error
                ? cookieError.message
                : String(cookieError);
            console.warn(`[config-auth] Cookie read failed (${cookieName}): ${errorMessage}`);
        }

        if (value !== null) {
            return { value, cookieName };
        }
    }

    return { value: null, cookieName: null };
}

async function discoverAuthCookieNames(primaryUrl: string): Promise<CookieDiscoverySummary> {
    const checkedUrls = buildCookieUrlCandidates(primaryUrl);
    const authLikeCookieNames = new Set<string>();
    const canListCookies = typeof chrome.cookies?.getAll === "function";

    if (!canListCookies) {
        return { checkedUrls, authLikeCookieNames: [] };
    }

    for (const url of checkedUrls) {
        try {
            const cookies = await chrome.cookies.getAll({ url });

            for (const cookie of cookies) {
                const isAuthLike = AUTH_COOKIE_NAME_PATTERN.test(cookie.name);

                if (isAuthLike) {
                    authLikeCookieNames.add(cookie.name);
                }
            }
        } catch {
            // Ignore candidate URL errors and keep scanning.
        }
    }

    return {
        checkedUrls,
        authLikeCookieNames: [...authLikeCookieNames],
    };
}

function buildMissingCookieMessage(
    summary: CookieDiscoverySummary,
    expectedSessionNamesInput: readonly string[],
    expectedRefreshNamesInput: readonly string[],
): string {
    const expectedSessionNames = expectedSessionNamesInput.join(", ");
    const expectedRefreshNames = expectedRefreshNamesInput.join(", ");
    const foundNames = summary.authLikeCookieNames.length > 0
        ? summary.authLikeCookieNames.join(", ")
        : "none";

    return [
        "Session cookie not found via chrome.cookies.get.",
        `Expected session names: [${expectedSessionNames}].`,
        `Expected refresh names: [${expectedRefreshNames}].`,
        `Checked URLs: [${summary.checkedUrls.join(", ")}].`,
        `Found auth-like cookie names: [${foundNames}].`,
    ].join(" ");
}

/* ------------------------------------------------------------------ */
/*  Error Logging                                                      */
/* ------------------------------------------------------------------ */

/** Logs a refresh failure. */
function logRefreshError(error: unknown): void {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    console.warn(`[config-auth] Token refresh failed: ${errorMessage}`);
}
