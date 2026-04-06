/**
 * Builds the default MacroLoop script (macro-looping.js).
 *
 * Stores file path reference to the per-project subfolder.
 * Code is fetched at injection time from chrome.runtime.getURL().
 *
 * The `code` field contains a lightweight stub — the real script is loaded
 * at injection time via resolveScriptCode() in script-resolver.ts, which
 * fetches from the web_accessible_resources filePath.
 *
 * Check button regressions are tracked in:
 * - spec/12-chrome-extension/60-check-button-spec.md
 * - spec/02-app-issues/check-button/10-runtime-seed-drift.md
 */

import type { StoredScript } from "../../shared/script-config-types";
import { DEFAULT_LOOPING_SCRIPT_ID, DEFAULT_LOOPING_CONFIG_ID, DEFAULT_THEME_CONFIG_ID, DEFAULT_XPATH_SCRIPT_ID } from "./seed-ids";

/** Relative path within extension dist — per-project subfolder. */
const MACRO_LOOPING_FILE_PATH = "projects/scripts/macro-controller/macro-looping.js";

/**
 * Stub code used as fallback if filePath fetch fails.
 * Logs an error so the user knows the real script wasn't loaded.
 */
const STUB_CODE = `console.error("[macro-looping] STUB: Script not loaded from web_accessible_resources. filePath fetch failed.");`;

/** Returns the default MacroLoop StoredScript. */
export function buildDefaultLoopingScript(): StoredScript {
    const now = new Date().toISOString();

    return {
        id: DEFAULT_LOOPING_SCRIPT_ID,
        name: "macro-looping.js",
        code: STUB_CODE,
        filePath: MACRO_LOOPING_FILE_PATH,
        isAbsolute: false,
        order: 1,
        isEnabled: true,
        isIife: true,
        autoInject: false,
        configBinding: DEFAULT_LOOPING_CONFIG_ID,
        themeBinding: DEFAULT_THEME_CONFIG_ID,
        cookieBinding: "lovable-session-id.id",
        dependencies: [DEFAULT_XPATH_SCRIPT_ID],
        loadOrder: 2,
        createdAt: now,
        updatedAt: now,
    };
}
