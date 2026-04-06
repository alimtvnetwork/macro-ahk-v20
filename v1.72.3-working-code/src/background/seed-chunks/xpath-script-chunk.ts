/**
 * Builds the default XPath Utilities StoredScript.
 *
 * Uses the compiled xpath.js from standalone-scripts/xpath/dist/.
 * This is a global script loaded before all dependent scripts.
 *
 * The `code` field contains a lightweight stub — the real script is loaded
 * at injection time via resolveScriptCode() in script-resolver.ts, which
 * fetches from the web_accessible_resources filePath.
 */

import type { StoredScript } from "../../shared/script-config-types";
import { DEFAULT_XPATH_SCRIPT_ID } from "./seed-ids";

/** Relative path within extension dist — per-project subfolder. */
const XPATH_FILE_PATH = "projects/scripts/xpath/xpath.js";

/**
 * Stub code used as fallback if filePath fetch fails.
 */
const STUB_CODE = `console.error("[xpath] STUB: Script not loaded from web_accessible_resources. filePath fetch failed.");`;

/** Returns the default XPath Utilities StoredScript. */
export function buildDefaultXpathScript(): StoredScript {
    const now = new Date().toISOString();

    return {
        id: DEFAULT_XPATH_SCRIPT_ID,
        name: "xpath.js",
        description: "Global XPath utility library (getByXPath, findElement, reactClick)",
        code: STUB_CODE,
        filePath: XPATH_FILE_PATH,
        isAbsolute: false,
        order: 0,
        isEnabled: true,
        isIife: true,
        autoInject: true,
        isGlobal: true,
        dependencies: [],
        loadOrder: 1,
        createdAt: now,
        updatedAt: now,
    };
}
