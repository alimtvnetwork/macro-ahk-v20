/**
 * Marco Extension — Script Resolver
 *
 * Resolves script code and config JSON from chrome.storage.local
 * for injection into tabs. Bridges project model script entries
 * to actual executable code.
 * See spec 12-project-model-and-url-rules.md §Config → Script Injection.
 */

import type { StoredScript, StoredConfig } from "../shared/script-config-types";
import type { InjectableScript, SkipReason } from "../shared/injection-types";
import type { ScriptBindingResolved } from "../shared/types";
import { STORAGE_KEY_ALL_SCRIPTS, STORAGE_KEY_ALL_CONFIGS } from "../shared/constants";

/* ------------------------------------------------------------------ */
/*  File-path code loading                                             */
/* ------------------------------------------------------------------ */

/**
 * Resolves script code from its filePath if available.
 * Falls back to the embedded `code` property.
 */
async function resolveScriptCode(script: StoredScript): Promise<string> {
    if (!script.filePath) return script.code;

    try {
        const url = script.isAbsolute
            ? script.filePath
            : chrome.runtime.getURL(script.filePath);
        const response = await fetch(url);
        if (!response.ok) {
            console.warn("[script-resolver] filePath fetch failed (%s %s), falling back to embedded code",
                response.status, script.filePath);
            return script.code;
        }
        const code = await response.text();
        if (!code || code.length < 10) {
            console.warn("[script-resolver] filePath returned empty/tiny response, using embedded code");
            return script.code;
        }
        return code;
    } catch (err) {
        console.warn("[script-resolver] filePath fetch error for %s: %s",
            script.filePath, err instanceof Error ? err.message : String(err));
        return script.code;
    }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Resolved script with code, optional config JSON, and optional theme JSON. */
export interface ResolvedScript {
    injectable: InjectableScript;
    world: "ISOLATED" | "MAIN";
    configJson: string | null;
    themeJson: string | null;
}

/** A script that was skipped during resolution. */
export interface SkippedScript {
    scriptId: string;
    scriptName: string;
    reason: SkipReason;
}

/** Full resolution result including both resolved and skipped scripts. */
export interface ResolutionResult {
    resolved: ResolvedScript[];
    skipped: SkippedScript[];
}

/** Resolves a list of script bindings to injectable scripts, including dependencies. */
export async function resolveScriptBindings(
    bindings: ScriptBindingResolved[],
): Promise<ResolutionResult> {
    const allScripts = await readScriptStore();
    const allConfigs = await readConfigStore();
    const resolved: ResolvedScript[] = [];
    const skipped: SkippedScript[] = [];

    for (const binding of bindings) {
        const result = await resolveOneBinding(binding, allScripts, allConfigs);

        if (result.kind === "resolved") {
            resolved.push(result.value);
        } else {
            skipped.push(result.value);
        }
    }

    // Auto-resolve dependencies: prepend any required global scripts
    const withDeps = await resolveDependencies(resolved, allScripts, allConfigs);

    return { resolved: withDeps, skipped };
}

/* ------------------------------------------------------------------ */
/*  Dependency Resolution                                              */
/* ------------------------------------------------------------------ */

/**
 * Scans resolved scripts for dependencies, resolves them from the store,
 * deduplicates, and returns a correctly ordered list (globals first).
 */
async function resolveDependencies(
    resolved: ResolvedScript[],
    allScripts: StoredScript[],
    allConfigs: StoredConfig[],
): Promise<ResolvedScript[]> {
    const resolvedIds = new Set(resolved.map((r) => r.injectable.id));
    const depsToAdd: ResolvedScript[] = [];

    for (const entry of resolved) {
        const script = allScripts.find((s) => s.id === entry.injectable.id);
        if (!script?.dependencies?.length) continue;

        for (const depId of script.dependencies) {
            if (resolvedIds.has(depId)) continue;

            const depScript = findScript(allScripts, depId);
            if (!depScript) {
                console.warn("[script-resolver] Dependency not found: %s (required by %s)", depId, script.name);
                continue;
            }
            if (depScript.isEnabled === false) {
                console.warn("[script-resolver] Dependency disabled: %s (required by %s)", depScript.name, script.name);
                continue;
            }

            const themeJson = resolveConfig(depScript.themeBinding ?? null, allConfigs);
            const depCode = await resolveScriptCode(depScript);

            depsToAdd.push({
                injectable: {
                    id: depScript.id,
                    name: depScript.name,
                    code: depCode,
                    order: depScript.loadOrder ?? depScript.order,
                    isIife: depScript.isIife,
                },
                world: "MAIN",
                configJson: null,
                themeJson,
            });
            resolvedIds.add(depId);
        }
    }

    // Combine: dependencies first (sorted by loadOrder), then original scripts
    const all = [...depsToAdd, ...resolved];
    all.sort((a, b) => {
        const aOrder = a.injectable.order;
        const bOrder = b.injectable.order;
        return aOrder - bOrder;
    });

    if (depsToAdd.length > 0) {
        console.log("[script-resolver] Auto-resolved %d dependencies: [%s]",
            depsToAdd.length, depsToAdd.map((d) => d.injectable.name).join(", "));
    }

    return all;
}

/* ------------------------------------------------------------------ */
/*  Resolution Logic                                                   */
/* ------------------------------------------------------------------ */

type ResolveOutcome =
    | { kind: "resolved"; value: ResolvedScript }
    | { kind: "skipped"; value: SkippedScript };

/** Resolves a single binding to a ResolvedScript or a SkippedScript. */
async function resolveOneBinding(
    binding: ScriptBindingResolved,
    scripts: StoredScript[],
    configs: StoredConfig[],
): Promise<ResolveOutcome> {
    const script = findScript(scripts, binding.scriptId);
    const isMissingScript = script === null;

    if (isMissingScript) {
        console.warn("[injection:resolve] ⚠ Script not found: %s (store has %d scripts)", binding.scriptId, scripts.length);
        logMissingScript(binding.scriptId);
        return {
            kind: "skipped",
            value: { scriptId: binding.scriptId, scriptName: binding.scriptId, reason: "missing" },
        };
    }

    const isDisabled = script!.isEnabled === false;

    if (isDisabled) {
        console.log("[injection:resolve] ⏭ Script skipped (disabled): %s", script!.name);
        return {
            kind: "skipped",
            value: { scriptId: script!.id, scriptName: script!.name, reason: "disabled" },
        };
    }

    const configJson = resolveConfig(binding.configId, configs);
    const themeJson = resolveConfig(script!.themeBinding ?? null, configs);
    const code = await resolveScriptCode(script!);

    return {
        kind: "resolved",
        value: {
            injectable: {
                id: script!.id,
                name: script!.name,
                code,
                order: binding.order,
                runAt: binding.runAt,
                configBinding: binding.configId ?? undefined,
                themeBinding: script!.themeBinding,
                isIife: script!.isIife,
            },
            world: binding.world,
            configJson,
            themeJson,
        },
    };
}

/** Finds a script by ID or path in the script store. */
function findScript(
    scripts: StoredScript[],
    scriptId: string,
): StoredScript | null {
    const byId = scripts.find((s) => s.id === scriptId);
    const hasById = byId !== undefined;

    if (hasById) {
        return byId!;
    }

    const byName = scripts.find((s) => s.name === scriptId);
    const hasByName = byName !== undefined;

    if (hasByName) {
        return byName!;
    }

    const normalizedTarget = normalizeScriptKey(scriptId);
    const byNormalizedName = scripts.find(
        (s) => normalizeScriptKey(s.name) === normalizedTarget,
    );

    return byNormalizedName ?? null;
}

/** Normalizes script identifiers for filename-based matching. */
function normalizeScriptKey(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}

/** Resolves config JSON from a configId (matches by id or name). */
function resolveConfig(
    configId: string | null,
    configs: StoredConfig[],
): string | null {
    const isMissingConfigId = configId === null;

    if (isMissingConfigId) {
        return null;
    }

    const config = findConfig(configs, configId!);
    const hasConfig = config !== null;

    return hasConfig ? config!.json : null;
}

/** Finds a config by ID or name in the config store. */
function findConfig(
    configs: StoredConfig[],
    configId: string,
): StoredConfig | null {
    const byId = configs.find((c) => c.id === configId);
    if (byId !== undefined) return byId;

    const byName = configs.find((c) => c.name === configId);
    return byName ?? null;
}

/* ------------------------------------------------------------------ */
/*  Storage Readers                                                    */
/* ------------------------------------------------------------------ */

/** Reads the script store from chrome.storage.local. */
async function readScriptStore(): Promise<StoredScript[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const scripts = result[STORAGE_KEY_ALL_SCRIPTS];
    const hasScripts = Array.isArray(scripts);

    return hasScripts ? scripts : [];
}

/** Reads the config store from chrome.storage.local. */
async function readConfigStore(): Promise<StoredConfig[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);
    const configs = result[STORAGE_KEY_ALL_CONFIGS];
    const hasConfigs = Array.isArray(configs);

    return hasConfigs ? configs : [];
}

/* ------------------------------------------------------------------ */
/*  Logging                                                            */
/* ------------------------------------------------------------------ */

/** Logs a warning for a missing script reference. */
function logMissingScript(scriptId: string): void {
    console.warn(
        `[script-resolver] Script not found in store: ${scriptId}`,
    );
}
