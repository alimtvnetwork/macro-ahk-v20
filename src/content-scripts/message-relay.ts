/**
 * Marco Extension — Content Script: Message Relay
 *
 * Bridges communication between injected scripts (macro controller)
 * and the background service worker. Listens for window.postMessage
 * from the page, validates origin/source, forwards to background via
 * chrome.runtime.sendMessage, and relays responses back.
 *
 * Also forwards unsolicited broadcasts from the background back to
 * the page via window.postMessage.
 *
 * See spec/05-chrome-extension/43-macro-controller-extension-bridge.md
 *
 * Canonical source — chrome-extension/src/content-scripts/ re-exports from here.
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SOURCE_CONTROLLER = "marco-controller";
const SOURCE_SDK = "marco-sdk";
const SOURCE_EXTENSION = "marco-extension";
const RESPONSE_TYPE = "RESPONSE";

/** Message types that are allowed to be forwarded from page to background. */
const ALLOWED_TYPES = new Set([
    "USER_SCRIPT_LOG",
    "USER_SCRIPT_ERROR",
    "USER_SCRIPT_DATA_SET",
    "USER_SCRIPT_DATA_GET",
    "USER_SCRIPT_DATA_DELETE",
    "USER_SCRIPT_DATA_KEYS",
    "USER_SCRIPT_DATA_GET_ALL",
    "USER_SCRIPT_DATA_CLEAR",
    "RECORD_CYCLE_METRIC",
    "GET_RUN_STATS",
    "GET_CONFIG",
    "GET_TOKEN",
    "REFRESH_TOKEN",
    "GET_API_STATUS",
    "GET_API_ENDPOINTS",
    // ─── Prompt CRUD (Spec 45) ───
    "GET_PROMPTS",
    "SAVE_PROMPT",
    "DELETE_PROMPT",
    "REORDER_PROMPTS",
    // ─── Project KV Store (Issue 50) ───
    "KV_GET",
    "KV_SET",
    "KV_DELETE",
    "KV_LIST",
    // ─── Grouped KV Store (Issue 60) ───
    "GKV_GET",
    "GKV_SET",
    "GKV_DELETE",
    "GKV_LIST",
    "GKV_CLEAR_GROUP",
    // ─── Project File Storage (Issue 50) ───
    "FILE_SAVE",
    "FILE_GET",
    "FILE_LIST",
    "FILE_DELETE",
    // ─── Marco SDK (Spec 18) ───
    "AUTH_GET_TOKEN",
    "AUTH_GET_SOURCE",
    "AUTH_REFRESH",
    "AUTH_IS_EXPIRED",
    "AUTH_GET_JWT",
    "COOKIES_GET",
    "COOKIES_GET_DETAIL",
    "COOKIES_GET_ALL",
    "CONFIG_GET",
    "CONFIG_GET_ALL",
    "CONFIG_SET",
    "XPATH_GET",
    "XPATH_GET_ALL",
    "FILE_READ",
    // ─── Script Hot-Reload (Issue 77) ───
    "GET_SCRIPT_INFO",
    "HOT_RELOAD_SCRIPT",
]);

/** Broadcast types sent from background → content script → page. */
const BROADCAST_TYPES = new Set([
    "CONFIG_UPDATED",
    "CONFIG_CHANGED",
    "TOKEN_EXPIRED",
    "TOKEN_UPDATED",
]);

/* ------------------------------------------------------------------ */
/*  Rate Limiting                                                      */
/* ------------------------------------------------------------------ */

const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX = 100;

let rateLimitCount = 0;
let rateLimitResetTime = Date.now() + RATE_LIMIT_WINDOW_MS;

/**
 * Checks whether the current message should be rate-limited.
 * Returns true if the message is allowed, false if throttled.
 */
function checkRateLimit(): boolean {
    const now = Date.now();
    const isWindowExpired = now >= rateLimitResetTime;

    if (isWindowExpired) {
        rateLimitCount = 0;
        rateLimitResetTime = now + RATE_LIMIT_WINDOW_MS;
    }

    rateLimitCount++;

    return rateLimitCount <= RATE_LIMIT_MAX;
}

/* ------------------------------------------------------------------ */
/*  Page → Background Relay                                            */
/* ------------------------------------------------------------------ */

/**
 * Validates and forwards messages from the page to the background.
 * Only processes messages with source === 'marco-controller' and
 * an allowed message type.
 */
function handlePageMessage(event: MessageEvent): void {
    const isFromSamePage = event.source === window;

    if (!isFromSamePage) {
        return;
    }

    const data = event.data as Record<string, unknown>;
    const messageSource = data?.source as string | undefined;
    const isFromController = messageSource === SOURCE_CONTROLLER;
    const isFromSdk = messageSource === SOURCE_SDK;

    if (!isFromController && !isFromSdk) {
        return;
    }

    const requestId = typeof data.requestId === "string"
        ? data.requestId
        : undefined;

    const messageType = String(data.type ?? "");
    const isAllowedType = ALLOWED_TYPES.has(messageType);

    if (!isAllowedType) {
        console.warn(
            `[Marco Relay] Blocked disallowed message type: "${messageType}" from source "${String(data.source ?? "unknown")}". Allowed types: ${[...ALLOWED_TYPES].join(", ")}`,
        );
        postResponseToPage(requestId, {
            isOk: false,
            errorMessage: `Blocked disallowed message type: ${messageType}`,
        }, isFromSdk);
        return;
    }

    const isWithinRateLimit = checkRateLimit();

    if (!isWithinRateLimit) {
        console.warn(`[Marco Relay] Rate limit exceeded, dropping message type="${messageType}" from source="${String(data.source ?? "unknown")}". Too many messages in sliding window.`);
        postResponseToPage(requestId, {
            isOk: false,
            errorMessage: "Relay rate limit exceeded",
        }, isFromSdk);
        return;
    }

    forwardToBackground(data, requestId, isFromSdk);
}

/**
 * Sends the validated message to the background service worker
 * and relays the response back to the page.
 */
function forwardToBackground(
    message: Record<string, unknown>,
    requestId: string | undefined,
    isSdkSource: boolean = false,
): void {
    try {
        chrome.runtime.sendMessage(message, (response: unknown) => {
            const hasError = chrome.runtime.lastError;

            if (hasError) {
                postResponseToPage(requestId, {
                    isOk: false,
                    errorMessage:
                        chrome.runtime.lastError?.message ??
                        "Extension context invalidated",
                }, isSdkSource);
                return;
            }

            postResponseToPage(requestId, response, isSdkSource);
        });
    } catch (sendError) {
        const errorMessage = sendError instanceof Error
            ? sendError.message
            : String(sendError);

        postResponseToPage(requestId, {
            isOk: false,
            errorMessage: errorMessage || "Failed to send message to extension",
        }, isSdkSource);
    }
}

/**
 * Posts a response back to the page.
 * SDK messages use a different response format (source: "marco-sdk-response").
 */
function postResponseToPage(
    requestId: string | undefined,
    payload: unknown,
    isSdkResponse: boolean = false,
): void {
    if (isSdkResponse) {
        // SDK bridge expects { source: "marco-sdk-response", requestId, result/error }
        const sdkPayload = payload as Record<string, unknown> | null;
        const hasError = sdkPayload && sdkPayload.isOk === false;
        window.postMessage(
            {
                source: "marco-sdk-response",
                requestId: requestId ?? null,
                ...(hasError
                    ? { error: sdkPayload.errorMessage ?? "Unknown error" }
                    : { result: sdkPayload }),
            },
            "*",
        );
    } else {
        window.postMessage(
            {
                source: SOURCE_EXTENSION,
                type: RESPONSE_TYPE,
                requestId: requestId ?? null,
                payload,
            },
            "*",
        );
    }
}

/* ------------------------------------------------------------------ */
/*  Background → Page Relay (Broadcasts)                               */
/* ------------------------------------------------------------------ */

/**
 * Listens for unsolicited messages from the background service worker
 * (e.g., CONFIG_UPDATED, TOKEN_EXPIRED) and forwards them to the page.
 */
function handleBackgroundMessage(
    message: Record<string, unknown>,
    _sender: chrome.runtime.MessageSender,
    _sendResponse: (response?: unknown) => void,
): boolean {
    const messageType = message.type as string;
    const isBroadcast = BROADCAST_TYPES.has(messageType);

    if (!isBroadcast) {
        return false;
    }

    // Forward to controller.
    // Include both top-level fields and payload for backward compatibility.
    const forwardedPayload = (message.payload ?? message) as Record<string, unknown>;

    window.postMessage(
        {
            ...forwardedPayload,
            source: SOURCE_EXTENSION,
            type: messageType,
            payload: forwardedPayload,
        },
        "*",
    );

    // Also forward CONFIG_CHANGED to SDK listeners
    if (messageType === "CONFIG_CHANGED") {
        const payload = (message.payload ?? message) as Record<string, unknown>;
        window.postMessage(
            {
                source: "marco-sdk-event",
                type: "CONFIG_CHANGED",
                key: payload.key,
                value: payload.value,
            },
            "*",
        );
    }

    return false; // No async response needed
}

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

function initMessageRelay(): void {
    // Sentinel for programmatic re-injection detection
    if ((window as unknown as Record<string, unknown>).__marcoRelayActive) {
        console.log("[Marco] Message relay already active — skipping duplicate init");
        return;
    }
    (window as unknown as Record<string, unknown>).__marcoRelayActive = true;

    // Page → Background
    window.addEventListener("message", handlePageMessage);

    // Background → Page
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);

    console.log("[Marco] Message relay initialized");
}

initMessageRelay();
