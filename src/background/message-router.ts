/**
 * Marco Extension — Message Router
 *
 * Dispatches incoming messages to the appropriate handler
 * based on the message type. Uses a handler registry to
 * keep complexity low per function.
 */

import { type MessageRequest } from "../shared/messages";
import { trackMessage } from "./message-tracker";
import { logCaughtError } from "./bg-logger";

import {
    BROADCAST_TYPES,
    HANDLER_REGISTRY,
} from "./message-registry";

/* ------------------------------------------------------------------ */
/*  Re-export for backward compat                                      */
/* ------------------------------------------------------------------ */

export { getRecentTrackedMessages } from "./message-tracker";

/* ------------------------------------------------------------------ */
/*  Message Dispatch                                                   */
/* ------------------------------------------------------------------ */

/** Dispatches a message to its handler and sends the response. */
export async function handleMessage(
    rawMessage: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
): Promise<void> {
    const message = rawMessage as MessageRequest;

    try {
        const response = await routeMessage(message, sender);
        sendResponse(response);
    } catch (routingError) {
        sendResponse(buildErrorResponse(routingError));
    }
}

/** Routes a message to the correct handler via registry lookup. */
// eslint-disable-next-line max-lines-per-function
async function routeMessage(
    message: MessageRequest,
    sender: chrome.runtime.MessageSender,
): Promise<unknown> {
    const messageType = typeof message === "object"
        && message !== null
        && "type" in message
        ? (message as { type?: MessageRequest["type"] | "__PING__" }).type
        : undefined;

    if (messageType === "__PING__") {
        return { isOk: true };
    }

    if (messageType === undefined) {
        return {
            isOk: false,
            errorMessage: "Missing message type",
        };
    }

    const isBroadcast = BROADCAST_TYPES.has(messageType);

    if (isBroadcast) {
        trackMessage(String(messageType), 0, true);
        return { isOk: true };
    }

    const handler = HANDLER_REGISTRY.get(messageType);
    const hasHandler = handler !== undefined;

    if (hasHandler) {
        const start = performance.now();
        try {
            const result = await handler(message, sender);
            trackMessage(String(messageType), Math.round(performance.now() - start), true);
            return result;
        } catch (err) {
            trackMessage(String(messageType), Math.round(performance.now() - start), false);
            throw err;
        }
    }

    return {
        isOk: false,
        errorMessage: `Unknown message type: ${String(messageType)}`,
    };
}

/** Builds a standardized error response from a caught error. */
function buildErrorResponse(error: unknown): {
    isOk: false;
    errorMessage: string;
} {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    logCaughtError(BgLogTag.MESSAGE_ROUTER, `Message handler failed: ${errorMessage}`, error);

    return {
        isOk: false,
        errorMessage,
    };
}
