/**
 * XPath Utilities — Project Instruction Manifest
 *
 * Global utility library. No configs, no CSS, just the JS bundle.
 * Loaded before all dependent projects.
 */

import type { SeedBlock, SeedTargetUrl, SeedCookie } from "../../marco-sdk/src/instruction";

export interface ProjectInstruction {
    schemaVersion: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    world: "MAIN" | "ISOLATED";
    isGlobal?: boolean;
    dependencies: string[];
    loadOrder: number;
    seed: SeedBlock;
    assets: {
        css: Array<{ file: string; inject: "head" }>;
        configs: Array<{ file: string; key: string; injectAs?: string }>;
        scripts: Array<{ file: string; order: number; configBinding?: string; themeBinding?: string; isIife?: boolean }>;
        templates: Array<{ file: string; injectAs?: string }>;
        prompts: Array<{ file: string }>;
    };
}

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "xpath",
    displayName: "XPath Utilities",
    version: "2.125.0",
    description: "Global XPath utility library (getByXPath, findElement, reactClick)",
    world: "MAIN",
    isGlobal: true,
    dependencies: [],
    loadOrder: 1,
    seed: {
        id: "default-xpath-utils",
        seedOnInstall: true,
        isRemovable: false,
        autoInject: true,
        runAt: undefined,
        cookieBinding: undefined,
        targetUrls: [
            { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            { pattern: "https://*.lovable.app/*", matchType: "glob" },
            { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
        ],
        cookies: [],
        settings: {},
    },
    assets: {
        css: [],
        configs: [],
        scripts: [
            {
                file: "xpath.js",
                order: 1,
                isIife: true,
            },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
