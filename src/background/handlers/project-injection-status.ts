/**
 * Marco Extension — Project Injection Status
 *
 * Builds popup-facing per-script status for the active tab
 * from background transient injection records.
 *
 * @see spec/05-chrome-extension/12-project-model-and-url-rules.md — Project model & URL matching
 * @see spec/12-devtools-and-injection/per-project-architecture.md — Per-project injection
 */

import type { StoredProject, ScriptEntry } from "../../shared/project-types";
import type { StoredScript } from "../../shared/script-config-types";
import { STORAGE_KEY_ALL_SCRIPTS } from "../../shared/constants";
import { getTabInjections } from "../state-manager";

type InjectionStatus = Record<string, { status: string }>;

/** Builds per-script injection status for popup rendering. */
export async function buildInjectedScriptStatus(
    project: StoredProject | null,
): Promise<InjectionStatus> {
    const hasProject = project !== null;

    if (!hasProject) {
        return {};
    }

    const activeTabId = await readActiveTabId();
    const hasActiveTab = activeTabId !== null;

    if (!hasActiveTab) {
        return buildNotLoadedStatus(project!.scripts);
    }

    const record = getTabInjections()[activeTabId!];
    const hasRecord = record !== undefined;

    if (!hasRecord) {
        return buildNotLoadedStatus(project!.scripts);
    }

    const injectedIds = new Set(record.scriptIds);
    const storedScripts = await readStoredScripts();

    return mapScriptStatus(project!.scripts, storedScripts, injectedIds);
}

/** Reads the currently active tab ID. */
async function readActiveTabId(): Promise<number | null> {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    const hasTabId = tabId !== undefined;

    return hasTabId ? tabId! : null;
}

/** Reads all stored scripts from local storage. */
async function readStoredScripts(): Promise<StoredScript[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const scripts = result[STORAGE_KEY_ALL_SCRIPTS];
    const hasScripts = Array.isArray(scripts);

    return hasScripts ? scripts : [];
}

/** Returns a default map where all project scripts are not loaded. */
function buildNotLoadedStatus(entries: ScriptEntry[]): InjectionStatus {
    const status: InjectionStatus = {};

    for (const script of entries) {
        status[script.path] = { status: "not loaded" };
    }

    return status;
}

/** Maps project scripts to injected/not loaded based on tab injection IDs. */
function mapScriptStatus(
    entries: ScriptEntry[],
    storedScripts: StoredScript[],
    injectedIds: Set<string>,
): InjectionStatus {
    const status = buildNotLoadedStatus(entries);

    for (const script of entries) {
        const aliases = resolveScriptAliases(script.path, storedScripts);
        const isInjected = aliases.some((alias) => injectedIds.has(alias));

        if (isInjected) {
            status[script.path] = { status: "injected" };
        }
    }

    return status;
}

/** Resolves comparable aliases for a project script path. */
function resolveScriptAliases(
    scriptPath: string,
    storedScripts: StoredScript[],
): string[] {
    const normalizedPath = normalizeScriptKey(scriptPath);
    const matched = storedScripts.find((script) => {
        if (script.name === scriptPath) {
            return true;
        }

        return normalizeScriptKey(script.name) === normalizedPath;
    });

    const aliases = [scriptPath];
    const hasMatched = matched !== undefined;

    if (hasMatched) {
        aliases.push(matched!.id, matched!.name);
    }

    return aliases;
}

/** Normalizes script identifiers for filename-based matching. */
function normalizeScriptKey(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}
