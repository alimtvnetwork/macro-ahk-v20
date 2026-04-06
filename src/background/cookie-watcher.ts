/**
 * Marco Extension — Cookie Change Watcher
 *
 * Listens for changes to session and refresh cookies.
 * On removal (logout/expiry), proactively attempts auto-refresh
 * and notifies content scripts.
 *
 * v1.68.0: Reseeds localStorage in all platform tabs on cookie update
 * so the macro controller always has a fresh token.
 *
 * See spec/05-chrome-extension/04-cookie-and-auth.md §Cookie Change Listener.
 */

import { MessageType } from "../shared/messages";
import { handleGetToken, handleRefreshToken } from "./handlers/config-auth-handler";
import { seedTokensIntoTab } from "./handlers/token-seeder";
import { logCaughtError, BgLogTag} from "./bg-logger";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SESSION_COOKIE_NAMES = [
    "lovable-session-id-v2",
    "lovable-session-id.id",
    "__Secure-lovable-session-id.id",
    "__Host-lovable-session-id.id",
    "lovable-session-id",
] as const;
const REFRESH_COOKIE_NAMES = [
    "lovable-session-id.refresh",
    "__Secure-lovable-session-id.refresh",
    "__Host-lovable-session-id.refresh",
] as const;
const TARGET_COOKIE_DOMAIN_PARTS = [
    "lovable.dev",
    "lovable.app",
    "lovableproject.com",
] as const;
const TARGET_TAB_PATTERNS = [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://lovable.app/*",
    "https://*.lovable.app/*",
    "https://lovableproject.com/*",
    "https://*.lovableproject.com/*",
];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Registers the chrome.cookies.onChanged listener. */
export function registerCookieWatcher(): void {
    chrome.cookies.onChanged.addListener(handleCookieChange);
    console.log("[cookie-watcher] Registered cookie change listener");
}

/* ------------------------------------------------------------------ */
/*  Change Handler                                                     */
/* ------------------------------------------------------------------ */

/** Handles a single cookie change event. */
async function handleCookieChange(
    changeInfo: chrome.cookies.CookieChangeInfo,
): Promise<void> {
    const cookieName = changeInfo.cookie.name;
    const cookieDomain = changeInfo.cookie.domain;

    const isTargetDomain = TARGET_COOKIE_DOMAIN_PARTS
        .some((domainPart) => cookieDomain.includes(domainPart));
    const isSessionCookie = SESSION_COOKIE_NAMES.includes(cookieName as (typeof SESSION_COOKIE_NAMES)[number]);
    const isRefreshCookie = REFRESH_COOKIE_NAMES.includes(cookieName as (typeof REFRESH_COOKIE_NAMES)[number]);
    const isRelevantCookie = isTargetDomain && (isSessionCookie || isRefreshCookie);

    if (!isRelevantCookie) {
        return;
    }

    const isRemoved = changeInfo.removed;

    if (isRemoved) {
        await handleCookieRemoved(cookieName);
    } else {
        await handleCookieUpdated(cookieName, changeInfo.cookie.value);
    }
}

/* ------------------------------------------------------------------ */
/*  Cookie Removed (expiry / logout)                                   */
/* ------------------------------------------------------------------ */

/** Handles session or refresh cookie removal. */
async function handleCookieRemoved(cookieName: string): Promise<void> {
    const isSessionCookie = SESSION_COOKIE_NAMES.includes(cookieName as (typeof SESSION_COOKIE_NAMES)[number]);

    if (isSessionCookie) {
        console.log("[cookie-watcher] Session cookie removed — attempting auto-refresh");

        // Proactively try to refresh before notifying scripts
        const refreshResult = await attemptProactiveRefresh();
        const isRefreshSuccessful = refreshResult !== null;

        if (isRefreshSuccessful) {
            console.log("[cookie-watcher] Proactive refresh succeeded");
            // Reseed the refreshed token into all platform tabs
            await reseedAllTargetTabs();
            await broadcastToTargetTabs(MessageType.TOKEN_UPDATED, {
                token: refreshResult,
                source: "proactive-refresh",
            });
        } else {
            console.warn("[cookie-watcher] Proactive refresh failed — notifying scripts");
            await broadcastToTargetTabs(MessageType.TOKEN_EXPIRED, {
                cookie: cookieName,
                reason: "cookie_removed",
            });
        }
    } else {
        // Refresh cookie removed — notify but don't attempt refresh
        console.warn("[cookie-watcher] Refresh cookie removed");
        await broadcastToTargetTabs(MessageType.TOKEN_EXPIRED, {
            cookie: cookieName,
            reason: "refresh_cookie_removed",
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Cookie Updated (login / refresh)                                   */
/* ------------------------------------------------------------------ */

/** Handles session or refresh cookie being set or updated. */
async function handleCookieUpdated(
    cookieName: string,
    _value: string,
): Promise<void> {
    const isSessionCookie = SESSION_COOKIE_NAMES.includes(cookieName as (typeof SESSION_COOKIE_NAMES)[number]);

    if (isSessionCookie) {
        console.log("[cookie-watcher] Session cookie updated — reseeding & notifying scripts");

        // v1.68.0: Reseed localStorage in all tabs so macro controller picks up the new token
        await reseedAllTargetTabs();

        // Never broadcast raw cookie value as token; only broadcast verified JWT.
        const tokenResult = await handleGetToken();
        const jwtToken = tokenResult.token;

        if (jwtToken && isLikelyJwt(jwtToken)) {
            await broadcastToTargetTabs(MessageType.TOKEN_UPDATED, {
                token: jwtToken,
                source: "cookie-change-jwt",
            });
            return;
        }

        await broadcastToTargetTabs(MessageType.TOKEN_EXPIRED, {
            cookie: cookieName,
            reason: "session_cookie_updated_but_no_jwt",
        });
    }
}

/* ------------------------------------------------------------------ */
/*  Proactive Refresh                                                  */
/* ------------------------------------------------------------------ */

/** Attempts to refresh the auth token before scripts fail. */
async function attemptProactiveRefresh(): Promise<string | null> {
    try {
        const result = await handleRefreshToken();
        const hasAuthToken = result.authToken !== undefined
            && result.authToken !== null
            && result.authToken.length > 10;

        if (hasAuthToken) {
            return isLikelyJwt(result.authToken!) ? result.authToken! : null;
        }

        return null;
    } catch (refreshError) {
        logCaughtError(BgLogTag.COOKIE_WATCHER, "Proactive refresh failed", refreshError);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Reseed All Tabs                                                    */
/* ------------------------------------------------------------------ */

/**
 * Re-seeds tokens into localStorage of all open platform tabs.
 * v1.68.0: Ensures macro controller always has a fresh JWT in localStorage.
 */
async function reseedAllTargetTabs(): Promise<void> {
    try {
        const tabs = await chrome.tabs.query({ url: TARGET_TAB_PATTERNS });

        for (const tab of tabs) {
            if (tab.id !== undefined) {
                try {
                    await seedTokensIntoTab(tab.id);
                } catch {
                    // Tab may not be ready — skip silently
                }
            }
        }

        if (tabs.length > 0) {
            console.log("[cookie-watcher] Reseeded tokens into %d tab(s)", tabs.length);
        }
    } catch (reseedError) {
        logCaughtError(BgLogTag.COOKIE_WATCHER, "Reseed failed", reseedError);
    }
}

/* ------------------------------------------------------------------ */
/*  Tab Broadcasting                                                   */
/* ------------------------------------------------------------------ */

/** Sends a message to all platform tabs. */
async function broadcastToTargetTabs(
    type: MessageType,
    payload: Record<string, unknown>,
): Promise<void> {
    try {
        const tabs = await chrome.tabs.query({ url: TARGET_TAB_PATTERNS });
        const hasTargetTabs = tabs.length > 0;

        if (!hasTargetTabs) {
            return;
        }

        const message = { type, ...payload };

        for (const tab of tabs) {
            const hasTabId = tab.id !== undefined;

            if (hasTabId) {
                try {
                    await chrome.tabs.sendMessage(tab.id!, message);
                } catch {
                    // Tab may not have a content script — ignore silently
                }
            }
        }

        console.log(`[cookie-watcher] Broadcast ${type} to ${tabs.length} tab(s)`);
    } catch (broadcastError) {
        logCaughtError(BgLogTag.COOKIE_WATCHER, "Broadcast failed", broadcastError);
    }
}

function isLikelyJwt(token: string): boolean {
    return token.startsWith("eyJ") && token.split(".").length === 3;
}
