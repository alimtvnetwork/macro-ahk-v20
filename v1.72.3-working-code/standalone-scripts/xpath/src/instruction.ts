/**
 * XPath Utilities — Project Instruction Manifest
 *
 * Global utility library. No configs, no CSS, just the JS bundle.
 * Loaded before all dependent projects.
 */

export interface ProjectInstruction {
    name: string;
    displayName: string;
    version: string;
    description: string;
    world: "MAIN" | "ISOLATED";
    dependencies: string[];
    loadOrder: number;
    assets: {
        css: Array<{ file: string; inject: "head" }>;
        configs: Array<{ file: string; key: string; injectAs?: string }>;
        scripts: Array<{ file: string; order: number; configBinding?: string; themeBinding?: string; isIife?: boolean }>;
        templates: Array<{ file: string; injectAs?: string }>;
        prompts: Array<{ file: string }>;
    };
}

const instruction: ProjectInstruction = {
    name: "xpath",
    displayName: "XPath Utilities",
    version: "1.0.0",
    description: "Global XPath utility library (getByXPath, findElement, reactClick)",
    world: "MAIN",
    dependencies: [],
    loadOrder: 1,
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