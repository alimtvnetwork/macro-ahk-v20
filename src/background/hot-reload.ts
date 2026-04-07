/**
 * Marco Extension — Hot Reload
 *
 * Polls build-meta.json for changes and auto-reloads the extension
 * when a new build is detected. Only active when build-meta.json
 * exists (dev/deploy builds). Production builds without the file
 * are silently ignored.
 *
 * See spec/17-app-issues/15-deploy-no-auto-reload.md
 */

import { syncCacheWithBuildId } from "./injection-cache";

const HOT_RELOAD_INTERVAL_MS = 1000;
const BUILD_META_URL = "build-meta.json";

let lastKnownBuildId: string | null = null;
let isPollingActive = false;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Starts the hot-reload polling loop. */
export function startHotReload(): void {
    const isAlreadyActive = isPollingActive === true;

    if (isAlreadyActive) {
        return;
    }

    isPollingActive = true;
    void pollBuildMeta();
    setInterval(() => void pollBuildMeta(), HOT_RELOAD_INTERVAL_MS);
    console.log("[hot-reload] Polling started (every %dms)", HOT_RELOAD_INTERVAL_MS);
}

/* ------------------------------------------------------------------ */
/*  Polling Logic                                                      */
/* ------------------------------------------------------------------ */

/** Fetches build-meta.json and triggers reload if buildId changed. */
async function pollBuildMeta(): Promise<void> {
    try {
        const metaUrl = chrome.runtime.getURL(BUILD_META_URL);
        const response = await fetch(metaUrl, { cache: "no-store" });
        const isNotFound = !response.ok;

        if (isNotFound) {
            return;
        }

        const meta = await response.json() as { buildId?: string };
        const currentBuildId = meta.buildId ?? null;
        const hasBuildId = currentBuildId !== null;

        if (!hasBuildId) {
            return;
        }

        const isFirstPoll = lastKnownBuildId === null;

        if (isFirstPoll) {
            lastKnownBuildId = currentBuildId;
            console.log("[hot-reload] Baseline buildId: %s", currentBuildId);
            return;
        }

        const isBuildChanged = currentBuildId !== lastKnownBuildId;

        if (isBuildChanged) {
            const previousBuildId = lastKnownBuildId;
            lastKnownBuildId = currentBuildId;
            const cacheSyncResult = await syncCacheWithBuildId(currentBuildId);
            console.log(
                "[hot-reload] Build changed: %s → %s — cleared %d cache entries, reloading!",
                previousBuildId,
                currentBuildId,
                cacheSyncResult.cleared,
            );
            chrome.runtime.reload();
        }
    } catch {
        // Silently ignore fetch failures (file missing, network error, etc.)
    }
}
