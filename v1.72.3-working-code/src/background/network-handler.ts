/**
 * Marco Extension — Network Status & Request Handler
 *
 * Processes NETWORK_STATUS and NETWORK_REQUEST messages
 * from content scripts. Stores online/offline state in
 * chrome.storage.session and maintains a ring buffer of
 * recent network requests for the data browser.
 */

import type {
    MessageRequest,
    NetworkStatusRequest,
    NetworkRequestMessage,
    NetworkRequestEntry,
} from "../shared/messages";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_STORED_REQUESTS = 200;
const SESSION_KEY_ONLINE = "marco_network_online";
const SESSION_KEY_REQUESTS = "marco_network_requests";

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let recentRequests: NetworkRequestEntry[] = [];

/* ------------------------------------------------------------------ */
/*  NETWORK_STATUS                                                     */
/* ------------------------------------------------------------------ */

/** Handles a network status update from a content script. */
export async function handleNetworkStatus(
    message: MessageRequest,
): Promise<{ isOk: boolean }> {
    const networkMessage = message as NetworkStatusRequest;
    const isOnline = networkMessage.isOnline;

    console.log(`[Marco] Network status: ${isOnline ? "online" : "offline"}`);

    await chrome.storage.session.set({
        [SESSION_KEY_ONLINE]: isOnline,
    });

    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  NETWORK_REQUEST                                                    */
/* ------------------------------------------------------------------ */

/** Handles a captured network request from a content script. */
export async function handleNetworkRequest(
    message: MessageRequest,
): Promise<{ isOk: boolean }> {
    const requestMessage = message as NetworkRequestMessage;
    const entry = requestMessage.entry;
    const isValidEntry = entry !== undefined && entry !== null;

    if (!isValidEntry) {
        return { isOk: false };
    }

    appendToRingBuffer(entry);
    await persistRequests();

    return { isOk: true };
}

/** Appends an entry to the ring buffer, evicting oldest if full. */
function appendToRingBuffer(entry: NetworkRequestEntry): void {
    recentRequests.push(entry);

    const isOverCapacity = recentRequests.length > MAX_STORED_REQUESTS;

    if (isOverCapacity) {
        recentRequests = recentRequests.slice(-MAX_STORED_REQUESTS);
    }
}

/** Persists the recent requests to session storage. */
async function persistRequests(): Promise<void> {
    await chrome.storage.session.set({
        [SESSION_KEY_REQUESTS]: recentRequests,
    });
}

/* ------------------------------------------------------------------ */
/*  Query API                                                          */
/* ------------------------------------------------------------------ */

/** Returns recent captured network requests. */
export function getRecentNetworkRequests(): NetworkRequestEntry[] {
    return [...recentRequests];
}

/** Returns summary statistics for captured requests. */
export function getNetworkStats(): {
    totalCaptured: number;
    byType: { xhr: number; fetch: number };
    byStatus: Record<string, number>;
    averageDurationMs: number;
} {
    const xhrCount = recentRequests.filter(
        (r) => r.requestType === "xhr",
    ).length;

    const fetchCount = recentRequests.filter(
        (r) => r.requestType === "fetch",
    ).length;

    const statusBuckets: Record<string, number> = {};

    for (const req of recentRequests) {
        const bucket = categorizeStatus(req.status);
        statusBuckets[bucket] = (statusBuckets[bucket] ?? 0) + 1;
    }

    const totalDuration = recentRequests.reduce(
        (sum, r) => sum + r.durationMs,
        0,
    );

    const hasRequests = recentRequests.length > 0;
    const averageDurationMs = hasRequests
        ? Math.round(totalDuration / recentRequests.length)
        : 0;

    return {
        totalCaptured: recentRequests.length,
        byType: { xhr: xhrCount, fetch: fetchCount },
        byStatus: statusBuckets,
        averageDurationMs,
    };
}

/** Categorizes an HTTP status code into a bucket. */
function categorizeStatus(status: number): string {
    const isSuccess = status >= 200 && status < 300;
    const isRedirect = status >= 300 && status < 400;
    const isClientError = status >= 400 && status < 500;
    const isServerError = status >= 500;
    const isNetworkError = status === 0;

    if (isSuccess) return "2xx";
    if (isRedirect) return "3xx";
    if (isClientError) return "4xx";
    if (isServerError) return "5xx";
    if (isNetworkError) return "0xx";

    return "other";
}

/** Clears all captured network requests. */
export function clearNetworkRequests(): void {
    recentRequests = [];
}
