/**
 * Builds the default MacroLoop configuration JSON.
 * Unified config: comboSwitch + macroLoop + creditStatus + general.
 * This is the sole config for the single-script architecture.
 */

import type { StoredConfig } from "../../shared/script-config-types";
import { DEFAULT_LOOPING_CONFIG_ID } from "./seed-ids";

/** Returns the default MacroLoop config. */
export function buildDefaultLoopingConfig(): StoredConfig {
    const now = new Date().toISOString();

    return {
        id: DEFAULT_LOOPING_CONFIG_ID,
        name: "macro-looping-config.json",
        json: JSON.stringify(buildConfigPayload(), null, 2),
        createdAt: now,
        updatedAt: now,
    };
}

/** Returns the unified config payload. */
function buildConfigPayload(): Record<string, unknown> {
    return {
        comboSwitch: buildComboSwitch(),
        macroLoop: buildMacroLoop(),
        creditStatus: buildCreditStatus(),
        general: buildGeneral(),
    };
}

/** ComboSwitch XPaths, timing, fallbacks, element IDs. */
function buildComboSwitch(): Record<string, unknown> {
    return {
        xpaths: {
            transferButton: "/html/body/div[2]/div/div/div/div/div/div/div[1]/div/div/div[3]/div[6]/div[2]/button",
            projectName: "/html/body/div[2]/div/div/div/div/div/div/div[1]/div/div/div[2]/div/div[1]/div/p",
            combo1: "/html/body/div[6]/div[2]/div[1]/div/p",
            combo2Button: "/html/body/div[6]/div[2]/div[2]/button",
            optionsContainer: "/html/body/div[7]/div",
            confirmButton: "/html/body/div[6]/div[3]/button[2]",
        },
        fallbacks: buildComboFallbacks(),
        timing: buildComboTiming(),
        elementIds: buildComboElementIds(),
        shortcuts: buildComboShortcuts(),
    };
}

/** Fallback selectors for combo elements. */
function buildComboFallbacks(): Record<string, unknown> {
    return {
        transfer: {
            textMatch: ["Transfer", "Transfer project"],
            tag: "button",
            ariaLabel: "Transfer",
            headingSearch: "transfer",
        },
        combo1: {
            tag: "p",
            selector: 'div[role="dialog"] p.min-w-0.truncate|div[role="dialog"] p.truncate|div[role="dialog"] p',
        },
        combo2: {
            tag: "button",
            selector: 'div[role="dialog"] button[role="combobox"]',
            role: "combobox",
        },
        options: {
            selector: '[role="listbox"]|[data-radix-popper-content-wrapper] > div|[cmdk-list]',
            role: "listbox",
        },
        confirm: {
            textMatch: ["Confirm", "Confirm transfer", "Save"],
            tag: "button",
            selector: 'div[role="dialog"] button:last-child|div[role="alertdialog"] button:last-child',
        },
    };
}

/** Timing for combo switch operations. */
function buildComboTiming(): Record<string, number> {
    return {
        pollIntervalMs: 300,
        openMaxAttempts: 20,
        waitMaxAttempts: 20,
        retryCount: 2,
        retryDelayMs: 1000,
        confirmDelayMs: 500,
    };
}

/** Element IDs for combo switch UI. */
function buildComboElementIds(): Record<string, string> {
    return {
        scriptMarker: "ahk-combo-script",
        buttonContainer: "ahk-combo-btn-container",
        buttonUp: "ahk-combo-up-btn",
        buttonDown: "ahk-combo-down-btn",
        progressStatus: "__combo_progress_status__",
    };
}

/** Keyboard shortcuts for combo switch. */
function buildComboShortcuts(): Record<string, string> {
    return {
        focusTextboxKey: "/",
        comboUpKey: "ArrowUp",
        comboDownKey: "ArrowDown",
        shortcutModifier: "none",
    };
}

/** MacroLoop timing, URLs, XPaths, element IDs. */
function buildMacroLoop(): Record<string, unknown> {
    return {
        creditBarWidthPx: 160,
        timing: buildLoopTiming(),
        urls: buildLoopUrls(),
        xpaths: buildLoopXPaths(),
        elementIds: buildLoopElementIds(),
        shortcuts: buildLoopShortcuts(),
    };
}

/** Timing for loop intervals. */
function buildLoopTiming(): Record<string, number> {
    return {
        loopIntervalMs: 100000,
        countdownIntervalMs: 1000,
        firstCycleDelayMs: 500,
        postComboDelayMs: 4000,
        pageLoadDelayMs: 2500,
        dialogWaitMs: 3000,
        wsCheckIntervalMs: 5000,
    };
}

/** URL patterns for domain validation. */
function buildLoopUrls(): Record<string, string> {
    return {
        requiredDomain: "https://lovable.dev/",
        settingsPath: "/settings?tab=project",
        defaultView: "?view=codeEditor",
    };
}

/** XPath selectors for loop UI elements. */
function buildLoopXPaths(): Record<string, string> {
    return {
        projectButton: "/html/body/div[2]/div/div[2]/nav/div/div/div/div[1]/div[1]/button",
        mainProgress: "/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[1]",
        progress: "/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[2]",
        workspace: "/html/body/div[6]/div/div[2]/div[1]/p",
        workspaceNav: "",
        controls: "/html/body/div[3]/div/div[2]/main/div/div/div[3]",
        promptActive: "/html/body/div[2]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]",
        projectName: "/html/body/div[2]/div/div/div/div/div/div/div[1]/div/div/div[2]/div/div[1]/div/p",
        freeCreditProgress: "/html/body/div[6]/div/div[2]/div[2]/div/div[2]/div/div[2]",
    };
}

/** Element IDs for loop UI. */
function buildLoopElementIds(): Record<string, string> {
    return {
        scriptMarker: "ahk-loop-script",
        container: "ahk-loop-container",
        status: "ahk-loop-status",
        startBtn: "ahk-loop-start-btn",
        stopBtn: "ahk-loop-stop-btn",
        upBtn: "ahk-loop-up-btn",
        downBtn: "ahk-loop-down-btn",
        recordIndicator: "ahk-loop-record",
        jsExecutor: "ahk-loop-js-executor",
        jsExecuteBtn: "ahk-loop-js-execute-btn",
    };
}

/** Keyboard shortcuts for loop. */
function buildLoopShortcuts(): Record<string, string> {
    return {
        focusTextboxKey: "/",
        startKey: "s",
        stopKey: "x",
        shortcutModifier: "none",
    };
}

/** Credit status API and timing config. */
function buildCreditStatus(): Record<string, unknown> {
    return {
        api: {
            baseUrl: "https://api.lovable.dev",
            authMode: "cookieSession",
        },
        timing: {
            autoCheckEnabled: true,
            autoCheckIntervalSeconds: 60,
            cacheTtlSeconds: 30,
        },
        retry: {
            maxRetries: 2,
            retryBackoffMs: 1000,
        },
        xpaths: {
            plansButton: "/html/body/div[3]/div/div/aside/nav/div[2]/div[2]/button[3]",
            freeProgressBar: "/html/body/div[3]/div/div/div/div/div/div/div[10]/div/div/div[2]/div/div[2]/div/div[2]/div/div[2]/div/div[4]",
            totalCredits: "/html/body/div[3]/div/div/div/div/div/div/div[10]/div/div/div[2]/div/div[2]/div/div[1]/p[2]",
        },
    };
}

/** General settings. */
function buildGeneral(): Record<string, unknown> {
    return {
        browserExe: "chrome.exe",
        debug: true,
        configWatchIntervalMs: 2000,
    };
}
