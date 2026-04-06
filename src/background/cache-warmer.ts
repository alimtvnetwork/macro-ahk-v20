/**
 * Marco Extension — Script Cache Warmer
 *
 * Pre-fetches all filePath-backed scripts from web_accessible_resources
 * and caches them in IndexedDB at deploy/install time.
 * This ensures scripts are available for instant injection when
 * the user clicks "Run Script" — no cold-start fetch needed.
 *
 * Called from handleInstalled() after seedFromManifest() completes.
 *
 * See: spec/01-app-issues/88-indexeddb-injection-cache.md
 */

import type { StoredScript } from "../shared/script-config-types";
import { STORAGE_KEY_ALL_SCRIPTS } from "../shared/constants";
import { cacheScriptCode } from "./injection-cache";
import { logCaughtError } from "./bg-logger";

/**
 * Reads all scripts from chrome.storage.local, finds those with a filePath,
 * fetches each from web_accessible_resources, and caches in IndexedDB.
 *
 * Errors are logged but never thrown — warming is best-effort.
 */
export async function warmScriptCache(): Promise<{ warmed: number; failed: number }> {
    let warmed = 0;
    let failed = 0;

    try {
        const result = await chrome.storage.local.get(STORAGE_KEY_ALL_SCRIPTS);
        const scripts: StoredScript[] = Array.isArray(result[STORAGE_KEY_ALL_SCRIPTS])
            ? result[STORAGE_KEY_ALL_SCRIPTS]
            : [];

        const fileBackedScripts = scripts.filter(
            (s) => typeof s.filePath === "string" && s.filePath.length > 0 && s.isEnabled !== false,
        );

        if (fileBackedScripts.length === 0) {
            console.log("[cache-warmer] No filePath-backed scripts to warm");
            return { warmed: 0, failed: 0 };
        }

        console.log("[cache-warmer] Warming %d filePath-backed scripts...", fileBackedScripts.length);

        // Fetch all in parallel for speed
        const results = await Promise.allSettled(
            fileBackedScripts.map((script) => warmOneScript(script)),
        );

        for (const r of results) {
            if (r.status === "fulfilled" && r.value) {
                warmed++;
            } else {
                failed++;
            }
        }

        console.log("[cache-warmer] ✅ Warmed %d scripts, %d failed", warmed, failed);
    } catch (err) {
        logCaughtError(BgLogTag.CACHE_WARMER, "Warming aborted", err);
    }

    return { warmed, failed };
}

/**
 * Fetches a single script from web_accessible_resources and caches it.
 * Returns true on success, false on failure.
 */
async function warmOneScript(script: StoredScript): Promise<boolean> {
    const filePath = script.filePath!;
    try {
        const url = script.isAbsolute ? filePath : chrome.runtime.getURL(filePath);
        const response = await fetch(url);

        if (!response.ok) {
            logCaughtError(BgLogTag.CACHE_WARMER, `Fetch failed for ${filePath}: HTTP ${response.status}`, new Error(`HTTP ${response.status}`));
            return false;
        }

        const code = await response.text();
        if (!code || code.length < 10) {
            logCaughtError(BgLogTag.CACHE_WARMER, `Empty/tiny response for ${filePath} (${code?.length ?? 0} chars)`, new Error("Empty response"));
            return false;
        }

        await cacheScriptCode(filePath, code);
        console.log("[cache-warmer] Cached %s (%d chars)", filePath, code.length);
        return true;
    } catch (err) {
        logCaughtError(BgLogTag.CACHE_WARMER, `Error warming ${filePath}`, err);
        return false;
    }
}
