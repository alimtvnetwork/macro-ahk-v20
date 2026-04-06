/**
 * Marco Extension — Pre-Init Message Buffer
 *
 * Queues incoming messages before the service worker is fully initialized,
 * then drains them in order once boot completes.
 */

import { handleMessage } from "./message-router";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BufferedMessage {
    message: unknown;
    sender: chrome.runtime.MessageSender;
    sendResponse: (response: unknown) => void;
}

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let initialized = false;
const messageBuffer: BufferedMessage[] = [];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Returns whether the service worker has finished booting. */
export function isInitialized(): boolean {
    return initialized;
}

/** Marks the service worker as initialized. */
export function markInitialized(): void {
    initialized = true;
}

/** Enqueues a message for later processing. */
export function bufferMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
): void {
    messageBuffer.push({ message, sender, sendResponse });
}

/** Drains all buffered messages in order. */
export async function drainBuffer(): Promise<void> {
    for (const entry of messageBuffer) {
        await handleMessage(entry.message, entry.sender, entry.sendResponse);
    }
    messageBuffer.length = 0;
}
