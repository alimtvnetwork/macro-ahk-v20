/**
 * Marco Extension — Service Worker Runtime
 *
 * Orchestrates the background worker by wiring up the message listener,
 * registering Chrome event handlers, and kicking off the boot sequence.
 *
 * Heavy logic is delegated to focused modules:
 * - message-buffer.ts  — pre-init message queue
 * - boot.ts            — database init, state rehydration, handler binding
 * - keepalive.ts       — periodic flush/prune alarm
 *
 * @see spec/05-chrome-extension/01-overview.md — Extension architecture overview
 * @see spec/05-chrome-extension/18-message-protocol.md — Message type registry
 * @see .lovable/memory/architecture/background/service-worker-structure.md — SW structure
 */

import { handleMessage } from "./message-router";
import { isInitialized, bufferMessage } from "./message-buffer";
import { boot } from "./boot";
import { registerKeepalive } from "./keepalive";
import { removeTabInjection } from "./state-manager";
import { registerAutoInjector } from "./auto-injector";
import { registerInstallListener } from "./default-project-seeder";
import { registerCookieWatcher } from "./cookie-watcher";
import { registerContextMenu } from "./context-menu-handler";
import { registerShortcutCommands } from "./shortcut-command-handler";
import { registerSpaReinject } from "./spa-reinject";
import { startHotReload } from "./hot-reload";
import { MessageType } from "../shared/messages";
import { logCaughtError, BgLogTag} from "./bg-logger";
import { EXTENSION_VERSION } from "../shared/constants";

/* ------------------------------------------------------------------ */
/*  Browser Action Tooltip                                             */
/* ------------------------------------------------------------------ */

try {
    chrome.action.setTitle({ title: `Macro Controller v${EXTENSION_VERSION}` });
} catch {
    /* chrome.action may not be available in all contexts */
}

const BOOT_FAST_PATH_TYPES = new Set<string>([
    MessageType.GET_CONFIG,
    MessageType.GET_TOKEN,
    MessageType.REFRESH_TOKEN,
    MessageType.AUTH_GET_TOKEN,
    MessageType.AUTH_GET_SOURCE,
    MessageType.AUTH_REFRESH,
    MessageType.COOKIES_GET,
    MessageType.COOKIES_GET_DETAIL,
    MessageType.COOKIES_GET_ALL,
]);

function isBootFastPathMessage(message: unknown): boolean {
    const hasType = typeof message === "object" && message !== null && "type" in message;

    if (!hasType) {
        return false;
    }

    const type = (message as { type?: unknown }).type;
    return typeof type === "string" && BOOT_FAST_PATH_TYPES.has(type);
}

/* ------------------------------------------------------------------ */
/*  Message Listener                                                   */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener(
    (
        message: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: unknown) => void,
    ) => {
        const shouldHandleImmediately = isInitialized() || isBootFastPathMessage(message);

        if (shouldHandleImmediately) {
            void handleMessage(message, sender, sendResponse);
        } else {
            bufferMessage(message, sender, sendResponse);
        }

        return true;
    },
);

/* ------------------------------------------------------------------ */
/*  Chrome Event Registrations                                         */
/* ------------------------------------------------------------------ */

/**
 * Each registration is wrapped in try/catch so a single failure
 * (e.g. missing API, changed Chrome version) cannot crash the
 * entire service worker and prevent the message listener from
 * being installed.
 */
const registrations: Array<[string, () => void]> = [
    ["auto-injector", registerAutoInjector],
    ["install-listener", registerInstallListener],
    ["cookie-watcher", registerCookieWatcher],
    ["context-menu", registerContextMenu],
    ["shortcut-commands", registerShortcutCommands],
    ["spa-reinject", registerSpaReinject],
    ["keepalive", registerKeepalive],
    ["hot-reload", startHotReload],
];

for (const [label, register] of registrations) {
    try {
        register();
    } catch (err) {
        logCaughtError(BgLogTag.MARCO, `Registration '${label}' failed (non-fatal)`, err);
    }
}

/* ------------------------------------------------------------------ */
/*  Tab Removal Listener                                               */
/* ------------------------------------------------------------------ */

try {
    chrome.tabs.onRemoved.addListener((tabId) => {
        removeTabInjection(tabId);
    });
} catch (err) {
    logCaughtError(BgLogTag.MARCO, "tabs.onRemoved registration failed", err);
}

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

void boot();

console.log("[Marco] Service worker started");
