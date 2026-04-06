/**
 * Marco Extension — SDK Bridge Handler
 *
 * Handles SDK message types (AUTH_*, COOKIES_*, CONFIG_*, XPATH_*, FILE_READ)
 * by bridging to existing auth, cookie, config, and xpath handlers.
 *
 * These messages originate from the Riseup Macro SDK (window.marco.*)
 * via content script relay → background service worker.
 *
 * See: spec/04-db-join-specs/01-category-join-pattern.md
 * See: .lovable/memory/architecture/marco-sdk-convention.md
 */

import type { MessageRequest } from "../../shared/messages";
import {
    handleGetToken,
    handleGetTokens,
    handleRefreshToken,
    handleGetConfig,
} from "./config-auth-handler";
import {
    readCookieFromCandidates,
    readCookieValueFromCandidates,
} from "../cookie-helpers";
import {
    handleGetRecordedXPaths,
    handleTestXPath,
} from "./xpath-handler";
import { handleFileGet } from "./file-storage-handler";

/* ------------------------------------------------------------------ */
/*  AUTH handlers                                                      */
/* ------------------------------------------------------------------ */

/** AUTH_GET_TOKEN — returns the current session token. */
export async function handleSdkAuthGetToken(): Promise<{ token: string | null; refreshed: boolean }> {
    return handleGetToken();
}

/** AUTH_GET_SOURCE — returns both session + refresh tokens. */
export async function handleSdkAuthGetSource(): Promise<{ sessionId: string | null; refreshToken: string | null }> {
    const tokens = await handleGetTokens();
    return { sessionId: tokens.sessionId, refreshToken: tokens.refreshToken };
}

/** AUTH_REFRESH — forces a token refresh. */
export async function handleSdkAuthRefresh(): Promise<{ token: string | null; refreshed: boolean }> {
    return handleRefreshToken();
}

/** AUTH_IS_EXPIRED — checks if the current token appears expired. */
export async function handleSdkAuthIsExpired(): Promise<{ isExpired: boolean }> {
    const result = await handleGetToken();
    return { isExpired: result.token === null };
}

/** AUTH_GET_JWT — returns the raw JWT/session ID string. */
export async function handleSdkAuthGetJwt(): Promise<{ jwt: string | null }> {
    const result = await handleGetToken();
    return { jwt: result.token };
}

/* ------------------------------------------------------------------ */
/*  COOKIES handlers                                                   */
/* ------------------------------------------------------------------ */

/** COOKIES_GET — get a single cookie value by name. */
export async function handleSdkCookiesGet(
    msg: MessageRequest,
): Promise<{ value: string | null }> {
    const { name, url } = msg as MessageRequest & { name: string; url?: string };
    const value = await readCookieValueFromCandidates(name, url);
    return { value };
}

/** COOKIES_GET_DETAIL — get full cookie object. */
export async function handleSdkCookiesGetDetail(
    msg: MessageRequest,
): Promise<{ cookie: chrome.cookies.Cookie | null }> {
    const { name, url } = msg as MessageRequest & { name: string; url?: string };
    const cookie = await readCookieFromCandidates(name, url);
    return { cookie };
}

/** COOKIES_GET_ALL — get all cookies for a URL. */
export async function handleSdkCookiesGetAll(
    msg: MessageRequest,
): Promise<{ cookies: chrome.cookies.Cookie[] }> {
    const { url, domain } = msg as MessageRequest & { url?: string; domain?: string };
    try {
        const details: chrome.cookies.GetAllDetails = {};
        if (url) details.url = url;
        if (domain) details.domain = domain;
        const cookies = await chrome.cookies.getAll(details);
        return { cookies };
    } catch {
        return { cookies: [] };
    }
}

/* ------------------------------------------------------------------ */
/*  CONFIG handlers                                                    */
/* ------------------------------------------------------------------ */

/** CONFIG_GET — get full merged config. */
export async function handleSdkConfigGet(): Promise<{
    config: Record<string, unknown>;
    source: string;
}> {
    return handleGetConfig();
}

/** CONFIG_GET_ALL — alias, returns same as CONFIG_GET. */
export async function handleSdkConfigGetAll(): Promise<{
    config: Record<string, unknown>;
    source: string;
}> {
    return handleGetConfig();
}

/** CONFIG_SET — store a config key in chrome.storage.local. */
export async function handleSdkConfigSet(
    msg: MessageRequest,
): Promise<{ isOk: boolean }> {
    const { key, value } = msg as MessageRequest & { key: string; value: unknown };
    if (!key) return { isOk: false };
    const storageKey = `marco_config_${key}`;
    await chrome.storage.local.set({ [storageKey]: value });
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  XPATH handlers                                                     */
/* ------------------------------------------------------------------ */

/** XPATH_GET — test a single XPath expression on the sender's tab. */
export async function handleSdkXPathGet(
    msg: MessageRequest,
    sender: chrome.runtime.MessageSender,
): Promise<unknown> {
    return handleTestXPath(msg);
}

/** XPATH_GET_ALL — return all recorded XPaths. */
export async function handleSdkXPathGetAll(
    msg: MessageRequest,
    sender: chrome.runtime.MessageSender,
): Promise<unknown> {
    return handleGetRecordedXPaths(msg, sender);
}

/* ------------------------------------------------------------------ */
/*  FILE handler                                                       */
/* ------------------------------------------------------------------ */

/** FILE_READ — read a project file by path. */
export async function handleSdkFileRead(
    msg: MessageRequest,
): Promise<unknown> {
    return handleFileGet(msg);
}
