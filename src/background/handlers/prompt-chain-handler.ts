/**
 * Prompt Chain Handler — Spec 15 T-12
 *
 * CRUD for prompt chains + chain step execution.
 * Chains persisted in chrome.storage.sync.
 *
 * @see spec/05-chrome-extension/45-prompt-manager-crud.md — Prompt manager CRUD
 */

import type { MessageRequest } from "../../shared/messages";
import { getChatBoxXPath, applyTemplateVariables } from "./settings-handler";
import { logBgWarnError, logCaughtError, BgLogTag} from "../bg-logger";

const STORAGE_KEY = "marco_prompt_chains";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PromptChainStep {
    promptId: string;
    promptName: string;
    delayMs?: number;
}

interface PromptChain {
    id: string;
    name: string;
    description?: string;
    steps: PromptChainStep[];
    createdAt: string;
    updatedAt: string;
}

interface SaveChainMessage extends MessageRequest {
    chain: PromptChain;
}

interface DeleteChainMessage extends MessageRequest {
    chainId: string;
}

interface ExecuteChainStepMessage extends MessageRequest {
    promptText: string;
    stepIndex: number;
    totalSteps: number;
    timeoutSec: number;
}

/* ------------------------------------------------------------------ */
/*  Storage helpers                                                    */
/* ------------------------------------------------------------------ */

async function loadChains(): Promise<PromptChain[]> {
    try {
        const result = await chrome.storage.sync.get(STORAGE_KEY);
        return (result[STORAGE_KEY] as PromptChain[] | undefined) ?? [];
    } catch {
        return [];
    }
}

async function saveChains(chains: PromptChain[]): Promise<void> {
    await chrome.storage.sync.set({ [STORAGE_KEY]: chains });
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

export async function handleGetPromptChains(): Promise<{ chains: PromptChain[] }> {
    return { chains: await loadChains() };
}

export async function handleSavePromptChain(msg: MessageRequest): Promise<{ isOk: true; chain: PromptChain }> {
    const { chain } = msg as SaveChainMessage;
    const chains = await loadChains();
    const idx = chains.findIndex((c) => c.id === chain.id);
    if (idx >= 0) {
        chains[idx] = chain;
    } else {
        chains.push(chain);
    }
    await saveChains(chains);
    return { isOk: true, chain };
}

export async function handleDeletePromptChain(msg: MessageRequest): Promise<{ isOk: true }> {
    const { chainId } = msg as DeleteChainMessage;
    const chains = await loadChains();
    await saveChains(chains.filter((c) => c.id !== chainId));
    return { isOk: true };
}

/**
 * Execute a single chain step.
 * Injects the prompt text into the active tab's editor using the prompt-injector
 * content script, with chunked insertion and 4-strategy fallback.
 */
export async function handleExecuteChainStep(msg: MessageRequest): Promise<{ isOk: true }> {
    const step = msg as ExecuteChainStepMessage;

    // Apply template variable substitution (e.g. {{date}}, {{workspace}})
    const resolvedText = await applyTemplateVariables(step.promptText);

    console.log(`[Marco] Executing chain step ${step.stepIndex + 1}/${step.totalSteps}: ${resolvedText.length} chars`);

    // Find the active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) {
        throw new Error("No active tab found — open a target page first");
    }

    // Fetch the configured chatbox XPath
    const chatBoxXPath = await getChatBoxXPath();

    // Inject the prompt text via content script (append mode — no clearing)
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: injectPromptInPage,
            args: [resolvedText, chatBoxXPath],
        });

        const result = results?.[0]?.result as { success: boolean; verified: boolean } | undefined;
        if (!result?.success) {
            throw new Error("Could not find or inject into the editor — is the chat input visible?");
        }

        if (!result.verified) {
            logBgWarnError(BgLogTag.MARCO, `Step ${step.stepIndex + 1}: prompt may be truncated`);
        }

        console.log(`[Marco] Step ${step.stepIndex + 1}/${step.totalSteps} complete`);
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logCaughtError(BgLogTag.MARCO, `Chain step ${step.stepIndex + 1} failed`, err);
        throw new Error(`Step ${step.stepIndex + 1} failed: ${reason}`);
    }

    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Injected function (runs in page context)                           */
/* ------------------------------------------------------------------ */

/**
 * This function is serialized and injected into the page via chrome.scripting.executeScript.
 * It must be self-contained (no imports).
 *
 * v1.48: Simplified to DOM append — creates a <p> tag and appends it to the editor.
 * No clipboard strategies. Always appends, never replaces.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
function injectPromptInPage(text: string, chatBoxXPath?: string): { success: boolean; verified: boolean } {
    // XPath-based editor discovery
    function findByXPath(xpath: string): HTMLElement | null {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            const node = result.singleNodeValue;
            if (!node) return null;
            let el = node as HTMLElement;
            while (el && el !== document.body) {
                if (el.getAttribute?.("contenteditable") === "true" ||
                    el instanceof HTMLTextAreaElement ||
                    el instanceof HTMLInputElement) {
                    return el;
                }
                el = el.parentElement as HTMLElement;
            }
            return null;
        } catch {
            return null;
        }
    }

    // Find the editor element — XPath first, then CSS selectors
    let editor: HTMLElement | null = null;

    if (chatBoxXPath) {
        editor = findByXPath(chatBoxXPath);
    }

    if (!editor) {
        const selectors = [
            ".tiptap.ProseMirror",
            ".ProseMirror[contenteditable='true']",
            "[contenteditable='true'].tiptap",
            "form [contenteditable='true']",
            "[role='textbox'][contenteditable='true']",
            "textarea",
        ];
        for (const sel of selectors) {
            editor = document.querySelector<HTMLElement>(sel);
            if (editor) break;
        }
    }
    if (!editor) return { success: false, verified: false };

    // Append prompt text using DOM manipulation
    try {
        editor.focus();

        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            const currentVal = editor.value ?? "";
            const newVal = currentVal + (currentVal.length > 0 ? "\n" : "") + text;
            const nativeSetter =
                Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set ??
                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (nativeSetter) {
                nativeSetter.call(editor, newVal);
            } else {
                editor.value = newVal;
            }
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            editor.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
            // For contenteditable: create <p> and append
            const p = document.createElement("p");
            p.textContent = text;
            editor.appendChild(p);
            editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
            // Move cursor to end
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(p);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        return { success: true, verified: true };
    } catch {
        return { success: false, verified: false };
    }
}
