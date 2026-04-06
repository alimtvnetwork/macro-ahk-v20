/**
 * Marco Controller — Project Instruction Manifest
 *
 * Defines the load order and asset dependencies for this project.
 * Compiled at build time to dist/instruction.json.
 *
 * Load order: CSS (head) → JSON configs → JavaScript
 */

export interface ProjectInstruction {
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
    name: "macro-controller",
    displayName: "Macro Controller",
    version: "1.70.0",
    description: "Macro Controller for workspace and credit management",
    world: "MAIN",
    dependencies: ["xpath"],
    loadOrder: 2,
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
        prompts: [
            { file: "03-macro-prompts.json" },
        ],
    },
};

export default instruction;