/**
 * Marco Extension — Content Script: Network Reporter
 *
 * Injected programmatically by the background service worker.
 * Intercepts XMLHttpRequest and fetch() calls, captures metadata
 * (method, URL, status, duration), and forwards entries to the
 * background via chrome.runtime.sendMessage.
 *
 * Also reports online/offline status changes.
 * See spec 05-content-script-adaptation.md §Network Monitoring.
 *
 * Canonical source — chrome-extension/src/content-scripts/ re-exports from here.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MESSAGE_TYPE_NETWORK_STATUS = "NETWORK_STATUS";
const MESSAGE_TYPE_NETWORK_REQUEST = "NETWORK_REQUEST";
const MAX_URL_LENGTH = 2000;
const MAX_BUFFER_SIZE = 50;
const FLUSH_INTERVAL_MS = 3000;

/* ------------------------------------------------------------------ */
/*  Request Buffer                                                     */
/* ------------------------------------------------------------------ */

interface CapturedEntry {
    method: string;
    url: string;
    status: number;
    statusText: string;
    durationMs: number;
    requestType: "xhr" | "fetch";
    timestamp: string;
    initiator: string;
}

const entryBuffer: CapturedEntry[] = [];

/** Adds a captured entry to the buffer and flushes if full. */
function bufferEntry(entry: CapturedEntry): void {
    entryBuffer.push(entry);

    const isBufferFull = entryBuffer.length >= MAX_BUFFER_SIZE;

    if (isBufferFull) {
        flushBuffer();
    }
}

/** Sends all buffered entries to the background and clears the buffer. */
function flushBuffer(): void {
    const hasEntries = entryBuffer.length > 0;

    if (!hasEntries) {
        return;
    }

    const entries = entryBuffer.splice(0, entryBuffer.length);

    for (const entry of entries) {
        sendNetworkEntry(entry);
    }
}

/** Sends a single network entry to the background service worker. */
function sendNetworkEntry(entry: CapturedEntry): void {
    try {
        chrome.runtime.sendMessage({
            type: MESSAGE_TYPE_NETWORK_REQUEST,
            entry,
        });
    } catch {
        // Extension context invalidated — silently ignore
    }
}

/* ------------------------------------------------------------------ */
/*  XHR Interception                                                   */
/* ------------------------------------------------------------------ */

/** Monkey-patches XMLHttpRequest to capture request metadata. */
function interceptXhr(): void {
    const OriginalXhr = window.XMLHttpRequest;
    const originalOpen = OriginalXhr.prototype.open;
    const originalSend = OriginalXhr.prototype.send;

    OriginalXhr.prototype.open = function (
        method: string,
        url: string | URL,
        ...rest: unknown[]
    ) {
        (this as any).__marco_method = method;
        (this as any).__marco_url = truncateUrl(String(url));
        (this as any).__marco_startTime = null;

        return originalOpen.apply(this, [method, url, ...rest] as any);
    };

    OriginalXhr.prototype.send = function (...args: unknown[]) {
        (this as any).__marco_startTime = performance.now();

        this.addEventListener("loadend", function () {
            const startTime = (this as any).__marco_startTime as number | null;
            const hasStartTime = startTime !== null;

            if (hasStartTime) {
                const entry = buildXhrEntry(this, startTime!);
                bufferEntry(entry);
            }
        });

        return originalSend.apply(this, args as any);
    };
}

/** Builds a CapturedEntry from a completed XMLHttpRequest. */
function buildXhrEntry(
    xhr: XMLHttpRequest,
    startTime: number,
): CapturedEntry {
    const endTime = performance.now();

    return {
        method: (xhr as any).__marco_method ?? "UNKNOWN",
        url: (xhr as any).__marco_url ?? "",
        status: xhr.status,
        statusText: xhr.statusText || "",
        durationMs: Math.round(endTime - startTime),
        requestType: "xhr",
        timestamp: new Date().toISOString(),
        initiator: extractInitiator(),
    };
}

/* ------------------------------------------------------------------ */
/*  Fetch Interception                                                 */
/* ------------------------------------------------------------------ */

/** Monkey-patches window.fetch to capture request metadata. */
function interceptFetch(): void {
    const originalFetch = window.fetch;

    window.fetch = async function (
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> {
        const method = resolveMethod(input, init);
        const url = resolveUrl(input);
        const startTime = performance.now();

        try {
            const response = await originalFetch.call(this, input, init);
            const entry = buildFetchEntry(
                method,
                url,
                response.status,
                response.statusText,
                startTime,
            );
            bufferEntry(entry);

            return response;
        } catch (fetchError) {
            const entry = buildFetchEntry(method, url, 0, "Network Error", startTime);
            bufferEntry(entry);

            throw fetchError;
        }
    };
}

/** Resolves the HTTP method from fetch arguments. */
function resolveMethod(
    input: RequestInfo | URL,
    init?: RequestInit,
): string {
    const hasInitMethod = init?.method !== undefined;

    if (hasInitMethod) {
        return init!.method!.toUpperCase();
    }

    const isRequest = input instanceof Request;

    if (isRequest) {
        return input.method.toUpperCase();
    }

    return "GET";
}

/** Resolves the URL string from fetch arguments. */
function resolveUrl(input: RequestInfo | URL): string {
    const isString = typeof input === "string";

    if (isString) {
        return truncateUrl(input);
    }

    const isUrl = input instanceof URL;

    if (isUrl) {
        return truncateUrl(input.toString());
    }

    const isRequest = input instanceof Request;

    if (isRequest) {
        return truncateUrl(input.url);
    }

    return "";
}

/** Builds a CapturedEntry from a completed fetch. */
function buildFetchEntry(
    method: string,
    url: string,
    status: number,
    statusText: string,
    startTime: number,
): CapturedEntry {
    const endTime = performance.now();

    return {
        method,
        url,
        status,
        statusText,
        durationMs: Math.round(endTime - startTime),
        requestType: "fetch",
        timestamp: new Date().toISOString(),
        initiator: extractInitiator(),
    };
}

/* ------------------------------------------------------------------ */
/*  Online/Offline Status                                              */
/* ------------------------------------------------------------------ */

/** Reports the current network status to the service worker. */
function reportNetworkStatus(isOnline: boolean): void {
    try {
        chrome.runtime.sendMessage({
            type: MESSAGE_TYPE_NETWORK_STATUS,
            isOnline,
        });
    } catch {
        // Extension context invalidated
    }
}

/** Registers online/offline event listeners on the window. */
function registerNetworkListeners(): void {
    window.addEventListener("online", () => {
        reportNetworkStatus(true);
    });

    window.addEventListener("offline", () => {
        reportNetworkStatus(false);
    });

    reportNetworkStatus(navigator.onLine);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Truncates a URL to the maximum allowed length. */
function truncateUrl(url: string): string {
    const isTooLong = url.length > MAX_URL_LENGTH;

    return isTooLong ? url.slice(0, MAX_URL_LENGTH) + "…" : url;
}

/** Extracts the page URL as the initiator. */
function extractInitiator(): string {
    try {
        return window.location.href;
    } catch {
        return "";
    }
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/** Initializes all network interception and status reporting. */
function initNetworkReporter(): void {
    interceptXhr();
    interceptFetch();
    registerNetworkListeners();

    setInterval(flushBuffer, FLUSH_INTERVAL_MS);

    console.log("[Marco] Network reporter initialized");
}

initNetworkReporter();
