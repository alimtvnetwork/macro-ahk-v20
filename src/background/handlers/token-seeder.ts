/**
 * Marco Extension — Token Seeder
 *
 * Reads session cookies, signed URL tokens, and the page's localStorage, then
 * seeds a JWT into the target tab only when a valid JWT is already available.
 * It never calls the auth-token endpoint and never seeds raw opaque cookie values.
 *
 * v1.68.1 FIX: Raw session cookies are NOT JWTs — seeding them into
 * localStorage[marco_bearer_token] caused Tier 1 resolution to return
 *
 * @see spec/05-chrome-extension/04-cookie-and-auth.md — Cookie & auth strategy
 * @see spec/05-chrome-extension/36-cookie-only-bearer.md — Cookie-only bearer flow
 */

import { readCookieValueFromCandidates } from "../cookie-helpers";
import { readAllProjects } from "./project-helpers";
import type { CookieBinding } from "../../shared/project-types";
import { logBgWarnError, logCaughtError, BgLogTag} from "../bg-logger";

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
const LS_TOKEN_SAVED_AT_KEY = "marco_token_saved_at";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Seeds a verified JWT auth token into the target tab's localStorage.
 *
 * Resolution order:
 * 1. Read existing Supabase JWT from page localStorage (sb-*-auth-token)
 * 2. Read a JWT from signed preview URL (__lovable_token / lovable_token)
 * 3. Read a JWT directly from session cookies
 * 4. If neither works, DO NOT seed — let macro controller handle it
 */
export async function seedTokensIntoTab(tabId: number): Promise<void> {
    const tabUrl = await getTabUrl(tabId);
    const isSupportedTab = tabUrl !== null && isSupportedTargetUrl(tabUrl);

    if (!isSupportedTab) {
        return;
    }

    // Step 1: Check if page already has a Supabase JWT in localStorage
    const existingJwt = await readSupabaseJwtFromTab(tabId);

    if (existingJwt !== null) {
        console.log("[token-seeder] Found existing Supabase JWT in tab %d — seeding into marco keys", tabId);
        await injectJwtIntoTab(tabId, existingJwt);
        return;
    }

    // Step 2: Read signed preview URL token from tab/frame URLs
    const signedUrlToken = await resolveSignedUrlTokenCandidate(tabId, tabUrl);

    if (signedUrlToken !== null) {
        console.log("[token-seeder] Found signed URL JWT in tab/frame URL — seeding into tab %d", tabId);
        await injectJwtIntoTab(tabId, signedUrlToken);
        return;
    }

    // Step 3: Read session cookie directly and only seed it if it is already a JWT
    const projectId = extractProjectIdFromTabUrl(tabUrl);
    const sessionCookieNames = await resolveSessionCookieNamesFromProjects();
    const sessionLookup = await readCookieValueByNameCandidates(sessionCookieNames, tabUrl);

    if (sessionLookup.value !== null && sessionLookup.value.startsWith("eyJ") && sessionLookup.value.split(".").length === 3) {
        console.log("[token-seeder] Found JWT directly in session cookie — seeding into tab %d", tabId);
        await injectJwtIntoTab(tabId, sessionLookup.value);
        return;
    }

    // Step 4: Check if session cookie exists (for diagnostics only)
    if (sessionLookup.value !== null) {
        logBgWarnError(BgLogTag.TOKEN_SEEDER, `Session cookie exists for project ${projectId ?? "unknown"} but no JWT is available — NOT seeding raw cookie`);
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
                LS_TOKEN_SAVED_AT_KEY,
            ],
        });

        console.log("[token-seeder] Seeded JWT into tab %d localStorage", tabId);
    } catch (seedError) {
        logCaughtError(BgLogTag.TOKEN_SEEDER, `Failed to seed JWT into tab\n  Path: chrome.scripting.executeScript → tabId=${tabId}, world=MAIN → localStorage["${LS_MARCO_BEARER_KEY}"]\n  Missing: JWT bearer token in tab localStorage\n  Reason: ${seedError instanceof Error ? seedError.message : String(seedError)}`, seedError);
    }
}

/** Writes a JWT to localStorage marco keys. Runs in MAIN world. */
function writeJwtToLocalStorage(
    jwt: string,
    sessionKey: string,
    sessionCookieKey: string,
    marcoBearerKey: string,
    tokenSavedAtKey: string,
): void {
    try {
        localStorage.setItem(sessionKey, jwt);
        localStorage.setItem(sessionCookieKey, jwt);
        localStorage.setItem(marcoBearerKey, jwt);
        localStorage.setItem(tokenSavedAtKey, String(Date.now()));
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
// eslint-disable-next-line sonarjs/cognitive-complexity -- localStorage scan with priority matching
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

function isLikelyJwt(token: string): boolean {
    return token.startsWith("eyJ") && token.split(".").length === 3;
}

function extractSignedUrlTokenFromUrl(url: string | null | undefined): string | null {
    if (!url) {
        return null;
    }

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

async function resolveSignedUrlTokenCandidate(tabId: number, tabUrl: string | null): Promise<string | null> {
    const directToken = extractSignedUrlTokenFromUrl(tabUrl);

    if (directToken !== null) {
        return directToken;
    }

    try {
        const frames = await chrome.webNavigation.getAllFrames({ tabId });

        for (const frame of frames ?? []) {
            const frameUrl = typeof frame?.url === "string" ? frame.url : "";
            const token = extractSignedUrlTokenFromUrl(frameUrl);

            if (token !== null) {
                return token;
            }
        }
    } catch {
        // Frame URLs may be unavailable on restricted tabs.
    }

    return null;
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
