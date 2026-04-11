/**
 * Marco Extension — Chrome Runtime Reference
 *
 * Typed accessor for globalThis.chrome used by background service worker
 * modules that cannot import @types/chrome directly.
 */

/** Minimal chrome API shape for background modules. */
export interface ChromeRef {
    runtime: {
        id?: string;
        sendMessage: (message: Record<string, unknown>) => Promise<unknown>;
        getURL: (path: string) => string;
    };
    storage: {
        local: {
            get: (key: string | string[]) => Promise<Record<string, unknown>>;
            set: (items: Record<string, unknown>) => Promise<void>;
            remove: (key: string | string[]) => Promise<void>;
        };
        session?: {
            get: (key: string | string[]) => Promise<Record<string, unknown>>;
            set: (items: Record<string, unknown>) => Promise<void>;
        };
    };
    cookies?: {
        getAll: (details: Record<string, unknown>) => Promise<Array<{ name: string; value: string; domain: string; expirationDate?: number }>>;
        get: (details: Record<string, unknown>) => Promise<{ name: string; value: string; domain: string; expirationDate?: number } | null>;
    };
    tabs?: {
        query: (queryInfo: Record<string, unknown>) => Promise<Array<{ id?: number; url?: string }>>;
        sendMessage: (tabId: number, message: Record<string, unknown>) => Promise<unknown>;
    };
    scripting?: {
        executeScript: (injection: Record<string, unknown>) => Promise<Array<{ result?: unknown }>>;
    };
    action?: {
        setBadgeText: (details: Record<string, unknown>) => Promise<void>;
        setBadgeBackgroundColor: (details: Record<string, unknown>) => Promise<void>;
    };
}

/** Returns globalThis.chrome typed as ChromeRef. */
export function getChromeRef(): ChromeRef {
    return (globalThis as unknown as { chrome: ChromeRef }).chrome;
}