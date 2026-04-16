/**
 * Marco Extension — Default Project Seeder
 *
 * Seeds and normalizes the "Macro Controller" default project,
 * the "Riseup Macro SDK" global shared project, and the SDK's
 * UpdaterInfo entry for the updater system.
 *
 * See: spec/05-chrome-extension/58-updater-system.md
 */

/* eslint-disable sonarjs/no-duplicate-string -- seeder data repeats URL and field values */

import type { StoredProject, CookieBinding, ScriptEntry, ConfigEntry } from "../shared/project-types";
import { DEFAULT_CHATBOX_XPATH } from "../shared/defaults";
import {
    DEFAULT_PROJECT_ID,
    SDK_PROJECT_ID,
    STORAGE_KEY_FIRST_RUN,
    EXTENSION_VERSION,
} from "../shared/constants";
import { readAllProjects, writeAllProjects } from "./handlers/project-helpers";
import { nowTimestamp } from "../shared/utils";
import { seedFromManifest } from "./manifest-seeder";
import { bootReady } from "./boot";
import {
    handleListUpdaters,
    handleCreateUpdater,
    linkUpdaterToCategory,
} from "./handlers/updater-handler";
import { logCaughtError, BgLogTag} from "./bg-logger";

const DEFAULT_LOOPING_SCRIPT_PATH = "macro-looping.js";
const DEFAULT_LOOPING_CONFIG_PATH = "macro-looping-config.json";

const LEGACY_SCRIPT_PATHS = new Set(["macro-controller.js", "combo-switch.js"]);
const LEGACY_CONFIG_PATHS = new Set(["macro-controller-config.json", "combo-config.json"]);

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Registers the onInstalled listener to seed defaults. */
export function registerInstallListener(): void {
    chrome.runtime.onInstalled.addListener(handleInstalled);
}

/** Ensures the default project and SDK project exist. */
export async function ensureDefaultProjectSingleScript(): Promise<void> {
    const projects = await readAllProjects();
    let changed = false;

    // Ensure SDK project
    const sdkIndex = projects.findIndex((p) => p.id === SDK_PROJECT_ID);
    if (sdkIndex === -1) {
        projects.unshift(buildSdkProject());
        changed = true;
    } else {
        const currentSdk = projects[sdkIndex];
        const normalizedSdk = normalizeSdkProject(currentSdk);
        if (!isProjectEquivalent(currentSdk, normalizedSdk)) {
            projects[sdkIndex] = normalizedSdk;
            changed = true;
        }
    }

    // Ensure default project
    const index = projects.findIndex((project) => project.id === DEFAULT_PROJECT_ID);

    if (index === -1) {
        projects.push(buildDefaultProject());
        changed = true;
    } else {
        const current = projects[index];
        const normalized = normalizeDefaultProject(current);

        if (!isProjectEquivalent(current, normalized)) {
            projects[index] = normalized;
            changed = true;
        }
    }

    if (changed) {
        await writeAllProjects(projects);
    }
}

/* ------------------------------------------------------------------ */
/*  Install Handler                                                    */
/* ------------------------------------------------------------------ */

/** Handles extension install/update events. */
async function handleInstalled(
    details: chrome.runtime.InstalledDetails,
): Promise<void> {
    // Wait for boot to bind DbManager before accessing any handler
    await bootReady;
    // ✅ 88.3: Invalidate IndexedDB cache on install/update
    try {
        const { invalidateCacheOnDeploy } = await import("./injection-cache");
        await invalidateCacheOnDeploy(details.reason);
    } catch (err) {
        logCaughtError(BgLogTag.SEEDER, "Cache invalidation failed", err);
    }

    // ✅ Manifest-driven seeder (reads seed-manifest.json from dist)
    try {
        const manifestResult = await seedFromManifest();
        console.log(
            "[seeder] Manifest seeder: %d scripts, %d configs across %d projects",
            manifestResult.scripts, manifestResult.configs, manifestResult.projects,
        );
    } catch (err) {
        logCaughtError(BgLogTag.SEEDER, "Manifest seeder failed (non-fatal)", err);
    }

    await ensureDefaultProjectSingleScript();
    ensureSdkUpdaterEntry();

    // ✅ Pre-warm IndexedDB cache so scripts are ready for instant injection
    try {
        const { warmScriptCache } = await import("./cache-warmer");
        const result = await warmScriptCache();
        console.log("[seeder] Cache warm complete: %d warmed, %d failed", result.warmed, result.failed);
    } catch (err) {
        logCaughtError(BgLogTag.SEEDER, "Cache warming failed (non-fatal)", err);
    }

    if (details.reason === "install") {
        await markFirstRun();
        console.log("[seeder] Default project/scripts/updater seeded (single-script architecture)");
        return;
    }

    console.log("[seeder] Default project/scripts/updater normalized after update");
}

/* ------------------------------------------------------------------ */
/*  SDK Updater Entry                                                  */
/* ------------------------------------------------------------------ */

const SDK_UPDATER_NAME = "Riseup Macro SDK";

/**
 * Ensures the Riseup Macro SDK has an UpdaterInfo entry.
 * Idempotent — skips if an entry with the same name already exists.
 */
function ensureSdkUpdaterEntry(): void {
    try {
        const existing = handleListUpdaters();
        if (existing.some((u) => u.Name === SDK_UPDATER_NAME)) return;

        const updaterId = handleCreateUpdater({
            name: SDK_UPDATER_NAME,
            scriptUrl: "https://cdn.example.com/marco-sdk/latest/marco-sdk.iife.js",
            versionInfoUrl: "https://cdn.example.com/marco-sdk/version.json",
            isGit: false,
            isRedirectable: true,
            maxRedirectDepth: 2,
            hasChangelogFromVersionInfo: true,
            hasUserConfirmBeforeUpdate: false,
            autoCheckIntervalMinutes: 1440,
            cacheExpiryMinutes: 10080,
        });

        linkUpdaterToCategory(updaterId, "Script");
        linkUpdaterToCategory(updaterId, "Core");

        console.log("[seeder] Seeded Riseup Macro SDK updater entry (id=%d)", updaterId);
    } catch (err) {
        logCaughtError(BgLogTag.SEEDER, "Failed to seed SDK updater entry", err);
    }
}

/* ------------------------------------------------------------------ */
/*  Seeding Logic                                                      */
/* ------------------------------------------------------------------ */

/** Builds the Riseup Macro SDK global project. See spec/12-devtools-and-injection/sdk-convention.md */
function buildSdkProject(): StoredProject {
    const now = nowTimestamp();
    return {
        id: SDK_PROJECT_ID,
        schemaVersion: 1,
        name: "Riseup Macro SDK",
        version: "1.0.0",
        description: "Core SDK providing marco.* namespace for all macro projects",
        targetUrls: [
            { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            { pattern: "https://*.lovable.app/*", matchType: "glob" },
            { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
        ],
        scripts: [{
            path: "marco-sdk.js",
            order: -1, // Always first
            runAt: "document_start",
            description: "Riseup Macro SDK — provides window.marco namespace",
        }],
        configs: [],
        cookies: buildSdkCookieBindings(),
        settings: {
            onlyRunAsDependency: true,
        },
        dependencies: [],
        isGlobal: true,
        isRemovable: false,
        createdAt: now,
        updatedAt: now,
    };
}

/** Returns the platform session cookie bindings for the SDK project (authoritative source). */
function buildSdkCookieBindings(): CookieBinding[] {
    return [
        {
            cookieName: "lovable-session-id.id",
            url: "https://lovable.dev",
            role: "session",
            description: "Primary session cookie — JWT bearer token for API auth",
        },
        {
            cookieName: "lovable-session-id.refresh",
            url: "https://lovable.dev",
            role: "refresh",
            description: "Refresh token cookie — used to obtain a new session",
        },
        {
            cookieName: "__Secure-lovable-session-id.id",
            url: "https://lovable.dev",
            role: "session",
            description: "Secure-prefixed session cookie alias",
        },
        {
            cookieName: "__Host-lovable-session-id.id",
            url: "https://lovable.dev",
            role: "session",
            description: "Host-prefixed session cookie alias",
        },
    ];
}

/** Builds the default Macro Controller project. */
function buildDefaultProject(): StoredProject {
    const now = nowTimestamp();

    return {
        id: DEFAULT_PROJECT_ID,
        schemaVersion: 1,
        name: "Macro Controller",
        version: EXTENSION_VERSION,
        description: "Built-in MacroLoop controller for workspace and credit management",
        targetUrls: buildDefaultUrlRules(),
        scripts: [buildDefaultLoopingScriptEntry()],
        configs: [buildDefaultLoopingConfigEntry()],
        cookies: buildDefaultCookieBindings(),
        settings: buildDefaultSettings(),
        dependencies: [{ projectId: SDK_PROJECT_ID, version: "^1.0.0" }],
        createdAt: now,
        updatedAt: now,
    };
}

/** Returns the default URL matching rules. */
function buildDefaultUrlRules(): StoredProject["targetUrls"] {
    return [
        { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
        { pattern: "https://*.lovable.app/*", matchType: "glob" },
        { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
    ];
}

/** Returns the default cookie bindings for session auth. */
function buildDefaultCookieBindings(): CookieBinding[] {
    return [
        {
            cookieName: "lovable-session-id.id",
            url: "https://lovable.dev",
            role: "session",
            description: "Session ID — primary bearer token for API auth",
        },
        {
            cookieName: "lovable-session-id.refresh",
            url: "https://lovable.dev",
            role: "refresh",
            description: "Refresh token — used to obtain a new session",
        },
    ];
}

/** Returns the default project settings. */
function buildDefaultSettings(): StoredProject["settings"] {
    return {
        isolateScripts: true,
        logLevel: "info",
        retryOnNavigate: true,
        chatBoxXPath: DEFAULT_CHATBOX_XPATH,
    };
}

function buildDefaultLoopingScriptEntry(): ScriptEntry {
    return {
        path: DEFAULT_LOOPING_SCRIPT_PATH,
        order: 0,
        runAt: "document_idle",
        configBinding: DEFAULT_LOOPING_CONFIG_PATH,
        description: "MacroLoop controller — credit checking, workspace moves, loop engine",
    };
}

function buildDefaultLoopingConfigEntry(): ConfigEntry {
    return {
        path: DEFAULT_LOOPING_CONFIG_PATH,
        description: "IDs, timing, XPaths, URLs, and credit API settings for macro-looping.js",
    };
}

function normalizeDefaultProject(project: StoredProject): StoredProject {
    const normalizedScripts = normalizeScripts(project.scripts ?? []);
    const normalizedConfigs = normalizeConfigs(project.configs ?? []);
    const canonical = buildDefaultProject();

    return {
        ...project,
        name: canonical.name,
        description: canonical.description,
        scripts: normalizedScripts,
        configs: normalizedConfigs,
        cookies: canonical.cookies,
        targetUrls: canonical.targetUrls,
        settings: canonical.settings,
        version: canonical.version,
        dependencies: canonical.dependencies,
        updatedAt: nowTimestamp(),
    };
}

/** Normalizes the SDK project to ensure cookie bindings and fields are current. */
function normalizeSdkProject(project: StoredProject): StoredProject {
    const canonical = buildSdkProject();
    return {
        ...project,
        name: canonical.name,
        description: canonical.description,
        cookies: canonical.cookies,
        targetUrls: canonical.targetUrls,
        scripts: canonical.scripts,
        isGlobal: true,
        isRemovable: false,
        updatedAt: nowTimestamp(),
    };
}

function normalizeScripts(scripts: ScriptEntry[]): ScriptEntry[] {
    const filtered = scripts.filter((script) => !LEGACY_SCRIPT_PATHS.has(normalizePath(script.path)));
    const existingLoop = filtered.find((script) => normalizePath(script.path) === DEFAULT_LOOPING_SCRIPT_PATH);
    const nonLoopScripts = filtered.filter((script) => normalizePath(script.path) !== DEFAULT_LOOPING_SCRIPT_PATH);

    const loopScript: ScriptEntry = existingLoop
        ? {
            ...existingLoop,
            path: DEFAULT_LOOPING_SCRIPT_PATH,
            configBinding: DEFAULT_LOOPING_CONFIG_PATH,
            runAt: existingLoop.runAt ?? "document_idle",
            description: existingLoop.description ?? "MacroLoop controller — credit checking, workspace moves, loop engine",
        }
        : buildDefaultLoopingScriptEntry();

    const merged = [loopScript, ...nonLoopScripts]
        .map((script) => ({ ...script }))
        .sort((a, b) => a.order - b.order);

    return merged.map((script, index) => ({
        ...script,
        order: index,
    }));
}

function normalizeConfigs(configs: ConfigEntry[]): ConfigEntry[] {
    const filtered = configs.filter((config) => !LEGACY_CONFIG_PATHS.has(normalizePath(config.path)));
    const existingLoop = filtered.find((config) => normalizePath(config.path) === DEFAULT_LOOPING_CONFIG_PATH);
    const otherConfigs = filtered.filter((config) => normalizePath(config.path) !== DEFAULT_LOOPING_CONFIG_PATH);

    const loopConfig: ConfigEntry = existingLoop
        ? {
            ...existingLoop,
            path: DEFAULT_LOOPING_CONFIG_PATH,
            description: existingLoop.description ?? "IDs, timing, XPaths, URLs, and credit API settings for macro-looping.js",
        }
        : buildDefaultLoopingConfigEntry();

    return [loopConfig, ...otherConfigs];
}

function normalizePath(path: string): string {
    const normalized = path.trim().toLowerCase().replace(/\\/g, "/");
    const fileName = normalized.split("/").pop() ?? normalized;
    return fileName.split(/[?#]/)[0] ?? fileName;
}

function isProjectEquivalent(a: StoredProject, b: StoredProject): boolean {
    return a.name === b.name
        && a.description === b.description
        && a.version === b.version
        && JSON.stringify(a.scripts ?? []) === JSON.stringify(b.scripts ?? [])
        && JSON.stringify(a.configs ?? []) === JSON.stringify(b.configs ?? [])
        && JSON.stringify(a.cookies ?? []) === JSON.stringify(b.cookies ?? [])
        && JSON.stringify(a.targetUrls ?? []) === JSON.stringify(b.targetUrls ?? [])
        && JSON.stringify(a.settings ?? {}) === JSON.stringify(b.settings ?? {})
        && JSON.stringify(a.dependencies ?? []) === JSON.stringify(b.dependencies ?? [])
        && (a.isGlobal ?? false) === (b.isGlobal ?? false)
        && (a.isRemovable ?? true) === (b.isRemovable ?? true);
}

/** Marks that the extension has been installed. */
async function markFirstRun(): Promise<void> {
    await chrome.storage.local.set({
        [STORAGE_KEY_FIRST_RUN]: true,
    });
}
