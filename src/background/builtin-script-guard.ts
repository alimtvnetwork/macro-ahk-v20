/**
 * Marco Extension — Built-in Script Guard
 *
 * Detects when the active project references scripts that are missing
 * from chrome.storage.local and automatically re-seeds them from the
 * seed-manifest. If the manifest is missing/empty, falls back to
 * per-project instruction.json files in web_accessible_resources.
 *
 * This prevents the "0 injected, 1 skipped" state caused by
 * project/script store drift.
 */

import type { StoredScript } from "../shared/script-config-types";
import type { StoredProject } from "../shared/project-types";
import { STORAGE_KEY_ALL_SCRIPTS } from "../shared/constants";
import { seedFromManifest } from "./manifest-seeder";
import {
    persistInjectionError,
    persistInjectionInfo,
    persistInjectionWarn,
} from "./injection-diagnostics";

/** Known built-in script filenames that must always exist in the store. */
const BUILTIN_SCRIPT_NAMES = new Set([
    "macro-looping.js",
    "marco-sdk.js",
    "xpath.js",
]);

/**
 * Maps built-in script filenames to their extension dist paths.
 * Used for direct instruction.json fallback seeding when
 * seed-manifest.json is missing or empty.
 */
const BUILTIN_DIST_MAP: Record<string, {
    folder: string;
    seedId: string;
    filePath: string;
    loadOrder: number;
    isGlobal: boolean;
    runAt?: "document_start" | "document_idle";
}> = {
    "marco-sdk.js": {
        folder: "marco-sdk",
        seedId: "default-marco-sdk",
        filePath: "projects/scripts/marco-sdk/marco-sdk.js",
        loadOrder: 0,
        isGlobal: true,
        runAt: "document_start",
    },
    "xpath.js": {
        folder: "xpath",
        seedId: "default-xpath-utils",
        filePath: "projects/scripts/xpath/xpath.js",
        loadOrder: 1,
        isGlobal: true,
    },
    "macro-looping.js": {
        folder: "macro-controller",
        seedId: "default-macro-looping",
        filePath: "projects/scripts/macro-controller/macro-looping.js",
        loadOrder: 2,
        isGlobal: false,
        runAt: "document_idle",
    },
};

/** Normalizes a path to its bare filename for matching. */
function bareFilename(path: string): string {
    const normalized = path.trim().toLowerCase().replace(/\\/g, "/");
    return normalized.split("/").pop()?.split(/[?#]/)[0] ?? normalized;
}

/**
 * Checks if any built-in scripts referenced by the given projects are
 * missing from chrome.storage.local. If so, re-runs seedFromManifest()
 * to restore them. If that still fails, falls back to direct
 * instruction.json-based seeding.
 *
 * Returns true if a reseed was performed.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- multi-stage fallback with logging
export async function ensureBuiltinScriptsExist(
    projects: StoredProject[],
): Promise<boolean> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const stored: StoredScript[] = Array.isArray(result[STORAGE_KEY_ALL_SCRIPTS])
        ? result[STORAGE_KEY_ALL_SCRIPTS]
        : [];

    // Build a set of script names present in the store
    const storedNames = new Set(stored.map((s) => bareFilename(s.name)));

    // Collect all built-in script paths referenced by any project
    const missing: string[] = [];
    for (const project of projects) {
        for (const entry of project.scripts) {
            const name = bareFilename(entry.path);
            if (BUILTIN_SCRIPT_NAMES.has(name) && !storedNames.has(name)) {
                missing.push(name);
            }
        }
    }

    if (missing.length === 0) {
        return false;
    }

    void persistInjectionWarn(
        "BUILTIN_GUARD_RESEED_REQUIRED",
        `[builtin-guard] Missing built-in scripts in store: [${missing.join(", ")}] — reseeding from manifest`,
    );

    console.error(
        "[builtin-guard] ⚠ %d built-in script(s) missing from store: [%s] — reseeding from manifest",
        missing.length,
        missing.join(", "),
    );

    // --- Stage 1: Try seed-manifest.json ---
    try {
        const seedResult = await seedFromManifest();
        console.log(
            "[builtin-guard] Manifest reseed result: %d scripts, %d configs across %d projects",
            seedResult.scripts,
            seedResult.configs,
            seedResult.projects,
        );

        if (seedResult.scripts > 0) {
            void persistInjectionInfo(
                "BUILTIN_GUARD_RESEED_COMPLETE",
                `[builtin-guard] Reseed complete via manifest: ${seedResult.scripts} scripts, ${seedResult.configs} configs across ${seedResult.projects} projects`,
            );
            return true;
        }

        // Manifest returned 0 scripts — check if scripts are still missing
        console.error(
            "[builtin-guard] ⚠ seed-manifest.json returned 0 scripts — falling back to direct instruction.json seeding",
        );
        void persistInjectionWarn(
            "BUILTIN_GUARD_MANIFEST_EMPTY",
            `[builtin-guard] seed-manifest.json returned 0 scripts (projects=${seedResult.projects}, errors=${seedResult.errors.length}). Falling back to instruction.json.`,
        );
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[builtin-guard] ❌ Manifest reseed failed:", reason);
        void persistInjectionError(
            "BUILTIN_GUARD_MANIFEST_RESEED_FAILED",
            `[builtin-guard] Manifest reseed failed: ${reason}`,
            { contextDetail: `Missing built-ins: [${missing.join(", ")}]` },
        );
    }

    // --- Stage 2: Direct instruction.json fallback ---
    try {
        const fallbackCount = await seedMissingBuiltinsDirectly(missing);
        if (fallbackCount > 0) {
            console.log(
                "[builtin-guard] ✅ Direct fallback seeded %d built-in script(s)",
                fallbackCount,
            );
            void persistInjectionInfo(
                "BUILTIN_GUARD_DIRECT_SEED_COMPLETE",
                `[builtin-guard] Direct instruction.json fallback seeded ${fallbackCount} script(s): [${missing.join(", ")}]`,
            );
            return true;
        }

        console.error("[builtin-guard] ❌ Direct fallback also seeded 0 scripts");
        await persistInjectionError(
            "BUILTIN_GUARD_DIRECT_SEED_EMPTY",
            `[builtin-guard] Direct instruction.json fallback seeded 0 scripts for: [${missing.join(", ")}]`,
            { contextDetail: "Both manifest and direct fallback failed to restore built-ins" },
        );
        return false;
    } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error("[builtin-guard] ❌ Direct fallback failed:", reason);
        await persistInjectionError(
            "BUILTIN_GUARD_DIRECT_SEED_FAILED",
            `[builtin-guard] Direct instruction.json fallback failed: ${reason}`,
            { contextDetail: `Missing built-ins: [${missing.join(", ")}]` },
        );
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Direct Instruction.json Fallback                                   */
/* ------------------------------------------------------------------ */

const STUB_PREFIX = "// STUB: loaded from instruction.json fallback. Real code fetched at injection time via filePath.\n";

/**
 * Seeds missing built-in scripts directly from their instruction.json
 * files in web_accessible_resources. This bypasses seed-manifest.json
 * entirely and creates minimal StoredScript entries with filePaths
 * so the script-resolver can fetch code at injection time.
 */
// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity -- per-script fetch+validate with fallback paths
async function seedMissingBuiltinsDirectly(
    missingNames: string[],
): Promise<number> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const stored: StoredScript[] = Array.isArray(result[STORAGE_KEY_ALL_SCRIPTS])
        ? result[STORAGE_KEY_ALL_SCRIPTS]
        : [];

    let seeded = 0;
    const now = new Date().toISOString();

    for (const scriptName of missingNames) {
        const meta = BUILTIN_DIST_MAP[scriptName];
        if (!meta) {
            console.error("[builtin-guard:fallback] No dist map entry for %s — skipping", scriptName);
            continue;
        }

        // Check if already present (by seedId or name)
        const existsById = stored.some((s) => s.id === meta.seedId);
        const existsByName = stored.some((s) => bareFilename(s.name) === scriptName);
        if (existsById || existsByName) {
            console.log("[builtin-guard:fallback] %s already in store (by %s) — skipping",
                scriptName, existsById ? "id" : "name");
            continue;
        }

        // Try to fetch instruction.json to get version/description
        let description = `Built-in script: ${scriptName}`;
        let version = "1.0.0";
        const instrRelPath = `projects/scripts/${meta.folder}/instruction.json`;
        const instrAbsUrl = chrome.runtime.getURL(instrRelPath);
        console.log("[builtin-guard:fallback] Fetching instruction.json for %s → %s", scriptName, instrAbsUrl);
        try {
            const instrResp = await fetch(instrAbsUrl);
            if (instrResp.ok) {
                const instr = await instrResp.json();
                description = instr.description || description;
                version = instr.version || version;
                console.log("[builtin-guard:fallback] ✅ Read instruction.json for %s: v%s (from %s)",
                    scriptName, version, instrAbsUrl);
            } else {
                console.error("[builtin-guard:fallback] ❌ instruction.json HTTP %d for %s — URL: %s",
                    instrResp.status, scriptName, instrAbsUrl);
                void persistInjectionWarn(
                    "BUILTIN_GUARD_INSTRUCTION_MISSING",
                    `[builtin-guard:fallback] instruction.json not found for ${scriptName}: HTTP ${instrResp.status} at ${instrAbsUrl}`,
                );
            }
        } catch (fetchErr) {
            console.error("[builtin-guard:fallback] ❌ Failed to fetch instruction.json for %s — URL: %s",
                scriptName, instrAbsUrl, fetchErr);
            void persistInjectionError(
                "BUILTIN_GUARD_INSTRUCTION_FETCH_FAILED",
                `[builtin-guard:fallback] instruction.json fetch failed for ${scriptName}: ${reason}. URL: ${instrAbsUrl}`,
            );
        }

        // Verify the actual script file exists in dist
        let codeStub = STUB_PREFIX + `console.error("[${scriptName}] STUB: filePath fetch failed.");`;
        const scriptAbsUrl = chrome.runtime.getURL(meta.filePath);
        console.log("[builtin-guard:fallback] Fetching script file for %s → %s", scriptName, scriptAbsUrl);
        try {
            const scriptResp = await fetch(scriptAbsUrl);
            if (scriptResp.ok) {
                const code = await scriptResp.text();
                if (code && code.length > 10) {
                    codeStub = code;
                    console.log("[builtin-guard:fallback] ✅ Loaded %s directly (%d chars) from %s",
                        scriptName, code.length, scriptAbsUrl);
                } else {
                    console.error("[builtin-guard:fallback] ⚠ Script file %s returned empty/tiny response (%d chars) from %s",
                        scriptName, code?.length ?? 0, scriptAbsUrl);
                }
            } else {
                console.error("[builtin-guard:fallback] ❌ Script file HTTP %d for %s — URL: %s",
                    scriptResp.status, scriptName, scriptAbsUrl);
                void persistInjectionWarn(
                    "BUILTIN_GUARD_SCRIPT_FILE_MISSING",
                    `[builtin-guard:fallback] Script file not found for ${scriptName}: HTTP ${scriptResp.status} at ${scriptAbsUrl}`,
                );
            }
        } catch (fetchErr) {
            console.error("[builtin-guard:fallback] ❌ Failed to fetch script %s — URL: %s",
                scriptName, scriptAbsUrl, fetchErr);
            void persistInjectionError(
                "BUILTIN_GUARD_SCRIPT_FETCH_FAILED",
                `[builtin-guard:fallback] Script fetch failed for ${scriptName}: ${reason}. URL: ${scriptAbsUrl}`,
            );
        }

        const entry: StoredScript = {
            id: meta.seedId,
            name: scriptName,
            description,
            code: codeStub,
            filePath: meta.filePath,
            isAbsolute: false,
            order: meta.loadOrder,
            isEnabled: true,
            isIife: true,
            autoInject: false,
            isGlobal: meta.isGlobal,
            dependencies: [],
            loadOrder: meta.loadOrder,
            runAt: meta.runAt,
            createdAt: now,
            updatedAt: now,
        };

        stored.push(entry);
        seeded++;
        console.log("[builtin-guard:fallback] Seeded %s (id=%s, filePath=%s)",
            scriptName, meta.seedId, meta.filePath);
    }

    if (seeded > 0) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_SCRIPTS]: stored });
    }

    return seeded;
}