/**
 * Marco Extension — Settings Handler
 *
 * Handles GET_SETTINGS and SAVE_SETTINGS messages.
 * Persists to chrome.storage.local under "marco_extension_settings".
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import { DEFAULT_CHATBOX_XPATH } from "../../shared/defaults";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "marco_extension_settings";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ExtensionSettings {
    autoRunOnPageLoad: boolean;
    showNotifications: boolean;
    defaultRunAt: "document_start" | "document_idle" | "document_end";
    debugMode: boolean;
    maxCycleCount: number;
    idleTimeout: number;
    theme: "system" | "light" | "dark";
    chatBoxXPath: string;
    /** When true, skips chrome.userScripts and forces Blob URL injection for debugging. */
    forceLegacyInjection: boolean;
    /** HTTP proxy port for REST API access (default 19280). */
    broadcastPort: number;
    /** Log retention in days before auto-purge (0 = keep forever). */
    logRetentionDays: number;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
    autoRunOnPageLoad: true,
    showNotifications: true,
    defaultRunAt: "document_idle",
    debugMode: false,
    maxCycleCount: 100,
    idleTimeout: 5000,
    theme: "system",
    chatBoxXPath: DEFAULT_CHATBOX_XPATH,
    forceLegacyInjection: false,
    broadcastPort: 19280,
    logRetentionDays: 30,
};

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

/** Returns current settings, merged with defaults. */
export async function handleGetSettings(): Promise<{ settings: ExtensionSettings }> {
    const stored = await loadSettings();
    return { settings: { ...DEFAULT_SETTINGS, ...stored } };
}

/** Saves settings to chrome.storage.local. */
export async function handleSaveSettings(
    message: MessageRequest,
): Promise<OkResponse> {
    const msg = message as MessageRequest & { settings: Partial<ExtensionSettings> };
    const current = await loadSettings();
    const merged = { ...DEFAULT_SETTINGS, ...current, ...msg.settings };
    await saveSettings(merged);
    return { isOk: true };
}

/**
 * Returns the chatBoxXPath for prompt injection.
 * Priority: active project setting → global setting → default.
 */
export async function getChatBoxXPath(): Promise<string> {
    // Check active project first
    try {
        const projResult = await chrome.storage.local.get(["marco_active_project", "marco_all_projects"]);
        const activeId = projResult.marco_active_project as string | undefined;
        const projects = (projResult.marco_all_projects ?? []) as Array<{ id: string; settings?: { chatBoxXPath?: string } }>;
        if (activeId) {
            const proj = projects.find((p) => p.id === activeId);
            if (proj?.settings?.chatBoxXPath) {
                return proj.settings.chatBoxXPath;
            }
        }
    } catch { /* fall through to global */ }
    const stored = await loadSettings();
    return stored.chatBoxXPath ?? DEFAULT_SETTINGS.chatBoxXPath;
}

/* ------------------------------------------------------------------ */
/*  Prompt Template Variables                                          */
/* ------------------------------------------------------------------ */

const VARIABLES_KEY = "marco_prompt_variables";

/** Built-in variables that are always available (computed at runtime). */
function getBuiltInVariables(): Record<string, string> {
    const now = new Date();
    return {
        date: now.toISOString().split("T")[0],
        time: now.toTimeString().split(" ")[0],
        datetime: now.toISOString(),
        timestamp: String(now.getTime()),
        year: String(now.getFullYear()),
        month: String(now.getMonth() + 1).padStart(2, "0"),
        day: String(now.getDate()).padStart(2, "0"),
    };
}

/** Returns all prompt variables (built-in + custom). Custom overrides built-in. */
export async function handleGetPromptVariables(): Promise<{ variables: Record<string, string>; builtIn: string[] }> {
    const custom = await loadPromptVariables();
    const builtIn = getBuiltInVariables();
    return {
        variables: { ...builtIn, ...custom },
        builtIn: Object.keys(builtIn),
    };
}

/** Saves custom prompt variables. */
export async function handleSavePromptVariables(
    message: MessageRequest,
): Promise<OkResponse> {
    const msg = message as MessageRequest & { variables: Record<string, string> };
    await chrome.storage.local.set({ [VARIABLES_KEY]: msg.variables });
    return { isOk: true };
}

/**
 * Replaces all `{{key}}` placeholders in text with variable values.
 * Custom variables override built-in ones.
 */
export async function applyTemplateVariables(text: string): Promise<string> {
    if (!text.includes("{{")) return text;
    const custom = await loadPromptVariables();
    const builtIn = getBuiltInVariables();
    const merged = { ...builtIn, ...custom };
    return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
        return merged[key] ?? match;
    });
}

async function loadPromptVariables(): Promise<Record<string, string>> {
    try {
        const result = await chrome.storage.local.get(VARIABLES_KEY);
        return (result[VARIABLES_KEY] as Record<string, string>) ?? {};
    } catch {
        return {};
    }
}

/* ------------------------------------------------------------------ */
/*  Storage Helpers                                                    */
/* ------------------------------------------------------------------ */

async function loadSettings(): Promise<Partial<ExtensionSettings>> {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return (result[STORAGE_KEY] as Partial<ExtensionSettings>) ?? {};
    } catch {
        return {};
    }
}

async function saveSettings(settings: ExtensionSettings): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}
