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
import { getCachedScriptCode, cacheScriptCode } from "./injection-cache";
import { persistInjectionWarn } from "./injection-diagnostics";
import { logCaughtError, logBgWarnError, BgLogTag} from "./bg-logger";

/* ------------------------------------------------------------------ */
/*  File-path code loading                                             */
/* ------------------------------------------------------------------ */

/** Source of the resolved script code — used for injection diagnostics. */
export type ScriptCodeSource = "cache" | "fetch" | "embedded";

interface ResolvedCode {
    code: string;
    source: ScriptCodeSource;
}

interface FilePathCandidate {
    path: string;
    isAbsolute: boolean;
}

const BUILTIN_BUNDLED_PATHS: Record<string, string> = {
    "macro-looping.js": "projects/scripts/macro-controller/macro-looping.js",
    "marco-sdk.js": "projects/scripts/marco-sdk/marco-sdk.js",
    "xpath.js": "projects/scripts/xpath/xpath.js",
};

function isBuiltinScript(script: StoredScript): boolean {
    return normalizeScriptKey(script.name) in BUILTIN_BUNDLED_PATHS;
}

/**
 * Resolves script code from its filePath if available.
 * Falls back to the embedded `code` property for non-built-ins only.
 * Built-in scripts MUST come from bundled files so stale storage payloads
 * can never be injected after an update.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- cache-check + multi-candidate fetch with diagnostics
async function resolveScriptCode(script: StoredScript): Promise<ResolvedCode> {
    if (!script.filePath) {
        if (isBuiltinScript(script)) {
            throw new Error(`Built-in script "${script.name}" is missing filePath\n  Path: chrome.storage.local script entry id="${script.id}"\n  Missing: filePath field on StoredScript\n  Reason: Built-in scripts MUST have a filePath pointing to dist/ — refusing embedded fallback to prevent stale code injection`);
        }
        return { code: script.code, source: "embedded" };
    }

    const t0 = performance.now();
    const isMainBundle = script.filePath.includes("macro-looping");
    const isBuiltin = isBuiltinScript(script);

    try {
        const cached = await getCachedScriptCode(script.filePath);
        if (cached) {
            const ms = (performance.now() - t0).toFixed(1);
            if (isMainBundle) {
                console.log("[script-resolver] ⚡ macro-looping.js CACHE HIT — %d chars in %sms", cached.length, ms);
            } else {
                console.log("[script-resolver] ✅ Cache hit for %s (%d chars, %sms)", script.filePath, cached.length, ms);
            }
            return { code: cached, source: "cache" };
        }
    } catch { /* cache miss — proceed to fetch */ }

    const cacheMissMs = (performance.now() - t0).toFixed(1);
    const candidates = buildFilePathCandidates(script);

    for (const candidate of candidates) {
        try {
            const url = candidate.isAbsolute
                ? candidate.path
                : chrome.runtime.getURL(candidate.path);
            const fetchT0 = performance.now();
            const response = await fetch(url);
            if (!response.ok) {
                logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `filePath fetch failed\n  Path: ${candidate.isAbsolute ? candidate.path : "chrome.runtime.getURL(\"" + candidate.path + "\")"}\n  Missing: Script code for "${script.name}" (HTTP ${response.status})\n  Reason: Server returned ${response.status} — file may not exist in web_accessible_resources or dist/`);
                continue;
            }
            const code = await response.text();
            const fetchMs = (performance.now() - fetchT0).toFixed(1);
            const totalMs = (performance.now() - t0).toFixed(1);

            if (!code || code.length < 10) {
                logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `filePath returned empty/tiny response\n  Path: ${candidate.isAbsolute ? candidate.path : "chrome.runtime.getURL(\"" + candidate.path + "\")"}\n  Missing: Valid script code for "${script.name}" (got ${code?.length ?? 0} chars, minimum 10)\n  Reason: Response body is empty or near-empty — file may be a build placeholder`);
                continue;
            }

            if (isMainBundle) {
                console.log("[script-resolver] 🔄 macro-looping.js FRESH FETCH — %d chars, cache-miss: %sms, fetch: %sms, total: %sms",
                    code.length, cacheMissMs, fetchMs, totalMs);
            }

            cacheScriptCode(candidate.path, code).catch(() => {});
            if (candidate.path !== script.filePath) {
                logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `Recovered ${script.filePath} via bundled fallback ${candidate.path}`);
                cacheScriptCode(script.filePath, code).catch(() => {});
            }

            return { code, source: "fetch" };
        } catch (err) {
            logCaughtError(BgLogTag.SCRIPT_RESOLVER, `filePath fetch error\n  Path: ${candidate.isAbsolute ? candidate.path : "chrome.runtime.getURL(\"" + candidate.path + "\")"}\n  Missing: Script code for "${script.name}"\n  Reason: ${err instanceof Error ? err.message : String(err)}`, err);
        }
    }

    if (isBuiltin) {
        const msg = `All bundled fetches failed for built-in script\n  Path: chrome.storage.local script="${script.name}" filePath="${script.filePath}"\n  Missing: Valid script code from any candidate path\n  Reason: All ${candidates.length} fetch candidate(s) returned errors or empty responses — refusing stale embedded fallback`;
        logBgWarnError(BgLogTag.SCRIPT_RESOLVER, msg);
        throw new Error(msg);
    }

    logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `All filePath fetches failed for ${script.filePath}, falling back to embedded code`);
    return { code: script.code, source: "embedded" };
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
    /** Where the script code came from — for injection diagnostics. */
    codeSource: ScriptCodeSource;
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
    const { scripts: allScripts, configs: allConfigs } = await readStoresParallel();
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
// eslint-disable-next-line max-lines-per-function
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
                logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `Dependency not found\n  Path: chrome.storage.local["${STORAGE_KEY_ALL_SCRIPTS}"]\n  Missing: Script with id="${depId}" (required by "${script.name}")\n  Reason: Dependency declared in script.dependencies but no matching script exists in storage`);
                continue;
            }
            if (depScript.isEnabled === false) {
                logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `Dependency disabled\n  Path: chrome.storage.local script id="${depScript.id}" name="${depScript.name}"\n  Missing: Enabled dependency (isEnabled=false)\n  Reason: Script "${depScript.name}" is required by "${script.name}" but is currently disabled`);
                continue;
            }

            const themeJson = resolveConfig(depScript.themeBinding ?? null, allConfigs);
            const { code: depCode, source: depSource } = await resolveScriptCode(depScript);

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
                codeSource: depSource,
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
// eslint-disable-next-line max-lines-per-function
async function resolveOneBinding(
    binding: ScriptBindingResolved,
    scripts: StoredScript[],
    configs: StoredConfig[],
): Promise<ResolveOutcome> {
    const script = findScript(scripts, binding.scriptId);
    const isMissingScript = script === null;

    if (isMissingScript) {
        logBgWarnError(BgLogTag.INJECTION_RESOLVE, `Script not found in store\n  Path: chrome.storage.local["${STORAGE_KEY_ALL_SCRIPTS}"] → lookup by id/name="${binding.scriptId}"\n  Missing: StoredScript matching "${binding.scriptId}" (store has ${scripts.length} scripts)\n  Reason: Script ID from project config does not match any script entry by id, name, or normalized filename`);
        logMissingScript(binding.scriptId);
        void persistInjectionWarn(
            "SCRIPT_SKIPPED_MISSING",
            `[injection:resolve] Script not found in store: ${binding.scriptId} (store has ${scripts.length} scripts)`,
            { scriptId: binding.scriptId },
        );
        return {
            kind: "skipped",
            value: { scriptId: binding.scriptId, scriptName: binding.scriptId, reason: "missing" },
        };
    }

    const isDisabled = script!.isEnabled === false;

    if (isDisabled) {
        console.log("[injection:resolve] ⏭ Script skipped (disabled): %s", script!.name);
        void persistInjectionWarn(
            "SCRIPT_SKIPPED_DISABLED",
            `[injection:resolve] Script skipped (disabled): ${script!.name} (id=${script!.id})`,
            { scriptId: script!.id, configId: binding.configId ?? undefined },
        );
        return {
            kind: "skipped",
            value: { scriptId: script!.id, scriptName: script!.name, reason: "disabled" },
        };
    }

    const configJson = resolveConfig(binding.configId, configs);
    const themeJson = resolveConfig(script!.themeBinding ?? null, configs);

    let code: string;
    let codeSource: ScriptCodeSource;
    try {
        const resolvedCode = await resolveScriptCode(script!);
        code = resolvedCode.code;
        codeSource = resolvedCode.source;
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        logBgWarnError(BgLogTag.INJECTION_RESOLVE, `Script '${script!.name}' (id=${script!.id}) failed to resolve: ${reason}`);
        void persistInjectionWarn(
            "SCRIPT_SKIPPED_RESOLVE_FAILED",
            `[injection:resolve] Script '${script!.name}' (id=${script!.id}) failed to resolve and was skipped: ${reason}`,
            { scriptId: script!.id, configId: binding.configId ?? undefined },
        );
        return {
            kind: "skipped",
            value: { scriptId: script!.id, scriptName: script!.name, reason: "empty_code" as SkipReason },
        };
    }

    if (!code || code.trim().length === 0) {
        logBgWarnError(BgLogTag.INJECTION_RESOLVE, `Script '${script!.name}' (id=${script!.id}) resolved with EMPTY code — skipping. filePath=${script!.filePath ?? "(none)"}, source=${codeSource}`);
        void persistInjectionWarn(
            "SCRIPT_SKIPPED_EMPTY_CODE",
            `[injection:resolve] Script '${script!.name}' (id=${script!.id}) resolved with empty code and was skipped. filePath=${script!.filePath ?? "(none)"}, source=${codeSource}`,
            { scriptId: script!.id, configId: binding.configId ?? undefined },
        );
        return {
            kind: "skipped",
            value: { scriptId: script!.id, scriptName: script!.name, reason: "empty_code" as SkipReason },
        };
    }

    console.log("[script-resolver] %s → %s (%d chars, source: %s)",
        script!.name, script!.filePath ?? "(inline)", code.length, codeSource);

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
            codeSource,
        },
    };
}

/** Finds a script by ID or path in the script store. */
function findScript(
    scripts: StoredScript[],
    scriptId: string,
): StoredScript | null {
    const normalizedTarget = normalizeScriptKey(scriptId);
    const isPathLike = isPathLikeIdentifier(scriptId);

    // Path-like identifiers (e.g. "macro-looping.js") should prefer filename matches,
    // then pick the best candidate (filePath-backed/default) to avoid stale inline scripts.
    if (isPathLike) {
        const byNormalizedName = scripts.filter(
            (s) => normalizeScriptKey(s.name) === normalizedTarget,
        );

        if (byNormalizedName.length > 0) {
            return pickBestScriptCandidate(byNormalizedName);
        }
    }

    // ID-based lookup (default path for dependency IDs, e.g. default-xpath-utils)
    const byId = scripts.find((s) => s.id === scriptId);
    if (byId !== undefined) return byId;

    // Exact name fallback
    const byName = scripts.find((s) => s.name === scriptId);
    if (byName !== undefined) return byName;

    // Normalized filename fallback
    const byNormalizedName = scripts.filter(
        (s) => normalizeScriptKey(s.name) === normalizedTarget,
    );

    return byNormalizedName.length > 0
        ? pickBestScriptCandidate(byNormalizedName)
        : null;
}

/** Normalizes script identifiers for filename-based matching. */
function normalizeScriptKey(value: string): string {
    const normalized = value.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}

/** Returns true when identifier looks like a script path/filename. */
function isPathLikeIdentifier(value: string): boolean {
    const v = value.trim().toLowerCase();
    return v.includes("/") || v.includes("\\") || v.endsWith(".js") || v.endsWith(".mjs") || v.endsWith(".ts");
}

function buildFilePathCandidates(script: StoredScript): FilePathCandidate[] {
    const primaryPath = script.filePath?.trim() ?? "";
    const candidates: FilePathCandidate[] = [];

    if (primaryPath.length > 0) {
        candidates.push({
            path: primaryPath,
            isAbsolute: script.isAbsolute === true,
        });
    }

    const bundledFallback = BUILTIN_BUNDLED_PATHS[normalizeScriptKey(script.name)];
    if (
        typeof bundledFallback === "string"
        && bundledFallback.length > 0
        && bundledFallback !== primaryPath
    ) {
        candidates.push({
            path: bundledFallback,
            isAbsolute: false,
        });
    }

    return candidates;
}

/** Picks the most reliable candidate when multiple scripts share the same name. */
function pickBestScriptCandidate(candidates: StoredScript[]): StoredScript {
    // Prefer runtime filePath-backed scripts (dist/web_accessible_resources source of truth)
    const fileBacked = candidates.find((s) => typeof s.filePath === "string" && s.filePath.length > 0);
    if (fileBacked) return fileBacked;

    // Then prefer seeded defaults
    const defaultSeed = candidates.find((s) => s.id.startsWith("default-"));
    if (defaultSeed) return defaultSeed;

    // Fallback: first candidate
    return candidates[0];
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

/** Batched read of script + config stores in a single IPC call (~50-100ms saved). */
async function readStoresParallel(): Promise<{ scripts: StoredScript[]; configs: StoredConfig[] }> {
    const result = await chrome.storage.local.get([STORAGE_KEY_ALL_SCRIPTS, STORAGE_KEY_ALL_CONFIGS]);
    const scripts = result[STORAGE_KEY_ALL_SCRIPTS];
    const configs = result[STORAGE_KEY_ALL_CONFIGS];

    return {
        scripts: Array.isArray(scripts) ? scripts : [],
        configs: Array.isArray(configs) ? configs : [],
    };
}

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
    logBgWarnError(BgLogTag.SCRIPT_RESOLVER, `Script not found in store: ${scriptId}`);
}
