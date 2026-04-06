/**
 * Marco Extension — Script & Config Handler
 *
 * Handles script and config CRUD with chrome.storage.local.
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import type { StoredScript, StoredConfig } from "../../shared/script-config-types";

const STORAGE_KEY_SCRIPTS = "marco_scripts";
const STORAGE_KEY_CONFIGS = "marco_configs";

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Reads all scripts from chrome.storage.local. */
async function readAllScripts(): Promise<StoredScript[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_SCRIPTS);
    const scripts = result[STORAGE_KEY_SCRIPTS];
    const hasScripts = Array.isArray(scripts);

    return hasScripts ? scripts : [];
}

/** Persists the full script list to chrome.storage.local. */
async function writeAllScripts(
    scripts: StoredScript[],
): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_SCRIPTS]: scripts });
}

/** Reads all configs from chrome.storage.local. */
async function readAllConfigs(): Promise<StoredConfig[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_CONFIGS);
    const configs = result[STORAGE_KEY_CONFIGS];
    const hasConfigs = Array.isArray(configs);

    return hasConfigs ? configs : [];
}

/** Persists the full config list to chrome.storage.local. */
async function writeAllConfigs(
    configs: StoredConfig[],
): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEY_CONFIGS]: configs });
}

/** Returns an ISO timestamp string. */
function nowTimestamp(): string {
    return new Date().toISOString();
}

/** Finds a script by ID first, then by normalized path/name fallback. */
function findScriptByIdOrPath(
    scripts: StoredScript[],
    idOrPath: string,
): StoredScript | undefined {
    const byId = scripts.find((script) => script.id === idOrPath);

    if (byId !== undefined) {
        return byId;
    }

    const normalizedTarget = normalizeScriptKey(idOrPath);

    return scripts.find((script) => {
        if (script.name === idOrPath) {
            return true;
        }

        return normalizeScriptKey(script.name) === normalizedTarget;
    });
}

/** Normalizes script identifiers for filename-based lookup. */
function normalizeScriptKey(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}

/* ------------------------------------------------------------------ */
/*  Script handlers                                                    */
/* ------------------------------------------------------------------ */

/** Returns all stored scripts. */
export async function handleGetAllScripts(): Promise<{
    scripts: StoredScript[];
}> {
    const scripts = await readAllScripts();
    return { scripts };
}

/** Saves a script (create or update). */
export async function handleSaveScript(
    message: MessageRequest,
): Promise<OkResponse & { script: StoredScript }> {
    const { script } = message as { script: StoredScript };
    const scripts = await readAllScripts();

    const saved = upsertScript(scripts, script);

    await writeAllScripts(scripts);
    return { isOk: true, script: saved };
}

/** Inserts or replaces a script in the list. */
function upsertScript(
    scripts: StoredScript[],
    script: StoredScript,
): StoredScript {
    const now = nowTimestamp();
    const existingIndex = scripts.findIndex((s) => s.id === script.id);
    const isExisting = existingIndex >= 0;

    if (isExisting) {
        const updated = { ...script, updatedAt: now };
        scripts[existingIndex] = updated;
        return updated;
    }

    const created: StoredScript = {
        ...script,
        id: script.id || crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };

    scripts.push(created);
    return created;
}

/** Deletes a script by ID. */
export async function handleDeleteScript(
    message: MessageRequest,
): Promise<OkResponse> {
    const { id } = message as { id: string };
    const scripts = await readAllScripts();
    const filtered = scripts.filter((s) => s.id !== id);

    await writeAllScripts(filtered);
    return { isOk: true };
}

/** Toggles the isEnabled flag for a script by ID or script path/name. */
export async function handleToggleScript(
    message: MessageRequest,
): Promise<OkResponse> {
    const { id } = message as { id: string };
    const scripts = await readAllScripts();
    const target = findScriptByIdOrPath(scripts, id);
    const hasTarget = target !== undefined;

    if (hasTarget) {
        target.isEnabled = !target.isEnabled;
        target.updatedAt = nowTimestamp();
        await writeAllScripts(scripts);
    }

    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Config handlers                                                    */
/* ------------------------------------------------------------------ */

/** Returns all stored configs. */
export async function handleGetAllConfigs(): Promise<{
    configs: StoredConfig[];
}> {
    const configs = await readAllConfigs();
    return { configs };
}

/** Saves a config (create or update). */
export async function handleSaveConfig(
    message: MessageRequest,
): Promise<OkResponse & { config: StoredConfig }> {
    const { config } = message as { config: StoredConfig };
    const configs = await readAllConfigs();

    const saved = upsertConfig(configs, config);

    await writeAllConfigs(configs);
    return { isOk: true, config: saved };
}

/** Inserts or replaces a config in the list. */
function upsertConfig(
    configs: StoredConfig[],
    config: StoredConfig,
): StoredConfig {
    const now = nowTimestamp();
    const existingIndex = configs.findIndex((c) => c.id === config.id);
    const isExisting = existingIndex >= 0;

    if (isExisting) {
        const updated = { ...config, updatedAt: now };
        configs[existingIndex] = updated;
        return updated;
    }

    const created: StoredConfig = {
        ...config,
        id: config.id || crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
    };

    configs.push(created);
    return created;
}

/** Deletes a config by ID. */
export async function handleDeleteConfig(
    message: MessageRequest,
): Promise<OkResponse> {
    const { id } = message as { id: string };
    const configs = await readAllConfigs();
    const filtered = configs.filter((c) => c.id !== id);

    await writeAllConfigs(filtered);
    return { isOk: true };
}

/** Resolves the config JSON for a given script. */
export async function handleGetScriptConfig(
    message: MessageRequest,
): Promise<{ config: StoredConfig | null }> {
    const { scriptId } = message as { scriptId: string };
    const scripts = await readAllScripts();
    const script = scripts.find((s) => s.id === scriptId);
    const hasBinding = script?.configBinding !== undefined;

    if (hasBinding) {
        return findBoundConfig(script?.configBinding);
    }

    return { config: null };
}

/** Finds a config by its binding ID. */
async function findBoundConfig(
    bindingId: string | undefined,
): Promise<{ config: StoredConfig | null }> {
    const configs = await readAllConfigs();
    const bound = configs.find((c) => c.id === bindingId) ?? null;

    return { config: bound };
}
