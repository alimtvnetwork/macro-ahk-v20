/**
 * Builds the default MacroLoop theme configuration JSON.
 * Centralizes all colors, animations, layout, and typography tokens.
 * Editable via Chrome Extension config CRUD (Options page).
 */

import type { StoredConfig } from "../../shared/script-config-types";
import { DEFAULT_THEME_CONFIG_ID } from "./seed-ids";
import themeJson from "@standalone/macro-controller/04-macro-theme.json";

/** Returns the default MacroLoop theme config. */
export function buildDefaultThemeConfig(): StoredConfig {
    const now = new Date().toISOString();

    return {
        id: DEFAULT_THEME_CONFIG_ID,
        name: "macro-theme.json",
        json: JSON.stringify(themeJson, null, 2),
        createdAt: now,
        updatedAt: now,
    };
}
