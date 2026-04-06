/**
 * Marco Extension — Storage Browser Non-SQL Surfaces Handler
 *
 * Handles chrome.storage.session and chrome.cookies CRUD operations
 * for the Options Storage Browser (Issue 62).
 */

import type { MessageRequest } from "../../shared/messages";

interface SessionEntry {
    key: string;
    value: unknown;
    valueType: string;
    sizeBytes: number;
}

interface CookieEntry {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: string;
    session: boolean;
    expirationDate?: number;
    storeId: string;
}

function estimateBytes(value: unknown): number {
    try {
        return new TextEncoder().encode(JSON.stringify(value)).length;
    } catch {
        return 0;
    }
}

function toCookieUrl(cookie: chrome.cookies.Cookie): string {
    const protocol = cookie.secure ? "https" : "http";
    const domain = cookie.domain.startsWith(".") ? cookie.domain.slice(1) : cookie.domain;
    return `${protocol}://${domain}${cookie.path}`;
}

function toCookieEntry(cookie: chrome.cookies.Cookie): CookieEntry {
    return {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        session: cookie.session,
        expirationDate: cookie.expirationDate,
        storeId: cookie.storeId,
    };
}

function resolveSetCookieUrl(input: {
    url?: string;
    domain?: string;
    path?: string;
    secure?: boolean;
}): string {
    if (typeof input.url === "string" && input.url.trim().length > 0) {
        return input.url.trim();
    }

    const domain = (input.domain ?? "").trim();
    if (!domain) {
        throw new Error("[Storage] Cookie set requires url or domain");
    }

    const protocol = input.secure ? "https" : "http";
    const normalizedDomain = domain.startsWith(".") ? domain.slice(1) : domain;
    const path = input.path && input.path.startsWith("/") ? input.path : "/";
    return `${protocol}://${normalizedDomain}${path}`;
}

export async function handleStorageSessionList(
    message: MessageRequest,
): Promise<{ entries: SessionEntry[]; total: number }> {
    const { prefix } = message as { prefix?: string };
    const raw = await chrome.storage.session.get(null);

    const entries = Object.entries(raw)
        .filter(([key]) => !prefix || key.startsWith(prefix))
        .map(([key, value]) => ({
            key,
            value,
            valueType: Array.isArray(value) ? "array" : typeof value,
            sizeBytes: estimateBytes(value),
        }))
        .sort((a, b) => a.key.localeCompare(b.key));

    return { entries, total: entries.length };
}

export async function handleStorageSessionSet(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const { key, value } = message as { key: string; value: unknown };
    if (!key || typeof key !== "string") {
        throw new Error("[Storage] Session key is required");
    }

    await chrome.storage.session.set({ [key]: value });
    return { isOk: true };
}

export async function handleStorageSessionDelete(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const { key } = message as { key: string };
    if (!key || typeof key !== "string") {
        throw new Error("[Storage] Session key is required");
    }

    await chrome.storage.session.remove(key);
    return { isOk: true };
}

export async function handleStorageSessionClear(
    message: MessageRequest,
): Promise<{ isOk: true; cleared: number }> {
    const { prefix } = message as { prefix?: string };

    if (!prefix) {
        const raw = await chrome.storage.session.get(null);
        const total = Object.keys(raw).length;
        await chrome.storage.session.clear();
        return { isOk: true, cleared: total };
    }

    const raw = await chrome.storage.session.get(null);
    const keys = Object.keys(raw).filter((key) => key.startsWith(prefix));
    if (keys.length > 0) {
        await chrome.storage.session.remove(keys);
    }

    return { isOk: true, cleared: keys.length };
}

export async function handleStorageCookiesList(
    message: MessageRequest,
): Promise<{ cookies: CookieEntry[]; total: number }> {
    const { domain, nameContains } = message as {
        domain?: string;
        nameContains?: string;
    };

    const query: chrome.cookies.GetAllDetails = {};
    if (domain && domain.trim()) {
        query.domain = domain.trim();
    }

    const cookies = await chrome.cookies.getAll(query);
    const filtered = cookies
        .filter((cookie) => {
            if (!nameContains || !nameContains.trim()) return true;
            return cookie.name.toLowerCase().includes(nameContains.trim().toLowerCase());
        })
        .map(toCookieEntry)
        .sort((a, b) => {
            const byDomain = a.domain.localeCompare(b.domain);
            if (byDomain !== 0) return byDomain;
            return a.name.localeCompare(b.name);
        });

    return { cookies: filtered, total: filtered.length };
}

export async function handleStorageCookiesSet(
    message: MessageRequest,
): Promise<{ isOk: true; cookie: CookieEntry }> {
    const input = message as {
        name: string;
        value: string;
        url?: string;
        domain?: string;
        path?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: string;
        expirationDate?: number;
    };

    if (!input.name || typeof input.name !== "string") {
        throw new Error("[Storage] Cookie name is required");
    }

    const details: chrome.cookies.SetDetails = {
        name: input.name,
        value: input.value ?? "",
        url: resolveSetCookieUrl(input),
        path: input.path,
        secure: input.secure,
        httpOnly: input.httpOnly,
        expirationDate: input.expirationDate,
    };

    if (input.domain && input.domain.trim()) {
        details.domain = input.domain.trim();
    }

    if (input.sameSite === "lax" || input.sameSite === "strict" || input.sameSite === "no_restriction") {
        details.sameSite = input.sameSite;
    }

    const cookie = await chrome.cookies.set(details);
    if (!cookie) {
        throw new Error("[Storage] Failed to set cookie");
    }

    return { isOk: true, cookie: toCookieEntry(cookie) };
}

export async function handleStorageCookiesDelete(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const { name, url, storeId } = message as {
        name: string;
        url: string;
        storeId?: string;
    };

    if (!name || !url) {
        throw new Error("[Storage] Cookie delete requires name + url");
    }

    await chrome.cookies.remove({ name, url, storeId });
    return { isOk: true };
}

export async function handleStorageCookiesClear(
    message: MessageRequest,
): Promise<{ isOk: true; cleared: number }> {
    const { domain, nameContains } = message as {
        domain?: string;
        nameContains?: string;
    };

    const query: chrome.cookies.GetAllDetails = {};
    if (domain && domain.trim()) {
        query.domain = domain.trim();
    }

    const allCookies = await chrome.cookies.getAll(query);
    const targetCookies = allCookies.filter((cookie) => {
        if (!nameContains || !nameContains.trim()) return true;
        return cookie.name.toLowerCase().includes(nameContains.trim().toLowerCase());
    });

    const removals = await Promise.all(
        targetCookies.map((cookie) =>
            chrome.cookies.remove({
                name: cookie.name,
                url: toCookieUrl(cookie),
                storeId: cookie.storeId,
            }),
        ),
    );

    const cleared = removals.filter((entry) => entry !== null).length;
    return { isOk: true, cleared };
}
