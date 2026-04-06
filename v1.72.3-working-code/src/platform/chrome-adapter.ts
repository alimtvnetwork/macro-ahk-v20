/**
 * Marco — Chrome Extension Platform Adapter
 *
 * Real implementation backed by chrome.runtime, chrome.storage,
 * and chrome.tabs APIs. Used when running inside the extension.
 */

import "./chrome-api-types";

import type {
    PlatformAdapter,
    PlatformStorage,
    PlatformTabs,
    MessagePayload,
} from "./platform-adapter";

/* ------------------------------------------------------------------ */
/*  Retry Constants                                                    */
/* ------------------------------------------------------------------ */

const RETRY_DELAY_MS = 180;
const MAX_PING_ATTEMPTS = 12;

const RETRYABLE_ERROR_PATTERN =
    /(Could not establish connection|Receiving end does not exist|message port closed)/i;

/* ------------------------------------------------------------------ */
/*  Storage                                                            */
/* ------------------------------------------------------------------ */

const chromeStorage: PlatformStorage = {
    async get(key: string): Promise<unknown> {
        const result = await chrome.storage.local.get(key);
        return result[key] ?? null;
    },

    async set(key: string, value: unknown): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
    },

    async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key);
    },
};

/* ------------------------------------------------------------------ */
/*  Tabs                                                               */
/* ------------------------------------------------------------------ */

const chromeTabs: PlatformTabs = {
    openUrl(url: string): void {
        chrome.tabs.create({ url });
    },

    async getActiveTabId(): Promise<number | null> {
        const [tab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });

        const hasValidId = tab !== undefined && tab.id !== undefined;
        return hasValidId ? tab.id ?? null : null;
    },
};

/* ------------------------------------------------------------------ */
/*  Messaging with Retry                                               */
/* ------------------------------------------------------------------ */

/** Checks whether the runtime error is a transient connection issue. */
function isRetryableError(error: unknown): boolean {
    const message = error instanceof Error
        ? error.message
        : String(error);

    return RETRYABLE_ERROR_PATTERN.test(message);
}

/** Throws if the response is a standardized background error envelope. */
function throwIfErrorResponse(response: unknown): void {
    const isObjectResponse =
        typeof response === "object" && response !== null;

    if (!isObjectResponse) {
        return;
    }

    const hasErrorFlag =
        "isOk" in response
        && (response as { isOk?: boolean }).isOk === false;

    const hasErrorMessage = "errorMessage" in response;

    if (hasErrorFlag && hasErrorMessage) {
        const fallback = "Background message failed";
        const errorText =
            (response as { errorMessage?: string }).errorMessage ?? fallback;

        throw new Error(errorText);
    }
}

/** Waits for the background service worker to become responsive. */
async function waitForReceiver(): Promise<void> {
    for (let i = 0; i < MAX_PING_ATTEMPTS; i++) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "__PING__",
            });

            const isReady =
                typeof response === "object"
                && response !== null
                && "isOk" in response
                && (response as { isOk?: boolean }).isOk === true;

            if (isReady) {
                return;
            }
        } catch {
            // keep retrying
        }

        const hasAttemptsRemaining = i < MAX_PING_ATTEMPTS - 1;

        if (hasAttemptsRemaining) {
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
        }
    }

    throw new Error(
        "Background service worker is still starting. Please retry in a moment.",
    );
}

/** Sends a message with one automatic retry on transient errors. */
async function sendChromeMessage<T>(message: MessagePayload): Promise<T> {
    try {
        const response = await chrome.runtime.sendMessage(message);
        throwIfErrorResponse(response);
        return response as T;
    } catch (firstError) {
        const shouldRetry = isRetryableError(firstError);

        if (!shouldRetry) {
            throw firstError;
        }

        await waitForReceiver();
        const response = await chrome.runtime.sendMessage(message);
        throwIfErrorResponse(response);
        return response as T;
    }
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const chromeAdapter: PlatformAdapter = {
    target: "extension",
    sendMessage: sendChromeMessage,
    storage: chromeStorage,
    tabs: chromeTabs,

    getExtensionUrl(path: string): string {
        return chrome.runtime.getURL(path);
    },
};
