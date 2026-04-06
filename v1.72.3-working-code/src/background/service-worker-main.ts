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

registerAutoInjector();
registerInstallListener();
registerCookieWatcher();
registerContextMenu();
registerShortcutCommands();
registerSpaReinject();
registerKeepalive();
startHotReload();

/* ------------------------------------------------------------------ */
/*  Tab Removal Listener                                               */
/* ------------------------------------------------------------------ */

chrome.tabs.onRemoved.addListener((tabId) => {
    removeTabInjection(tabId);
});

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

void boot();

console.log("[Marco] Service worker started");
