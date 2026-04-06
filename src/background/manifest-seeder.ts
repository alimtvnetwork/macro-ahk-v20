/**
 * Marco Extension — Manifest-Driven Seeder
 *
 * Reads `seed-manifest.json` from extension dist and seeds scripts + configs
 * into chrome.storage.local. Replaces hardcoded seed chunks.
 *
 * The manifest is generated at build time by `scripts/generate-seed-manifest.mjs`.
 */

import type { StoredScript, StoredConfig } from "../shared/script-config-types";
import type {
    SeedManifest,
    SeedProjectEntry,
    SeedScriptEntry,
    SeedConfigEntry,
} from "../shared/seed-manifest-types";
import { STORAGE_KEY_ALL_SCRIPTS, STORAGE_KEY_ALL_CONFIGS } from "../shared/constants";
import { logBgWarnError, logCaughtError } from "./bg-logger";

const MANIFEST_PATH = "projects/seed-manifest.json";

const STUB_PREFIX = "// STUB: loaded from seed-manifest. Real code fetched at injection time via filePath.\n";

function buildStubCode(fileName: string): string {
    return STUB_PREFIX + `console.error("[${fileName}] STUB: filePath fetch failed.");`;
}

/** Supported schema versions: [min, max] inclusive range this seeder can handle. */
const SUPPORTED_SCHEMA_VERSIONS = { min: 1, max: 1 };

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/**
 * Seeds scripts and configs from seed-manifest.json.
 * Idempotent — upserts missing entries, refreshes stale ones.
 *
 * Returns a summary of what was seeded.
 */
// eslint-disable-next-line max-lines-per-function -- orchestrator with schema validation + per-project logging
export async function seedFromManifest(): Promise<SeedResult> {
    console.log("[manifest-seeder] Fetching seed-manifest.json from extension dist...");
    const manifest = await fetchManifest();
    if (!manifest) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, "seed-manifest.json not found or invalid — skipping. " +
            "Ensure the build pipeline runs compile-instruction + generate-seed-manifest.");
        return { scripts: 0, configs: 0, projects: 0, errors: ["seed-manifest.json not found or invalid"] };
    }

    // Schema version validation
    const sv = manifest.schemaVersion;
    if (typeof sv !== "number" || !Number.isFinite(sv)) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `Invalid schemaVersion: ${sv} — aborting seed`);
        return { scripts: 0, configs: 0, projects: 0, errors: [`Invalid schemaVersion: ${sv}`] };
    }
    if (sv > SUPPORTED_SCHEMA_VERSIONS.max) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `schemaVersion ${sv} is newer than supported max (${SUPPORTED_SCHEMA_VERSIONS.max}) — aborting. Update the extension.`);
        return { scripts: 0, configs: 0, projects: 0, errors: [`Unsupported schemaVersion ${sv} (max supported: ${SUPPORTED_SCHEMA_VERSIONS.max})`] };
    }
    if (sv < SUPPORTED_SCHEMA_VERSIONS.min) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `schemaVersion ${sv} is older than min (${SUPPORTED_SCHEMA_VERSIONS.min}) — proceeding with best-effort seeding`);
    }

    const projectNames = manifest.projects.map((p) => `${p.name}(${p.scripts.length}s/${p.configs.length}c)`);
    console.log(
        "[manifest-seeder] Processing %d project(s) from seed-manifest.json (schema v%d): [%s]",
        manifest.projects.length,
        manifest.schemaVersion,
        projectNames.join(", "),
    );

    // Log seedOnInstall status for each project
    for (const project of manifest.projects) {
        console.log(
            "[manifest-seeder]   → %s: seedOnInstall=%s, scripts=%d, configs=%d, isGlobal=%s",
            project.name,
            project.seedOnInstall,
            project.scripts.length,
            project.configs.length,
            project.isGlobal,
        );
    }

    const scriptResult = await seedScriptsFromManifest(manifest);
    const configResult = await seedConfigsFromManifest(manifest);

    console.log(
        "[manifest-seeder] ✅ Seeded %d script(s), %d config(s) across %d project(s). Errors: %d",
        scriptResult.seeded,
        configResult.seeded,
        manifest.projects.length,
        scriptResult.errors.length + configResult.errors.length,
    );

    if (scriptResult.errors.length > 0 || configResult.errors.length > 0) {
        logBgWarnError(BgLogTag.MANIFEST_SEEDER, `Seed errors: ${JSON.stringify([...scriptResult.errors, ...configResult.errors])}`);
    }

    return {
        scripts: scriptResult.seeded,
        configs: configResult.seeded,
        projects: manifest.projects.length,
        errors: [...scriptResult.errors, ...configResult.errors],
    };
}

export interface SeedResult {
    scripts: number;
    configs: number;
    projects: number;
    errors: string[];
}

/* ------------------------------------------------------------------ */
/*  Manifest Fetch                                                     */
/* ------------------------------------------------------------------ */

async function fetchManifest(): Promise<SeedManifest | null> {
    let url: string;
    try {
        url = chrome.runtime.getURL(MANIFEST_PATH);
    } catch (err) {
        logCaughtError(BgLogTag.MANIFEST_SEEDER, `chrome.runtime.getURL() failed for '${MANIFEST_PATH}'`, err);
        return null;
    }
    console.log("[manifest-seeder] Fetching seed-manifest.json — relative: '%s', absolute: %s", MANIFEST_PATH, url);
    try {
        const resp = await fetch(url);
        if (!resp.ok) {
            logBgWarnError(BgLogTag.MANIFEST_SEEDER, `Fetch failed: HTTP ${resp.status} for ${url} — file does not exist in extension dist`);
            return null;
        }
        const raw = await resp.text();
        console.log("[manifest-seeder] Raw response length: %d chars", raw.length);
        const manifest = JSON.parse(raw) as SeedManifest;
        console.log("[manifest-seeder] ✅ Parsed manifest: %d projects, schema v%d, from %s",
            manifest.projects?.length ?? 0, manifest.schemaVersion, url);
        return manifest;
    } catch (err) {
        logCaughtError(BgLogTag.MANIFEST_SEEDER, `Fetch/parse error for ${url}`, err);
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Script Seeding                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- insert/refresh loop with logging
async function seedScriptsFromManifest(
    manifest: SeedManifest,
): Promise<{ seeded: number; errors: string[] }> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const stored: StoredScript[] = Array.isArray(result[STORAGE_KEY_ALL_SCRIPTS])
        ? result[STORAGE_KEY_ALL_SCRIPTS]
        : [];

    console.log("[manifest-seeder:scripts] Store has %d existing script(s)", stored.length);

    let changed = false;
    let seeded = 0;
    const errors: string[] = [];

    for (const project of manifest.projects) {
        if (!project.seedOnInstall) {
            console.log("[manifest-seeder:scripts] Skipping %s (seedOnInstall=false)", project.name);
            continue;
        }

        for (const scriptDef of project.scripts) {
            try {
                const idx = stored.findIndex((s) => s.id === scriptDef.seedId);

                if (idx === -1) {
                    // Insert new
                    console.log("[manifest-seeder:scripts] + INSERT %s (seedId=%s, filePath=%s)",
                        scriptDef.file, scriptDef.seedId, scriptDef.filePath);
                    stored.push(buildStoredScript(scriptDef, project, manifest));
                    changed = true;
                    seeded++;
                } else {
                    // Refresh if stale
                    const current = stored[idx];
                    if (isScriptStale(current, scriptDef, project, manifest)) {
                        console.log("[manifest-seeder:scripts] ↻ REFRESH %s (seedId=%s, was stale)",
                            scriptDef.file, scriptDef.seedId);
                        stored[idx] = refreshStoredScript(current, scriptDef, project, manifest);
                        changed = true;
                        seeded++;
                    } else {
                        console.log("[manifest-seeder:scripts] = SKIP %s (seedId=%s, up-to-date)",
                            scriptDef.file, scriptDef.seedId);
                    }
                }
            } catch (err) {
                const msg = `[seedScriptsFromManifest] Failed to seed script ${scriptDef.file} for ${project.name}: ${err}`;
                errors.push(msg);
                logCaughtError(BgLogTag.MANIFEST_SEEDER, msg, err);
            }
        }
    }

    if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_SCRIPTS]: stored });
    }

    return { seeded, errors };
}

function buildStoredScript(def: SeedScriptEntry, project: SeedProjectEntry, manifest: SeedManifest): StoredScript {
    const now = new Date().toISOString();
    return {
        id: def.seedId,
        name: def.file,
        description: def.description || project.description,
        code: buildStubCode(def.file),
        filePath: def.filePath,
        isAbsolute: false,
        order: def.order,
        isEnabled: true,
        isIife: def.isIife,
        autoInject: def.autoInject,
        isGlobal: project.isGlobal,
        dependencies: resolveDependencyIds(manifest, project),
        loadOrder: project.loadOrder,
        runAt: def.runAt,
        configBinding: resolveConfigSeedId(def.configBinding, project),
        themeBinding: resolveConfigSeedId(def.themeBinding, project),
        cookieBinding: def.cookieBinding,
        createdAt: now,
        updatedAt: now,
    };
}

function refreshStoredScript(
    current: StoredScript,
    def: SeedScriptEntry,
    project: SeedProjectEntry,
    manifest: SeedManifest,
): StoredScript {
    return {
        ...current,
        name: def.file,
        description: def.description || project.description,
        code: buildStubCode(def.file),
        filePath: def.filePath,
        isAbsolute: false,
        isIife: def.isIife,
        autoInject: def.autoInject,
        isGlobal: project.isGlobal,
        isEnabled: current.isEnabled, // preserve user toggle
        dependencies: resolveDependencyIds(manifest, project),
        loadOrder: project.loadOrder,
        configBinding: resolveConfigSeedId(def.configBinding, project),
        themeBinding: resolveConfigSeedId(def.themeBinding, project),
        cookieBinding: def.cookieBinding,
        updatedAt: new Date().toISOString(),
    };
}

function isScriptStale(
    current: StoredScript,
    def: SeedScriptEntry,
    project: SeedProjectEntry,
    manifest: SeedManifest,
): boolean {
    return (
        current.filePath !== def.filePath ||
        !current.code.startsWith(STUB_PREFIX) ||
        current.isGlobal !== project.isGlobal ||
        current.loadOrder !== project.loadOrder ||
        current.isIife !== def.isIife ||
        current.autoInject !== def.autoInject ||
        current.name !== def.file ||
        current.cookieBinding !== def.cookieBinding ||
        current.configBinding !== resolveConfigSeedId(def.configBinding, project) ||
        current.themeBinding !== resolveConfigSeedId(def.themeBinding, project) ||
        JSON.stringify(current.dependencies ?? []) !== JSON.stringify(resolveDependencyIds(manifest, project))
    );
}

/* ------------------------------------------------------------------ */
/*  Config Seeding                                                     */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- config fetch+upsert loop
async function seedConfigsFromManifest(
    manifest: SeedManifest,
): Promise<{ seeded: number; errors: string[] }> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);
    const stored: StoredConfig[] = Array.isArray(result[STORAGE_KEY_ALL_CONFIGS])
        ? result[STORAGE_KEY_ALL_CONFIGS]
        : [];

    let changed = false;
    let seeded = 0;
    const errors: string[] = [];

    for (const project of manifest.projects) {
        if (!project.seedOnInstall) continue;

        for (const configDef of project.configs) {
            try {
                // Fetch the actual JSON content from extension dist
                const configJson = await fetchConfigJson(configDef.filePath);

                const idx = stored.findIndex((c) => c.id === configDef.seedId);

                if (idx === -1) {
                    stored.push(buildStoredConfig(configDef, configJson));
                    changed = true;
                    seeded++;
                } else {
                    const current = stored[idx];
                    if (current.name !== configDef.file || current.json !== configJson) {
                        stored[idx] = {
                            ...current,
                            name: configDef.file,
                            json: configJson,
                            updatedAt: new Date().toISOString(),
                        };
                        changed = true;
                        seeded++;
                    }
                }
            } catch (err) {
                const msg = `[seedConfigsFromManifest→fetchConfigJson] Failed to seed config ${configDef.file} for ${project.name}: ${err}`;
                errors.push(msg);
                logCaughtError(BgLogTag.MANIFEST_SEEDER, msg, err);
            }
        }
    }

    if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_CONFIGS]: stored });
    }

    return { seeded, errors };
}

function buildStoredConfig(def: SeedConfigEntry, json: string): StoredConfig {
    const now = new Date().toISOString();
    return {
        id: def.seedId,
        name: def.file,
        description: def.description,
        json,
        createdAt: now,
        updatedAt: now,
    };
}

async function fetchConfigJson(filePath: string): Promise<string> {
    const url = chrome.runtime.getURL(filePath);
    const resp = await fetch(url);
    if (!resp.ok) {
        throw new Error(`Failed to fetch ${filePath}: ${resp.status}`);
    }
    const data = await resp.json();
    return JSON.stringify(data, null, 2);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Resolves a config key (e.g., "config") to its seedId within the project.
 */
function resolveConfigSeedId(
    key: string | undefined,
    project: SeedProjectEntry,
): string | undefined {
    if (!key) return undefined;
    const config = project.configs.find((c) => c.key === key);
    return config?.seedId;
}

/**
 * Resolves project dependency names to their script seedIds.
 * Convention: dependency project "xpath" → seedId "default-xpath-utils" (from manifest).
 * Falls back to looking up the manifest entry for the dependency name.
 */
function resolveDependencyIds(manifest: SeedManifest, project: SeedProjectEntry): string[] {
    const resolved = new Set<string>();

    for (const dependencyName of project.dependencies) {
        const dependencyProject = manifest.projects.find((entry) => entry.name === dependencyName);

        if (!dependencyProject || dependencyProject.scripts.length === 0) {
            resolved.add(dependencyName);
            continue;
        }

        for (const dependencyScript of dependencyProject.scripts) {
            resolved.add(dependencyScript.seedId);
        }
    }

    return [...resolved];
}
