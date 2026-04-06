/**
 * Marco Extension — Prompt Injector (Content Script)
 *
 * v1.48: Simplified to DOM append approach.
 * Appends a <p> tag with prompt text to the editor — no clipboard strategies.
 * Supports XPath-based and CSS selector editor discovery.
 */

/* ------------------------------------------------------------------ */
/*  Editor Discovery                                                   */
/* ------------------------------------------------------------------ */

function findEditorByXPath(xpath: string): HTMLElement | null {
    try {
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue;
        if (!node) return null;
        // Walk up to find the nearest contenteditable or input/textarea
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

function findTiptapEditor(chatBoxXPath?: string): HTMLElement | null {
    // Try XPath-based discovery first
    if (chatBoxXPath) {
        const xpathResult = findEditorByXPath(chatBoxXPath);
        if (xpathResult) return xpathResult;
    }

    // Fallback: CSS selectors
    const selectors = [
        ".tiptap.ProseMirror",
        ".ProseMirror[contenteditable='true']",
        "[contenteditable='true'].tiptap",
        "form [contenteditable='true']",
        "[role='textbox'][contenteditable='true']",
        "textarea",
    ];

    for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
    }
    return null;
}

/* ------------------------------------------------------------------ */
/*  DOM Append Insertion                                               */
/* ------------------------------------------------------------------ */

/**
 * Appends prompt text to the editor using direct DOM manipulation.
 * For contenteditable: creates a <p> element and appends it.
 * For textarea/input: appends text to .value.
 * Never uses clipboard APIs or execCommand.
 */
function appendToEditor(editor: HTMLElement, text: string): boolean {
    try {
        editor.focus();

        if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
            // For textarea/input: append text to existing value
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
            // For contenteditable (ProseMirror/Tiptap): create a <p> and append it
            const p = document.createElement("p");
            p.textContent = text;
            editor.appendChild(p);
            // Dispatch input event so the editor framework picks up the change
            editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
            // Move cursor to end of the new content
            const sel = window.getSelection();
            if (sel) {
                const range = document.createRange();
                range.selectNodeContents(p);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }

        console.log(`[Marco] Prompt appended (${text.length} chars)`);
        return true;
    } catch (err) {
        console.error("[Marco] Prompt append failed:", err);
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Auto-Submit                                                        */
/* ------------------------------------------------------------------ */

function findSubmitButton(): HTMLElement | null {
    const selectors = [
        'button[type="submit"]',
        'form button:last-of-type',
        'button[aria-label*="send" i]',
        'button[aria-label*="submit" i]',
        'button svg[class*="arrow"]',
        'button svg[class*="send"]',
        'form [role="button"]',
    ];

    for (const sel of selectors) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) {
            const btn = el.closest("button") ?? el;
            if (btn && !btn.hasAttribute("disabled")) return btn as HTMLElement;
        }
    }

    // Fallback: last enabled button inside a form containing the editor
    const editor = findTiptapEditor();
    if (editor) {
        const form = editor.closest("form");
        if (form) {
            const buttons = form.querySelectorAll<HTMLButtonElement>("button:not([disabled])");
            if (buttons.length > 0) return buttons[buttons.length - 1];
        }
    }

    return null;
}

function triggerSubmit(): boolean {
    const btn = findSubmitButton();
    if (btn) {
        console.log("[Marco] Auto-submit: clicking send button");
        btn.click();
        return true;
    }

    const editor = findTiptapEditor();
    if (editor) {
        console.log("[Marco] Auto-submit: sending Enter key");
        editor.dispatchEvent(new KeyboardEvent("keydown", {
            key: "Enter",
            code: "Enter",
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
        }));
        return true;
    }

    return false;
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export async function injectPromptText(
    text: string,
    options?: { autoSubmit?: boolean; submitDelayMs?: number; chatBoxXPath?: string }
): Promise<{ success: boolean; method: string; verified: boolean; submitted: boolean }> {
    const editor = findTiptapEditor(options?.chatBoxXPath);
    if (!editor) {
        return { success: false, method: "none", verified: false, submitted: false };
    }

    const success = appendToEditor(editor, text);

    // Auto-submit after injection
    let submitted = false;
    if (success && (options?.autoSubmit ?? true)) {
        const delay = options?.submitDelayMs ?? 200;
        console.log(`[Marco] Waiting ${delay}ms before auto-submit`);
        await new Promise(r => setTimeout(r, delay));
        submitted = triggerSubmit();
    }

    return {
        success,
        method: success ? "dom-append" : "none",
        verified: success,
        submitted,
    };
}
