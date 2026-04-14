/**
 * Marco Extension — Auth Health Handler
 *
 * Runs the full auth strategy waterfall with per-strategy timing,
 * reporting which strategies succeeded/failed and how long each took.
 * Exposed via GET_AUTH_HEALTH message type.
 *
 * NOTE: This file runs in the extension service worker context where
 * chrome.* APIs are available. It is excluded from tsconfig.app.json.
 */

import {
    readCookieValueFromCandidates,
} from "./cookie-helpers";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AuthStrategyResult {
    /** Strategy name (human-readable) */
    name: string;
    /** Tier number (1-5) */
    tier: number;
    /** Whether this strategy produced a valid token */
    success: boolean;
    /** Time taken in milliseconds */
    durationMs: number;
    /** Additional detail (error message, cookie name, etc.) */
    detail: string;
}

export interface AuthHealthResponse {
    /** Overall auth status */
    status: "authenticated" | "degraded" | "unauthenticated";
    /** Which strategy ultimately provided the token (null if none) */
    resolvedVia: string | null;
    /** Total time for the full waterfall */
    totalMs: number;
    /** Per-strategy breakdown */
    strategies: AuthStrategyResult[];
    /** Timestamp of this check */
    checkedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const AUTH_API_BASE = "https://api.lovable.dev";

const PLATFORM_TAB_PATTERNS = [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://lovable.app/*",
    "https://*.lovable.app/*",
    "https://lovableproject.com/*",
    "https://*.lovableproject.com/*",
] as const;

import { getChromeRef } from "./chrome-ref";
// Chrome extension APIs — typed via shared ChromeRef
const _chrome = getChromeRef();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Runs all auth strategies with timing and returns a diagnostic report. */
// eslint-disable-next-line max-lines-per-function
export async function buildAuthHealthResponse(): Promise<AuthHealthResponse> {
    const t0 = performance.now();
    const strategies: AuthStrategyResult[] = [];
    let resolvedVia: string | null = null;

    // Get active tab context
    let tabUrl: string | null = null;
    let projectId: string | null = null;
    try {
        const [tab] = await _chrome.tabs!.query({ active: true, currentWindow: true });
        tabUrl = tab?.url ?? null;
        projectId = extractProjectId(tabUrl);
    } catch { /* ignore */ }

    // ── Strategy 1: Cookie presence check ──
    const s1 = await timedStrategy("Cookie presence", 1, async () => {
        const cookie = await readCookieValueFromCandidates(
            "lovable-session-id.id",
            tabUrl,
        );
        if (cookie !== null) {
            return { success: true, detail: "Session cookie found" };
        }
        const refreshCookie = await readCookieValueFromCandidates(
            "lovable-session-id.refresh",
            tabUrl,
        );
        if (refreshCookie !== null) {
            return { success: true, detail: "Refresh cookie found (no session cookie)" };
        }
        return { success: false, detail: "No auth cookies found" };
    });
    strategies.push(s1);

    // ── Strategy 2: Signed URL token scan ──
    const s3 = await timedStrategy("Signed URL token", 3, async () => {
        if (!tabUrl) {
            return { success: false, detail: "No active tab URL" };
        }

        try {
            const parsed = new URL(tabUrl);
            const token = parsed.searchParams.get("__lovable_token")
                ?? parsed.searchParams.get("lovable_token");

            if (typeof token === "string" && token.startsWith("eyJ") && token.split(".").length === 3) {
                return { success: true, detail: "JWT found in active URL" };
            }
        } catch {
            // Ignore malformed URLs.
        }

        return { success: false, detail: "No signed URL token found" };
    });
    strategies.push(s3);
    if (s3.success && !resolvedVia) resolvedVia = s3.name;

    // ── Strategy 4: Network auth-token exchange (disabled) ──
    const s4 = await timedStrategy("Auth-token exchange", 4, async () => {
        const detail = projectId
            ? `Disabled — cookie/localStorage-only mode (no call to ${AUTH_API_BASE}/projects/${projectId}/auth-token)`
            : `Disabled — cookie/localStorage-only mode (no call to ${AUTH_API_BASE}/projects/{id}/auth-token)`;
        return { success: false, detail };
    });
    strategies.push(s4);
    if (s4.success && !resolvedVia) resolvedVia = s4.name;

    // ── Strategy 5: Cross-tab session cookie scan ──
    const s5 = await timedStrategy("Cross-tab cookie scan", 5, async () => {
        try {
            const cookies = await _chrome.cookies!.getAll({ domain: "lovable.dev" });
            const sessionCookie = (cookies as Array<{ name: string; domain: string; expirationDate?: number }>).find(
                (c) => c.name.includes("session") || c.name.includes("auth"),
            );
            if (sessionCookie) {
                const isExpired = sessionCookie.expirationDate !== undefined &&
                    sessionCookie.expirationDate < Date.now() / 1000;
                if (isExpired) {
                    return { success: false, detail: `Cookie "${sessionCookie.name}" expired` };
                }
                return { success: true, detail: `Cookie "${sessionCookie.name}" (domain=${sessionCookie.domain})` };
            }
            const count = Array.isArray(cookies) ? cookies.length : 0;
            return { success: false, detail: `${count} cookies scanned — no session cookie` };
        } catch (e) {
            return { success: false, detail: (e as Error).message };
        }
    });
    strategies.push(s5);

    const totalMs = Math.round(performance.now() - t0);

    // Determine overall status
    const anySuccess = strategies.some(s => s.success);
    const allFailed = strategies.every(s => !s.success);
    const status: AuthHealthResponse["status"] = allFailed
        ? "unauthenticated"
        : (resolvedVia ? "authenticated" : "degraded");

    // If no strategy explicitly resolved, but cookies exist, it's degraded
    if (!resolvedVia && anySuccess) {
        resolvedVia = strategies.find(s => s.success)?.name ?? null;
    }

    return {
        status,
        resolvedVia,
        totalMs,
        strategies,
        checkedAt: new Date().toISOString(),
    };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function timedStrategy(
    name: string,
    tier: number,
    fn: () => Promise<{ success: boolean; detail: string }>,
): Promise<AuthStrategyResult> {
    const t0 = performance.now();
    try {
        const result = await fn();
        return {
            name,
            tier,
            success: result.success,
            durationMs: Math.round(performance.now() - t0),
            detail: result.detail,
        };
    } catch (e) {
        return {
            name,
            tier,
            success: false,
            durationMs: Math.round(performance.now() - t0),
            detail: `Exception: ${(e as Error).message}`,
        };
    }
}

interface PlatformTab {
    id?: number;
    url?: string;
}

async function getActivePlatformTabs(): Promise<PlatformTab[]> {
    const results: PlatformTab[] = [];
    for (const pattern of PLATFORM_TAB_PATTERNS) {
        try {
            const tabs = await _chrome.tabs!.query({ url: pattern });
            if (Array.isArray(tabs)) results.push(...tabs);
        } catch { /* ignore */ }
    }
    // Dedupe by tab ID
    const seen = new Set<number>();
    return results.filter((t: PlatformTab) => {
        if (typeof t.id !== "number" || seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
    });
}

function extractProjectId(url: string | null): string | null {
    if (!url) return null;
    const match = url.match(/\/projects\/([a-f0-9-]{36})/);
    return match?.[1] ?? null;
}
