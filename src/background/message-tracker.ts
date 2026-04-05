/**
 * Marco Extension — Message Tracker (Ring Buffer)
 *
 * Tracks the most recent handled messages for diagnostics.
 * Extracted from message-router.ts to avoid a circular dependency
 * with message-registry.ts (which imports getRecentTrackedMessages
 * while message-router imports HANDLER_REGISTRY).
 *
 * @see spec/05-chrome-extension/18-message-protocol.md
 */

import { type TrackedMessageEvent } from "../shared/messages";

const MAX_TRACKED = 50;
const trackedMessages: TrackedMessageEvent[] = [];

/** Records a handled message for diagnostics. */
export function trackMessage(type: string, durationMs: number, ok: boolean): void {
    trackedMessages.push({
        type,
        timestamp: new Date().toISOString(),
        durationMs,
        ok,
    });
    if (trackedMessages.length > MAX_TRACKED) {
        trackedMessages.shift();
    }
}

/** Returns the most recent tracked messages (newest first). */
export function getRecentTrackedMessages(limit = 10): TrackedMessageEvent[] {
    const count = Math.min(limit, trackedMessages.length);
    return trackedMessages.slice(-count).reverse();
}
