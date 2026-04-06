/**
 * Marco Extension — Shortcut Command Handler
 *
 * Handles keyboard command events from manifest.json.
 * Current command: run-scripts (Ctrl+Shift+Down by default).
 */

import { MessageType } from "../shared/messages";
import { handleMessage } from "./message-router";

const RUN_SCRIPTS_COMMAND = "run-scripts";

interface ActiveProjectResponse {
    activeProject?: {
        scripts?: unknown[];
    } | null;
}

/** Registers chrome.commands listeners. */
export function registerShortcutCommands(): void {
    chrome.commands.onCommand.addListener((command) => {
        const isRunScripts = command === RUN_SCRIPTS_COMMAND;

        if (isRunScripts) {
            void runScriptsFromShortcut();
        }
    });

    console.log("[Marco] ✓ Shortcut commands registered");
}

/** Runs active project scripts in the currently active tab. */
async function runScriptsFromShortcut(): Promise<void> {
    try {
        const activeTabId = await getActiveTabId();
        const hasActiveTab = activeTabId !== null;

        if (hasActiveTab === false) {
            return;
        }

        const scripts = await getActiveProjectScripts();
        const hasScripts = scripts.length > 0;

        if (hasScripts === false) {
            return;
        }

        await sendInternalMessage({
            type: MessageType.INJECT_SCRIPTS,
            tabId: activeTabId,
            scripts,
        });

        console.log("[Marco] Shortcut run executed (%d scripts)", scripts.length);
    } catch (runError) {
        const reason = runError instanceof Error ? runError.message : String(runError);
        console.warn("[Marco] Shortcut run failed: %s", reason);
    }
}

/** Returns the active tab id, or null if unavailable. */
async function getActiveTabId(): Promise<number | null> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tab?.id;
    const hasTabId = typeof tabId === "number";

    return hasTabId ? tabId : null;
}

/** Loads active project scripts used by popup run injection. */
async function getActiveProjectScripts(): Promise<unknown[]> {
    const response = await sendInternalMessage<ActiveProjectResponse>({
        type: MessageType.GET_ACTIVE_PROJECT,
    });

    const scripts = response?.activeProject?.scripts ?? [];
    const isArray = Array.isArray(scripts);

    return isArray ? scripts : [];
}

/** Dispatches an internal message through the background router. */
function sendInternalMessage<T>(message: Record<string, unknown>): Promise<T> {
    return new Promise((resolve) => {
        const sender = {} as chrome.runtime.MessageSender;
        handleMessage(message, sender, (response: unknown) => {
            resolve(response as T);
        });
    });
}
