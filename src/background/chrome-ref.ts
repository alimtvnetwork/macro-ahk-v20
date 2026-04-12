/**
 * Marco Extension — Chrome Runtime Reference
 *
 * Typed accessor for globalThis.chrome used by background service worker
 * modules that cannot import @types/chrome directly.
 */

/** Shape for storage item values. */
type StorageValue = string | number | boolean | null | object;

/** Query/option bags for chrome API calls. */
interface TabQueryInfo {
    active?: boolean;
    currentWindow?: boolean;
    url?: string;
}

interface CookieQueryDetails {
    domain?: string;
    name?: string;
    url?: string;
    path?: string;
    secure?: boolean;
    session?: boolean;
    storeId?: string;
}

interface ScriptInjection {
    target: { tabId: number; allFrames?: boolean };
    func?: (...args: string[]) => void;
    args?: string[];
    files?: string[];
    world?: string;
    injectImmediately?: boolean;
}

interface BadgeDetails {
    text?: string;
    tabId?: number;
}

interface BadgeColorDetails {
    color: string | [number, number, number, number];
    tabId?: number;
}

/** Minimal chrome API shape for background modules. */
export interface ChromeRef {
    runtime: {
        id?: string;
        sendMessage: (message: Record<string, StorageValue>) => Promise<StorageValue>;
        getURL: (path: string) => string;
    };
    storage: {
        local: {
            get: (key: string | string[]) => Promise<Record<string, StorageValue>>;
            set: (items: Record<string, StorageValue>) => Promise<void>;
            remove: (key: string | string[]) => Promise<void>;
        };
        session?: {
            get: (key: string | string[]) => Promise<Record<string, StorageValue>>;
            set: (items: Record<string, StorageValue>) => Promise<void>;
        };
    };
    cookies?: {
        getAll: (details: CookieQueryDetails) => Promise<Array<{ name: string; value: string; domain: string; expirationDate?: number }>>;
        get: (details: CookieQueryDetails) => Promise<{ name: string; value: string; domain: string; expirationDate?: number } | null>;
    };
    tabs?: {
        query: (queryInfo: TabQueryInfo) => Promise<Array<{ id?: number; url?: string }>>;
        sendMessage: (tabId: number, message: Record<string, StorageValue>) => Promise<StorageValue>;
    };
    scripting?: {
        executeScript: (injection: ScriptInjection) => Promise<Array<{ result?: StorageValue }>>;
    };
    action?: {
        setBadgeText: (details: BadgeDetails) => Promise<void>;
        setBadgeBackgroundColor: (details: BadgeColorDetails) => Promise<void>;
    };
}

/** Window shape with chrome property. */
interface GlobalWithChrome {
    chrome: ChromeRef;
}

/** Returns globalThis.chrome typed as ChromeRef. */
export function getChromeRef(): ChromeRef {
    return (globalThis as GlobalWithChrome).chrome;
}
