/**
 * Marco Controller — Project Instruction Manifest
 *
 * Defines the load order and asset dependencies for this project.
 * Compiled at build time to dist/instruction.json.
 *
 * Load order: CSS (head) → JSON configs → JavaScript
 */

import type { SeedBlock } from "../../marco-sdk/src/instruction";

export interface ProjectInstruction {
    /** Schema version for forward-compatible evolution */
    schemaVersion: string;
    /** Project identifier (matches folder name) */
    name: string;
    /** Display name */
    displayName: string;
    /** Semantic version */
    version: string;
    /** Description */
    description: string;
    /** Execution world: MAIN or ISOLATED */
    world: "MAIN" | "ISOLATED";
    /** Project-level dependencies (other project names that must load first) */
    dependencies: string[];
    /** Global load order (lower = first) */
    loadOrder: number;
    /** Seeding metadata — drives automatic registration into chrome.storage.local */
    seed: SeedBlock;
    /** Asset declarations — determines injection order */
    assets: {
        /** CSS files injected into <head> FIRST */
        css: Array<{
            file: string;
            inject: "head";
        }>;
        /** JSON config files loaded BEFORE JavaScript */
        configs: Array<{
            file: string;
            /** Key used to identify this config at runtime */
            key: string;
            /** Optional: inject as window global variable */
            injectAs?: string;
        }>;
        /** JavaScript files loaded LAST, in order */
        scripts: Array<{
            file: string;
            order: number;
            /** Which config key this script depends on */
            configBinding?: string;
            /** Which config key provides theme data */
            themeBinding?: string;
            /** Whether the script is an IIFE wrapper */
            isIife?: boolean;
        }>;
        /** Template registries loaded alongside configs */
        templates: Array<{
            file: string;
            /** Optional: inject as window global variable */
            injectAs?: string;
        }>;
        /** Prompt data files seeded into SQLite */
        prompts: Array<{
            file: string;
        }>;
    };
}

/**
 * Macro Controller project instruction.
 *
 * This is the DEFAULT project — it seeds automatically on extension install.
 */
const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "macro-controller",
    displayName: "Macro Controller",
    version: "2.18.0",
    description: "Macro Controller for workspace and credit management",
    world: "MAIN",
    dependencies: ["marco-sdk", "xpath"],
    loadOrder: 2,
    seed: {
        id: "default-macro-looping",
        seedOnInstall: true,
        isRemovable: false,
        autoInject: false,
        runAt: "document_idle",
        cookieBinding: "lovable-session-id.id",
        targetUrls: [
            { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            { pattern: "https://*.lovable.app/*", matchType: "glob" },
            { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
        ],
        cookies: [
            { cookieName: "lovable-session-id.id", url: "https://lovable.dev", role: "session", description: "Session ID — primary bearer token" },
            { cookieName: "lovable-session-id.refresh", url: "https://lovable.dev", role: "refresh", description: "Refresh token" },
        ],
        settings: {
            isolateScripts: true,
            logLevel: "info",
            retryOnNavigate: true,
        },
        configSeedIds: {
            config: "default-macro-looping-config",
            theme: "default-macro-theme",
        },
    },
    assets: {
        css: [
            { file: "macro-looping.css", inject: "head" },
        ],
        configs: [
            {
                file: "macro-looping-config.json",
                key: "config",
                injectAs: "__MARCO_CONFIG__",
            },
            {
                file: "macro-theme.json",
                key: "theme",
                injectAs: "__MARCO_THEME__",
            },
        ],
        scripts: [
            {
                file: "macro-looping.js",
                order: 1,
                configBinding: "config",
                themeBinding: "theme",
                isIife: true,
            },
        ],
        templates: [
            { file: "templates.json", injectAs: "__MARCO_TEMPLATES__" },
        ],
        prompts: [],
    },
};

export default instruction;
