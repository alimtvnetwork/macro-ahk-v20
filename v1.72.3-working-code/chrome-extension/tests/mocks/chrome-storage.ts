/**
 * Mock chrome APIs for unit tests.
 *
 * Provides in-memory Map-backed implementations of
 * chrome.storage.local, chrome.storage.session, chrome.tabs,
 * chrome.cookies, chrome.scripting, and chrome.runtime
 * for testing handler and state-manager logic.
 */

const localStore = new Map<string, unknown>();
const sessionStore = new Map<string, unknown>();
let mockTabs: Array<{ id: number; url?: string }> = [];
let mockCookies: Map<string, { value: string; expirationDate?: number }> = new Map();
let scriptingCalls: Array<{ tabId: number; code?: string; files?: string[]; world?: string; funcBody?: string; args?: unknown[] }> = [];
let cssCalls: Array<{ tabId: number; files?: string[] }> = [];
let sentMessages: unknown[] = [];
let webNavListeners: Array<(details: any) => void> = [];
let historyStateListeners: Array<(details: any) => void> = [];
let alarmListeners: Array<(alarm: any) => void> = [];

/** Resets all mock storage and tabs to empty state. */
export function resetMockStorage(): void {
    localStore.clear();
    sessionStore.clear();
    mockTabs = [];
    mockCookies.clear();
    scriptingCalls = [];
    cssCalls = [];
    sentMessages = [];
    webNavListeners = [];
    historyStateListeners = [];
    alarmListeners = [];
}

/** Simulates a webNavigation.onCompleted event. */
export function simulateNavigation(
    tabId: number,
    url: string,
    frameId: number = 0,
): void {
    for (const listener of webNavListeners) {
        listener({ tabId, url, frameId });
    }
}

/** Simulates a webNavigation.onHistoryStateUpdated event (SPA navigation). */
export function simulateHistoryStateUpdate(
    tabId: number,
    url: string,
    frameId: number = 0,
): void {
    for (const listener of historyStateListeners) {
        listener({ tabId, url, frameId, transitionType: "link" });
    }
}

/** Returns the registered webNavigation listeners count. */
export function getWebNavListenerCount(): number {
    return webNavListeners.length;
}

/** Returns a snapshot of local storage data (for assertions). */
export function getMockStoreSnapshot(): Record<string, unknown> {
    return Object.fromEntries(localStore);
}

/** Returns a snapshot of session storage data (for assertions). */
export function getMockSessionSnapshot(): Record<string, unknown> {
    return Object.fromEntries(sessionStore);
}

/** Sets the mock tabs list for chrome.tabs.query. */
export function setMockTabs(tabs: Array<{ id: number; url?: string }>): void {
    mockTabs = tabs;
}

/** Sets a mock cookie for chrome.cookies.get. */
export function setMockCookie(
    name: string,
    value: string,
    expirationDate?: number,
): void {
    mockCookies.set(name, { value, expirationDate });
}

/** Returns all chrome.scripting.executeScript calls. */
export function getScriptingCalls(): typeof scriptingCalls {
    return scriptingCalls;
}

/** Returns all chrome.scripting.insertCSS calls. */
export function getCssCalls(): typeof cssCalls {
    return cssCalls;
}

/**
 * Extracts the injected code string from a scripting call.
 * With the executeSerializedCode wrapper, user code is in args[0].
 * Falls back to funcBody for backward compatibility.
 */
export function getInjectedCode(call: typeof scriptingCalls[0]): string {
    if (call.args && typeof call.args[0] === "string") {
        return call.args[0];
    }
    return call.funcBody ?? "";
}

/** Returns all chrome.runtime.sendMessage calls. */
export function getSentMessages(): unknown[] {
    return sentMessages;
}

/** Builds a storage-like object from a Map. */
function buildStorageMock(store: Map<string, unknown>) {
    return {
        get: async (keys: string | string[]): Promise<Record<string, unknown>> => {
            const keyList = Array.isArray(keys) ? keys : [keys];
            const result: Record<string, unknown> = {};

            for (const key of keyList) {
                if (store.has(key)) {
                    result[key] = store.get(key);
                }
            }
            return result;
        },

        set: async (items: Record<string, unknown>): Promise<void> => {
            for (const [key, value] of Object.entries(items)) {
                store.set(key, value);
            }
        },

        remove: async (keys: string | string[]): Promise<void> => {
            const keyList = Array.isArray(keys) ? keys : [keys];

            for (const key of keyList) {
                store.delete(key);
            }
        },
    };
}

/** Installs the mock chrome global before tests. */
export function installChromeMock(): void {
    // Mock fetch for auth-token exchange: returns JWT if session cookie is set
    (globalThis as any).fetch = async (url: string, init?: RequestInit) => {
        const isAuthTokenEndpoint = typeof url === "string" && url.includes("/auth-token");

        if (isAuthTokenEndpoint) {
            // Check if we have a session cookie to simulate credentials:'include'
            const sessionCookie = mockCookies.get("lovable-session-id.id");
            const hasSession = sessionCookie !== undefined;

            if (hasSession) {
                // Return the cookie value as a JWT-like token for testing
                const token = sessionCookie!.value;
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ token }),
                };
            }

            return {
                ok: false,
                status: 401,
                json: async () => ({ type: "unauthorized", message: "No session" }),
            };
        }

        return {
            ok: false,
            status: 404,
            json: async () => ({}),
        };
    };

    (globalThis as any).chrome = {
        storage: {
            local: buildStorageMock(localStore),
            session: buildStorageMock(sessionStore),
        },
        runtime: {
            getURL: (path: string) => `chrome-extension://mock/${path}`,
            getManifest: () => ({ version: "1.0.0-test" }),
            sendMessage: async (msg: unknown) => {
                sentMessages.push(msg);
                return { config: null };
            },
        },
        tabs: {
            query: async () => mockTabs,
            onRemoved: {
                addListener: () => {},
            },
        },
        cookies: {
            get: async (details: { url: string; name: string }) => {
                const cookie = mockCookies.get(details.name);
                const hasCookie = cookie !== undefined;

                return hasCookie
                    ? { name: details.name, value: cookie!.value, expirationDate: cookie!.expirationDate }
                    : null;
            },
            _setCookie: (name: string, value: string) => {
                mockCookies.set(name, { value });
            },
        },
        scripting: {
            executeScript: async (details: {
                target: { tabId: number };
                func?: Function;
                files?: string[];
                args?: unknown[];
                world?: string;
            }) => {
                const funcBody = details.func !== undefined
                    ? details.func.toString()
                    : undefined;

                scriptingCalls.push({
                    tabId: details.target.tabId,
                    files: details.files,
                    world: details.world,
                    funcBody,
                    args: details.args,
                });

                const hasFunc = details.func !== undefined;

                if (hasFunc && details.args !== undefined) {
                    try {
                        const result = await details.func!(...details.args);
                        return [{ result }];
                    } catch {
                        return [{ result: null }];
                    }
                }

                return [{ result: null }];
            },
            insertCSS: async (details: { target: { tabId: number }; files?: string[] }) => {
                cssCalls.push({ tabId: details.target.tabId, files: details.files });
            },
        },
        webNavigation: {
            onCompleted: {
                addListener: (listener: (details: any) => void) => {
                    webNavListeners.push(listener);
                },
            },
            onHistoryStateUpdated: {
                addListener: (listener: (details: any) => void) => {
                    historyStateListeners.push(listener);
                },
            },
        },
        alarms: {
            create: () => {},
            onAlarm: {
                addListener: (listener: (alarm: any) => void) => {
                    alarmListeners.push(listener);
                },
            },
        },
    };
}
