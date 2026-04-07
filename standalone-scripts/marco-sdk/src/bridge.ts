/**
 * Riseup Macro SDK — Bridge Module
 *
 * PostMessage relay between MAIN world and content script (ISOLATED world).
 * All SDK methods use this bridge to communicate with the background service worker.
 *
 * See: spec/12-devtools-and-injection/sdk-convention.md §Bridge Pattern
 */

const SDK_SOURCE = "marco-sdk";
let requestCounter = 0;
const pendingRequests = new Map<string, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();

/**
 * Send a typed message to the background via content script relay.
 * Returns a Promise that resolves when the background responds.
 */
export function sendMessage<T = unknown>(type: string, payload?: Record<string, unknown>): Promise<T> {
    const requestId = `${SDK_SOURCE}-${++requestCounter}-${Date.now()}`;

    return new Promise<T>((resolve, reject) => {
        pendingRequests.set(requestId, { resolve: resolve as (v: unknown) => void, reject });

        window.postMessage(
            {
                source: SDK_SOURCE,
                type,
                requestId,
                payload: payload ?? {},
            },
            "*",
        );

        // Timeout after 15s
        setTimeout(() => {
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                reject(new Error(`[marco-sdk] Timeout waiting for ${type}`));
            }
        }, 15_000);
    });
}

/**
 * Listen for responses from the content script relay.
 */
function initResponseListener(): void {
    window.addEventListener("message", (event) => {
        if (event.source !== window) return;

        const data = event.data;
        if (!data || data.source !== `${SDK_SOURCE}-response`) return;

        const pending = pendingRequests.get(data.requestId);
        if (!pending) return;

        pendingRequests.delete(data.requestId);

        if (data.error) {
            pending.reject(new Error(data.error));
        } else {
            pending.resolve(data.result);
        }
    });
}

// Initialize listener immediately
initResponseListener();
