/**
 * Marco Extension — Token Seeder
 *
 * Reads session cookies and attempts to exchange them for a proper JWT
 * via the auth-token endpoint, then seeds the JWT into the target tab's
 * localStorage. If exchange fails, scans the page's Supabase localStorage
 * keys for an existing JWT. NEVER seeds raw cookie values.
 *
 * v1.68.1 FIX: Raw session cookies are NOT JWTs — seeding them into
 * localStorage[marco_bearer_token] caused Tier 1 resolution to return
 * an invalid token, producing 401 errors. Now only seeds verified JWTs.
 */

import { readCookieValueFromCandidates } from "../cookie-helpers";
import { fetchAuthToken } from "./config-auth-handler";
import { readAllProjects } from "./project-helpers";
import type { CookieBinding } from "../../shared/project-types";

const SESSION_COOKIE_NAME_FALLBACKS = [
    "lovable-session-id-v2",
    "lovable-session-id.id",
    "__Secure-lovable-session-id.id",
    "__Host-lovable-session-id.id",
    "lovable-session-id",
] as const;

const LS_SESSION_KEY = "lovable-session-id";
const LS_SESSION_COOKIE_KEY = "lovable-session-id.id";
const LS_MARCO_BEARER_KEY = "marco_bearer_token";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Seeds a verified JWT auth token into the target tab's localStorage.
 *
 * Resolution order:
 * 1. Exchange session cookie for JWT via /auth-token (cookie sent via chrome.cookies.get + Cookie header)
 * 2. Read existing Supabase JWT from page localStorage (sb-*-auth-token)
 * 3. If neither works, DO NOT seed — let macro controller handle it
 */
export async function seedTokensIntoTab(tabId: number): Promise<void> {
    const tabUrl = await getTabUrl(tabId);
    const isSupportedTab = tabUrl !== null && isSupportedTargetUrl(tabUrl);

    if (!isSupportedTab) {
        return;
    }

    // Step 1: Try auth-token exchange (uses cookies via credentials:'include')
    const projectId = extractProjectIdFromTabUrl(tabUrl);
    const authToken = await fetchAuthToken(null, projectId ?? undefined, tabUrl ?? undefined);

    if (authToken !== null) {
        console.log("[token-seeder] Got JWT from auth-token exchange — seeding into tab %d", tabId);
        await injectJwtIntoTab(tabId, authToken);
        return;
    }

    // Step 2: Check if page already has a Supabase JWT in localStorage
    const existingJwt = await readSupabaseJwtFromTab(tabId);

    if (existingJwt !== null) {
        console.log("[token-seeder] Found existing Supabase JWT in tab %d — seeding into marco keys", tabId);
        await injectJwtIntoTab(tabId, existingJwt);
        return;
    }

    // Step 3: Check if session cookie exists (for diagnostics)
    const sessionCookieNames = await resolveSessionCookieNamesFromProjects();
    const sessionLookup = await readCookieValueByNameCandidates(sessionCookieNames, tabUrl);

    if (sessionLookup.value !== null) {
        console.warn("[token-seeder] Session cookie exists but no JWT available — NOT seeding raw cookie (would cause 401)");
    } else {
        console.log("[token-seeder] No session cookies found — skipping seed");
    }
}

/* ------------------------------------------------------------------ */
/*  JWT Injection (runs in page context)                               */
/* ------------------------------------------------------------------ */

/** Injects a verified JWT into the tab's localStorage marco keys. */
async function injectJwtIntoTab(tabId: number, jwt: string): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: writeJwtToLocalStorage,
            args: [
                jwt,
                LS_SESSION_KEY,
                LS_SESSION_COOKIE_KEY,
                LS_MARCO_BEARER_KEY,
            ],
        });

        console.log("[token-seeder] Seeded JWT into tab %d localStorage", tabId);
    } catch (seedError) {
        const reason = seedError instanceof Error ? seedError.message : String(seedError);
        console.warn("[token-seeder] Failed to seed JWT: %s", reason);
    }
}

/** Writes a JWT to localStorage marco keys. Runs in MAIN world. */
function writeJwtToLocalStorage(
    jwt: string,
    sessionKey: string,
    sessionCookieKey: string,
    marcoBearerKey: string,
): void {
    try {
        localStorage.setItem(sessionKey, jwt);
        localStorage.setItem(sessionCookieKey, jwt);
        localStorage.setItem(marcoBearerKey, jwt);
    } catch {
        // localStorage may be unavailable — fail silently
    }
}

/* ------------------------------------------------------------------ */
/*  Supabase JWT Reader (runs in page context)                         */
/* ------------------------------------------------------------------ */

/** Reads an existing Supabase JWT from the tab's localStorage. */
async function readSupabaseJwtFromTab(tabId: number): Promise<string | null> {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: scanSupabaseLocalStorageForJwt,
        });

        const jwt = results?.[0]?.result;
        return typeof jwt === "string" && jwt.startsWith("eyJ") ? jwt : null;
    } catch {
        return null;
    }
}

/** Scans localStorage for Supabase auth keys and returns the access_token JWT. Runs in MAIN world. */
function scanSupabaseLocalStorageForJwt(): string | null {
    try {
        const len = localStorage.length;

        for (let i = 0; i < len; i++) {
            const key = localStorage.key(i);
            if (!key) continue;

            // Match Supabase auth token keys: sb-<ref>-auth-token
            const isSupabaseKey = key.startsWith("sb-") && key.includes("-auth-token");
            if (!isSupabaseKey) continue;

            const raw = localStorage.getItem(key);
            if (!raw || raw.length < 20) continue;

            try {
                const parsed = JSON.parse(raw);
                const accessToken = parsed?.access_token;

                if (typeof accessToken === "string" && accessToken.startsWith("eyJ")) {
                    return accessToken;
                }

                // Check nested session object
                const session = parsed?.currentSession ?? parsed?.session;
                if (session?.access_token && typeof session.access_token === "string" && session.access_token.startsWith("eyJ")) {
                    return session.access_token;
                }
            } catch {
                // Not JSON — check if raw value is a JWT
                if (raw.startsWith("eyJ") && raw.split(".").length === 3) {
                    return raw;
                }
            }
        }
    } catch {
        // localStorage unavailable
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function isSupportedTargetUrl(url: string): boolean {
    return url.includes("lovable.dev")
        || url.includes("lovable.app")
        || url.includes("lovableproject.com")
        || url.includes("localhost");
}

async function getTabUrl(tabId: number): Promise<string | null> {
    try {
        const tab = await chrome.tabs.get(tabId);
        return tab.url ?? null;
    } catch {
        return null;
    }
}

/** Extracts project ID from a tab URL.
 *  Supports editor URLs and preview hostnames on lovable.app/lovableproject.com.
 */
function extractProjectIdFromTabUrl(url: string | null): string | null {
    if (!url) return null;

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
        // Ignore malformed URLs and continue with fallback regex checks.
    }

    const subdomainMatch = url.match(/id-preview--([a-f0-9-]{36})\./i);
    if (subdomainMatch) return subdomainMatch[1];

    const altSubdomainMatch = url.match(/([a-f0-9-]{36})(?:--preview|-preview)\./i);
    if (altSubdomainMatch) return altSubdomainMatch[1];

    const bareUuidSubdomainMatch = url.match(/https?:\/\/([a-f0-9-]{36})\.[^/]+/i);
    if (bareUuidSubdomainMatch) return bareUuidSubdomainMatch[1];

    return null;
}

interface CookieLookupResult {
    value: string | null;
    cookieName: string | null;
}

async function readCookieValueByNameCandidates(
    cookieNames: readonly string[],
    primaryUrl?: string | null,
): Promise<CookieLookupResult> {
    for (const cookieName of cookieNames) {
        const value = await readCookieValueFromCandidates(cookieName, primaryUrl);

        if (value !== null) {
            return { value, cookieName };
        }
    }

    return { value: null, cookieName: null };
}

async function resolveSessionCookieNamesFromProjects(): Promise<readonly string[]> {
    try {
        const projects = await readAllProjects();
        const cookieBindings: CookieBinding[] = [];

        for (const project of projects) {
            if (project.cookies && project.cookies.length > 0) {
                cookieBindings.push(...project.cookies);
            }
        }

        const names = cookieBindings
            .filter((binding) => binding.role === "session")
            .map((binding) => binding.cookieName)
            .filter((cookieName): cookieName is string => typeof cookieName === "string" && cookieName.length > 0);

        return [...new Set([...names, ...SESSION_COOKIE_NAME_FALLBACKS])];
    } catch {
        return SESSION_COOKIE_NAME_FALLBACKS;
    }
}
