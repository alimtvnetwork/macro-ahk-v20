/**
 * Marco Extension — Default Scripts & Configs Seeder
 *
 * Seeds only macro-looping.js and its JSON config.
 * Also refreshes existing default entries to prevent stale code/config drift.
 * Removes legacy default scripts/configs (combo/controller) from storage.
 */

import type { StoredScript, StoredConfig } from "../shared/script-config-types";
import { STORAGE_KEY_ALL_SCRIPTS, STORAGE_KEY_ALL_CONFIGS, STORAGE_KEY_LEGACY_PRUNED } from "../shared/constants";
import {
    DEFAULT_LOOPING_SCRIPT_ID,
    DEFAULT_LOOPING_CONFIG_ID,
    DEFAULT_SDK_SCRIPT_ID,
    DEFAULT_THEME_CONFIG_ID,
    DEFAULT_XPATH_SCRIPT_ID,
} from "./seed-chunks/seed-ids";
import { buildDefaultLoopingConfig } from "./seed-chunks/looping-config-chunk";
import { buildDefaultLoopingScript } from "./seed-chunks/looping-script-chunk";
import { buildDefaultSdkScript } from "./seed-chunks/sdk-script-chunk";
import { buildDefaultThemeConfig } from "./seed-chunks/theme-config-chunk";
import { buildDefaultXpathScript } from "./seed-chunks/xpath-script-chunk";

const LEGACY_DEFAULT_SCRIPT_IDS = new Set([
    "default-macro-controller",
    "default-combo-switch",
]);

const LEGACY_DEFAULT_SCRIPT_NAMES = new Set([
    "macro-controller.js",
    "combo-switch.js",
]);

const LEGACY_DEFAULT_CONFIG_IDS = new Set([
    "default-controller-config",
    "default-combo-config",
]);

const LEGACY_DEFAULT_CONFIG_NAMES = new Set([
    "macro-controller-config.json",
    "combo-config.json",
]);

/** Seeds default scripts and configs if missing, or refreshes stale defaults. */
export async function seedDefaultScripts(): Promise<void> {
    const prunedScripts = await seedScripts();
    const prunedConfigs = await seedConfigs();
    const prunedNames = [...prunedScripts, ...prunedConfigs];

    if (prunedNames.length > 0) {
        await chrome.storage.local.set({
            [STORAGE_KEY_LEGACY_PRUNED]: {
                names: prunedNames,
                timestamp: new Date().toISOString(),
            },
        });
        console.log("[seeder] Legacy items pruned:", prunedNames.join(", "));
    }
}

/** Seeds/refreshes default scripts in storage. Returns names of pruned legacy scripts. */
async function seedScripts(): Promise<string[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
    const storedScripts: StoredScript[] = Array.isArray(result[STORAGE_KEY_ALL_SCRIPTS])
        ? result[STORAGE_KEY_ALL_SCRIPTS]
        : [];

    const prunedNames = storedScripts.filter(isLegacyDefaultScript).map((s) => s.name);
    const scripts = storedScripts.filter((script) => !isLegacyDefaultScript(script));
    let changed = prunedNames.length > 0;

    // Seed Riseup Macro SDK script (global core, loaded first)
    const seededSdk = buildDefaultSdkScript();
    const sdkIdx = scripts.findIndex((s) =>
        s.id === DEFAULT_SDK_SCRIPT_ID || s.name === seededSdk.name,
    );

    if (sdkIdx === -1) {
        scripts.push(seededSdk);
        changed = true;
    } else {
        const currentSdk = scripts[sdkIdx];
        const shouldRefreshSdk =
            currentSdk.code !== seededSdk.code ||
            currentSdk.isGlobal !== seededSdk.isGlobal ||
            currentSdk.loadOrder !== seededSdk.loadOrder ||
            currentSdk.filePath !== seededSdk.filePath ||
            currentSdk.isIife !== seededSdk.isIife ||
            currentSdk.isEnabled !== seededSdk.isEnabled;

        if (shouldRefreshSdk) {
            scripts[sdkIdx] = {
                ...currentSdk,
                id: seededSdk.id,
                name: seededSdk.name,
                description: seededSdk.description,
                code: seededSdk.code,
                filePath: seededSdk.filePath,
                isAbsolute: seededSdk.isAbsolute,
                order: seededSdk.order,
                isEnabled: seededSdk.isEnabled,
                isIife: seededSdk.isIife,
                autoInject: seededSdk.autoInject,
                isGlobal: seededSdk.isGlobal,
                dependencies: seededSdk.dependencies,
                loadOrder: seededSdk.loadOrder,
                updatedAt: new Date().toISOString(),
            };
            changed = true;
        }
    }

    // Seed xpath script (global utility, loaded first)
    const seededXpath = buildDefaultXpathScript();
    const xpathIdx = scripts.findIndex((s) => s.id === DEFAULT_XPATH_SCRIPT_ID);

    if (xpathIdx === -1) {
        scripts.push(seededXpath);
        changed = true;
    } else {
        const currentXpath = scripts[xpathIdx];
        const shouldRefreshXpath =
            currentXpath.code !== seededXpath.code ||
            currentXpath.isGlobal !== seededXpath.isGlobal ||
            currentXpath.loadOrder !== seededXpath.loadOrder ||
            currentXpath.filePath !== seededXpath.filePath;

        if (shouldRefreshXpath) {
            scripts[xpathIdx] = {
                ...currentXpath,
                name: seededXpath.name,
                code: seededXpath.code,
                filePath: seededXpath.filePath,
                isAbsolute: seededXpath.isAbsolute,
                isGlobal: seededXpath.isGlobal,
                loadOrder: seededXpath.loadOrder,
                updatedAt: new Date().toISOString(),
            };
            changed = true;
        }
    }

    // Seed macro-looping script
    const seededScript = buildDefaultLoopingScript();
    const idx = scripts.findIndex((s) => s.id === DEFAULT_LOOPING_SCRIPT_ID);

    if (idx === -1) {
        scripts.push(seededScript);
        changed = true;
    } else {
        const current = scripts[idx];
        const shouldRefresh =
            current.name !== seededScript.name ||
            current.code !== seededScript.code ||
            current.configBinding !== seededScript.configBinding ||
            current.cookieBinding !== seededScript.cookieBinding ||
            current.isIife !== seededScript.isIife ||
            JSON.stringify(current.dependencies) !== JSON.stringify(seededScript.dependencies) ||
            current.filePath !== seededScript.filePath;

        if (shouldRefresh) {
            scripts[idx] = {
                ...current,
                name: seededScript.name,
                code: seededScript.code,
                filePath: seededScript.filePath,
                isAbsolute: seededScript.isAbsolute,
                configBinding: seededScript.configBinding,
                cookieBinding: seededScript.cookieBinding,
                isIife: seededScript.isIife,
                dependencies: seededScript.dependencies,
                loadOrder: seededScript.loadOrder,
                updatedAt: new Date().toISOString(),
            };
            changed = true;
        }
    }

    if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_SCRIPTS]: scripts });
    }

    return prunedNames;
}

/** Seeds/refreshes default configs in storage. Returns names of pruned legacy configs. */
async function seedConfigs(): Promise<string[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_CONFIGS);
    const storedConfigs: StoredConfig[] = Array.isArray(result[STORAGE_KEY_ALL_CONFIGS])
        ? result[STORAGE_KEY_ALL_CONFIGS]
        : [];

    const prunedNames = storedConfigs.filter(isLegacyDefaultConfig).map((c) => c.name);
    const configs = storedConfigs.filter((config) => !isLegacyDefaultConfig(config));
    let changed = prunedNames.length > 0;

    const seededConfig = buildDefaultLoopingConfig();
    const idx = configs.findIndex((c) => c.id === DEFAULT_LOOPING_CONFIG_ID);

    if (idx === -1) {
        configs.push(seededConfig);
        changed = true;
    } else {
        const current = configs[idx];
        const shouldRefresh =
            current.name !== seededConfig.name ||
            current.json !== seededConfig.json;

        if (shouldRefresh) {
            configs[idx] = {
                ...current,
                name: seededConfig.name,
                json: seededConfig.json,
                updatedAt: new Date().toISOString(),
            };
            changed = true;
        }
    }

    // Seed theme config
    const seededTheme = buildDefaultThemeConfig();
    const themeIdx = configs.findIndex((c) => c.id === DEFAULT_THEME_CONFIG_ID);

    if (themeIdx === -1) {
        configs.push(seededTheme);
        changed = true;
    } else {
        const currentTheme = configs[themeIdx];
        const shouldRefreshTheme =
            currentTheme.name !== seededTheme.name ||
            currentTheme.json !== seededTheme.json;

        if (shouldRefreshTheme) {
            configs[themeIdx] = {
                ...currentTheme,
                name: seededTheme.name,
                json: seededTheme.json,
                updatedAt: new Date().toISOString(),
            };
            changed = true;
        }
    }

    if (changed) {
        await chrome.storage.local.set({ [STORAGE_KEY_ALL_CONFIGS]: configs });
    }

    return prunedNames;
}

function isLegacyDefaultScript(script: StoredScript): boolean {
    const normalizedName = script.name.trim().toLowerCase();
    return LEGACY_DEFAULT_SCRIPT_IDS.has(script.id) || LEGACY_DEFAULT_SCRIPT_NAMES.has(normalizedName);
}

function isLegacyDefaultConfig(config: StoredConfig): boolean {
    const normalizedName = config.name.trim().toLowerCase();
    return LEGACY_DEFAULT_CONFIG_IDS.has(config.id) || LEGACY_DEFAULT_CONFIG_NAMES.has(normalizedName);
}
