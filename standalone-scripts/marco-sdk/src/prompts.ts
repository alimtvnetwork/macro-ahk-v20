/**
 * Riseup Macro SDK — Prompts Module
 *
 * Full prompts API: fetch, cache, CRUD, config resolution, and injection.
 * Available to all scripts via `marco.prompts`.
 *
 * Cache strategy: in-memory → IndexedDB (stale-while-revalidate) → extension bridge (with retry).
 *
 * @see spec/05-chrome-extension/45-prompt-manager-crud.md
 * @see spec/05-chrome-extension/52-prompt-caching-indexeddb.md
 */

import { sendMessage } from "./bridge";
import { NamespaceLogger } from "./logger";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PromptEntry {
    readonly id?: string;
    readonly name: string;
    readonly text: string;
    readonly category?: string;
    readonly categories?: string;
    readonly version?: string;
    readonly order?: number;
    readonly isDefault?: boolean;
    readonly isFavorite?: boolean;
    readonly createdAt?: string;
    readonly updatedAt?: string;
}

export interface ResolvedPromptsConfig {
    readonly entries: PromptEntry[];
    readonly pasteTargetXPath: string;
    readonly pasteTargetSelector: string;
}

export interface SavePromptInput {
    readonly name: string;
    readonly text: string;
    readonly category?: string;
    readonly id?: string;
}

export interface PromptsApi {
    /** Fetch all prompts (cache-first with background revalidation). */
    getAll(): Promise<PromptEntry[]>;
    /** Save or update a prompt. Returns the saved entry. */
    save(prompt: SavePromptInput): Promise<PromptEntry>;
    /** Delete a prompt by ID. */
    delete(id: string): Promise<void>;
    /** Reorder prompts by providing an array of IDs in desired order. */
    reorder(ids: string[]): Promise<void>;
    /** Inject prompt text into the active editor on the page. Returns true if successful. */
    inject(text: string, options?: { pasteTargetXPath?: string; pasteTargetSelector?: string }): boolean;
    /** Get the resolved prompts config (entries merged from all sources). */
    getConfig(): Promise<ResolvedPromptsConfig>;
    /** Invalidate all caches (in-memory + IndexedDB). Next getAll() will fetch fresh. */
    invalidateCache(): Promise<void>;
    /** Pre-warm the cache. Call during boot so dropdown opens instantly. */
    preWarm(): Promise<PromptEntry[]>;
}

/* ------------------------------------------------------------------ */
/*  IndexedDB Cache                                                    */
/* ------------------------------------------------------------------ */

const IDB_NAME = "marco_prompts_cache";
const IDB_VERSION = 1;
const IDB_STORE = "prompts";
const IDB_KEY = "prompt_cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

interface CacheRecord {
    id: string;
    entries: PromptEntry[];
    fetchedAt: number;
    hash: string;
}

function computeHash(entries: PromptEntry[]): string {
    const parts: string[] = [];
    for (const e of entries) {
        parts.push(`${e.name || ""}:${(e.text || "").length}`);
    }
    parts.sort();
    return parts.join("|");
}

function openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        try {
            const req = indexedDB.open(IDB_NAME, IDB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(IDB_STORE)) {
                    db.createObjectStore(IDB_STORE, { keyPath: "id" });
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        } catch (e) {
            NamespaceLogger.error('resolvePrompt', 'Failed to resolve prompt', e);
            reject(e);
        }
    });
}

function readCache(): Promise<CacheRecord | null> {
    return openIdb()
        .then((db) => {
            return new Promise<CacheRecord | null>((resolve) => {
                try {
                    const tx = db.transaction(IDB_STORE, "readonly");
                    const store = tx.objectStore(IDB_STORE);
                    const req = store.get(IDB_KEY);
                    req.onsuccess = () => {
                        const record = req.result as CacheRecord | undefined;
                        resolve(record?.entries?.length ? record : null);
                    };
                    req.onerror = () => resolve(null);
                    tx.oncomplete = () => db.close();
                } catch {
                    resolve(null);
                }
            });
        })
        .catch((e) => { NamespaceLogger.error('fetchPromptList', 'Failed to fetch prompt list', e); return null; });
}

function writeCache(entries: PromptEntry[]): Promise<void> {
    const hash = computeHash(entries);
    return openIdb()
        .then((db) => {
            return new Promise<void>((resolve) => {
                try {
                    const tx = db.transaction(IDB_STORE, "readwrite");
                    const store = tx.objectStore(IDB_STORE);
                    store.put({ id: IDB_KEY, entries, fetchedAt: Date.now(), hash });
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => { db.close(); resolve(); };
                } catch {
                    resolve();
                }
            });
        })
        .catch((e) => { NamespaceLogger.error('cachePrompt', 'Failed to cache prompt', e); });
}

function clearCache(): Promise<void> {
    return openIdb()
        .then((db) => {
            return new Promise<void>((resolve) => {
                try {
                    const tx = db.transaction(IDB_STORE, "readwrite");
                    const store = tx.objectStore(IDB_STORE);
                    store.delete(IDB_KEY);
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => { db.close(); resolve(); };
                } catch {
                    resolve();
                }
            });
        })
        .catch((e) => { NamespaceLogger.error('clearPromptCache', 'Failed to clear prompt cache', e); });
}

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

function normalize(raw: Array<Partial<PromptEntry>>): PromptEntry[] {
    const out: PromptEntry[] = [];
    for (const p of raw) {
        const name = typeof p.name === "string" ? p.name : "";
        const text = typeof p.text === "string" ? p.text : "";
        if (name && text) {
            out.push({
                id: p.id,
                name,
                text,
                category: p.category,
                categories: p.categories,
                version: p.version,
                order: p.order,
                isDefault: p.isDefault,
                isFavorite: p.isFavorite,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt,
            });
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/*  Bridge fetch with retry                                            */
/* ------------------------------------------------------------------ */

const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 1500, 3000];

async function fetchFromBridge(): Promise<PromptEntry[]> {
    for (let i = 0; i < MAX_RETRIES; i++) {
        if (RETRY_DELAYS[i] > 0) {
            await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
        }
        try {
            const resp = await sendMessage<{ prompts?: Array<Partial<PromptEntry>> }>("GET_PROMPTS");
            const entries = normalize(resp?.prompts ?? []);
            if (entries.length > 0) {
                return entries;
            }
        } catch {
            // retry
        }
    }
    return [];
}

/* ------------------------------------------------------------------ */
/*  In-memory state                                                    */
/* ------------------------------------------------------------------ */

let memoryCache: PromptEntry[] | null = null;
let loadingPromise: Promise<PromptEntry[]> | null = null;

/* ------------------------------------------------------------------ */
/*  Default paste XPath                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_PASTE_XPATH = "/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[3]/div/div/div/div";

/* ------------------------------------------------------------------ */
/*  Injection logic                                                    */
/* ------------------------------------------------------------------ */

function findPasteTarget(xpath?: string, selector?: string): HTMLElement | null {
    // Try XPath
    if (xpath) {
        try {
            const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
            if (result.singleNodeValue instanceof HTMLElement) {
                return result.singleNodeValue;
            }
        } catch { /* fallthrough */ }
    }
    // Try selector
    if (selector) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) return el;
    }
    // Fallback selectors
    const fallbacks = [
        "form textarea[placeholder]",
        'div[contenteditable="true"]',
        "textarea.ProseMirror",
        '[data-testid="prompt-input"]',
    ];
    for (const sel of fallbacks) {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
    }
    return null;
}

function injectText(text: string, target: HTMLElement): boolean {
    target.focus();

    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        const input = target as HTMLInputElement;
        const currentVal = input.value || "";
        const newVal = currentVal + (currentVal.length > 0 ? "\n" : "") + text;
        const nativeSetter =
            Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value") ??
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
        if (nativeSetter?.set) {
            nativeSetter.set.call(target, newVal);
        } else {
            input.value = newVal;
        }
        target.dispatchEvent(new Event("input", { bubbles: true }));
        target.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    // Contenteditable
    const sel = window.getSelection();
    if (sel) {
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    const existingText = (target.textContent || "").trim();
    const prefix = existingText.length > 0 ? "\n" : "";
    const fullText = prefix + text;

    const execOk = document.execCommand("insertText", false, fullText);
    if (!execOk) {
        const dt = new DataTransfer();
        dt.setData("text/plain", fullText);
        const pasteEvent = new ClipboardEvent("paste", {
            clipboardData: dt,
            bubbles: true,
            cancelable: true,
        });
        if (!target.dispatchEvent(pasteEvent)) {
            return false;
        }
    }

    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: fullText }));
    return true;
}

/* ------------------------------------------------------------------ */
/*  Core getAll with cache cascade                                     */
/* ------------------------------------------------------------------ */

async function getAllCached(): Promise<PromptEntry[]> {
    // 1. In-memory
    if (memoryCache && memoryCache.length > 0) {
        return memoryCache;
    }

    // Deduplicate concurrent calls
    if (loadingPromise) {
        return loadingPromise;
    }

    loadingPromise = (async () => {
        try {
            // 2. IndexedDB cache
            const cached = await readCache();
            if (cached && cached.entries.length > 0) {
                memoryCache = cached.entries;
                // Background revalidation (fire-and-forget)
                backgroundRevalidate(cached.hash);
                return cached.entries;
            }

            // 3. Extension bridge with retry
            const bridgePrompts = await fetchFromBridge();
            if (bridgePrompts.length > 0) {
                memoryCache = bridgePrompts;
                await writeCache(bridgePrompts);
                return bridgePrompts;
            }

            return [];
        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}

async function backgroundRevalidate(cachedHash: string): Promise<void> {
    try {
        const fresh = await fetchFromBridge();
        if (fresh.length === 0) return;

        const freshHash = computeHash(fresh);
        if (freshHash === cachedHash) return;

        memoryCache = fresh;
        await writeCache(fresh);
    } catch {
        // silent
    }
}

/* ------------------------------------------------------------------ */
/*  Public API factory                                                 */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function createPromptsApi(): PromptsApi {
    return {
        async getAll(): Promise<PromptEntry[]> {
            return getAllCached();
        },

        async save(prompt: SavePromptInput): Promise<PromptEntry> {
            const resp = await sendMessage<{ prompt: PromptEntry }>("SAVE_PROMPT", { prompt });
            // Invalidate caches after mutation
            memoryCache = null;
            await clearCache();
            return resp.prompt;
        },

        async delete(id: string): Promise<void> {
            await sendMessage<void>("DELETE_PROMPT", { id });
            memoryCache = null;
            await clearCache();
        },

        async reorder(ids: string[]): Promise<void> {
            await sendMessage<void>("REORDER_PROMPTS", { ids });
            memoryCache = null;
            await clearCache();
        },

        inject(text: string, options?: { pasteTargetXPath?: string; pasteTargetSelector?: string }): boolean {
            const target = findPasteTarget(
                options?.pasteTargetXPath ?? DEFAULT_PASTE_XPATH,
                options?.pasteTargetSelector,
            );
            if (!target) {
                // Fallback: copy to clipboard
                navigator.clipboard.writeText(text).catch((e) => { NamespaceLogger.error('copyToClipboard', 'Clipboard write failed', e); });
                return false;
            }
            try {
                return injectText(text, target);
            } catch {
                navigator.clipboard.writeText(text).catch((e) => { NamespaceLogger.error('copyToClipboard', 'Clipboard write failed', e); });
                return false;
            }
        },

        async getConfig(): Promise<ResolvedPromptsConfig> {
            const entries = await getAllCached();
            return {
                entries,
                pasteTargetXPath: DEFAULT_PASTE_XPATH,
                pasteTargetSelector: "",
            };
        },

        async invalidateCache(): Promise<void> {
            memoryCache = null;
            await clearCache();
        },

        async preWarm(): Promise<PromptEntry[]> {
            return getAllCached();
        },
    };
}
