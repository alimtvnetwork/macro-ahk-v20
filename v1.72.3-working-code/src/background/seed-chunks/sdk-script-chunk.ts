/**
 * Builds the default Riseup Macro SDK StoredScript.
 *
 * Uses the compiled marco-sdk.js from standalone-scripts/marco-sdk/dist/.
 * This is a global core script loaded before all dependent scripts.
 *
 * The `code` field contains a lightweight stub — the real script is loaded
 * at injection time via resolveScriptCode() in script-resolver.ts, which
 * fetches from the web_accessible_resources filePath.
 */

import type { StoredScript } from "../../shared/script-config-types";
import { DEFAULT_SDK_SCRIPT_ID } from "./seed-ids";

/** Relative path within extension dist — per-project subfolder. */
const MARCO_SDK_FILE_PATH = "projects/scripts/marco-sdk/marco-sdk.js";

/**
 * Stub code used as fallback if filePath fetch fails.
 */
const STUB_CODE = `console.error("[marco-sdk] STUB: Script not loaded from web_accessible_resources. filePath fetch failed.");`;

/** Returns the default Riseup Macro SDK StoredScript. */
export function buildDefaultSdkScript(): StoredScript {
    const now = new Date().toISOString();

    return {
        id: DEFAULT_SDK_SCRIPT_ID,
        name: "marco-sdk.js",
        description: "Global Riseup Macro SDK (window.marco + RiseupAsiaMacroExt root)",
        code: STUB_CODE,
        filePath: MARCO_SDK_FILE_PATH,
        isAbsolute: false,
        order: -1,
        isEnabled: true,
        isIife: true,
        autoInject: true,
        isGlobal: true,
        dependencies: [],
        loadOrder: 0,
        createdAt: now,
        updatedAt: now,
    };
}
