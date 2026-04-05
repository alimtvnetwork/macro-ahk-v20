/**
 * Marco Extension — Boot Sequence
 *
 * Initializes databases, rehydrates state, binds handlers, seeds defaults,
 * and drains the pre-init message buffer.
 *
 * @see spec/05-chrome-extension/19-opfs-persistence-strategy.md — DB persistence strategy
 * @see spec/05-chrome-extension/09-error-recovery.md — Boot failure recovery
 * @see .lovable/memory/architecture/background/service-worker-structure.md — SW architecture
 */

import { initDatabases, type DbManager } from "./db-manager";
import { bindDbManager, startSession } from "./handlers/logging-handler";
import { bindStorageDbManager } from "./handlers/storage-handler";
import { bindErrorDbManager } from "./handlers/error-handler";
import { bindPromptDbManager, reseedPrompts } from "./handlers/prompt-handler";
import { bindKvDbManager } from "./handlers/kv-handler";
import { bindGroupedKvDbManager } from "./handlers/grouped-kv-handler";
import { bindFileStorageDbManager, onFileStorageChange } from "./handlers/file-storage-handler";
import { bindStorageBrowserDbManager } from "./handlers/storage-browser-handler";
import { bindUpdaterDbManager } from "./handlers/updater-handler";
import {
    rehydrateState,
    setCurrentSessionId,
    setPersistenceMode,
} from "./state-manager";
import {
    ensureDefaultProjectSingleScript,
} from "./default-project-seeder";
import { seedFromManifest } from "./manifest-seeder";
import { setBootStep, setBootPersistenceMode, finalizeBoot } from "./boot-diagnostics";
import { configureUserScriptWorld } from "./csp-fallback";
import { markInitialized, drainBuffer } from "./message-buffer";
import { cacheScriptCode, getCachedScriptCode, purgeStaleEntries, syncCacheWithBuildId } from "./injection-cache";
import { invalidateNamespaceCache } from "./namespace-cache";

const BUILD_META_URL = "build-meta.json";

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

/** Boots the extension: init DB → rehydrate → bind → drain buffer. */
// eslint-disable-next-line max-lines-per-function
export async function boot(): Promise<void> {
    let step = "pre-init";
    let manager: DbManager | null = null;

    try {
        step = "db-init";
        setBootStep(step);
        manager = await initDatabases();

        // Configure userScripts world early (non-blocking on failure)
        void configureUserScriptWorld();

        setBootPersistenceMode(manager.getPersistenceMode() as "opfs" | "storage" | "memory");
        console.log("[Marco] ✓ DB initialized (%s)", manager.getPersistenceMode());

        step = "sync-build-cache";
        setBootStep(step);
        const currentBuildId = await readCurrentBuildId();
        const buildSyncResult = await syncCacheWithBuildId(currentBuildId);
        if (buildSyncResult.changed) {
            console.log("[Marco] ✓ Build cache sync cleared %d entries", buildSyncResult.cleared);
        }

        step = "bind-handlers";
        setBootStep(step);
        bindAllHandlers(manager);

        step = "rehydrate-state";
        setBootStep(step);
        await rehydrateState();
        setPersistenceMode(manager.getPersistenceMode());
        console.log("[Marco] ✓ State rehydrated");

        step = "start-session";
        setBootStep(step);
        const sessionId = startSession(chrome.runtime.getManifest().version);
        setCurrentSessionId(sessionId);

        step = "seed-scripts";
        setBootStep(step);
        try {
            const result = await seedFromManifest();
            console.log("[Marco] ✓ Manifest seeder: %d scripts, %d configs across %d projects", result.scripts, result.configs, result.projects);
        } catch (err) {
            console.warn("[Marco] Manifest seeder failed (non-fatal):", err);
        }

        step = "reseed-prompts";
        setBootStep(step);
        try {
            await reseedPrompts();
            console.log("[Marco] ✓ Prompts reseeded from dist");
        } catch (err) {
            console.warn("[Marco] Prompt reseed failed (non-fatal):", err);
        }

        step = "normalize-default-project";
        setBootStep(step);
        try {
            await ensureDefaultProjectSingleScript();
            console.log("[Marco] ✓ Default project normalized");
        } catch (err) {
            console.warn("[Marco] Default project normalization failed (non-fatal):", err);
        }

        step = "purge-stale-cache";
        setBootStep(step);
        try {
            await purgeStaleEntries();
        } catch (err) {
            console.warn("[Marco] Cache purge failed (non-fatal):", err);
        }

        step = "precache-scripts";
        setBootStep(step);
        try {
            await precacheStableScripts();
            console.log("[Marco] Pre-cached stable scripts into IndexedDB");
        } catch (err) {
            console.warn("[Marco] Script pre-cache failed (non-fatal):", err);
        }

        step = "ready";
        setBootStep(step);
        finalizeBoot();
        markInitialized();
        await drainBuffer();
        console.log("[Marco] Service worker ready");
    } catch (err) {
        const bootErrorMessage = formatBootError(step, err);

        setBootStep(`failed:${step}`);
        finalizeBoot();
        console.error("[Marco] %s", bootErrorMessage);

        if (manager === null) {
            bindAllHandlers(createUnavailableDbManager(bootErrorMessage));
        }

        markInitialized();
        await drainBuffer();
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Creates a degraded DbManager that returns explicit DB-unavailable errors. */
function createUnavailableDbManager(reason: string): DbManager {
    const throwUnavailable = (): never => {
        throw new Error(`[db-unavailable] ${reason}`);
    };

    return {
        getLogsDb: throwUnavailable as unknown as DbManager["getLogsDb"],
        getErrorsDb: throwUnavailable as unknown as DbManager["getErrorsDb"],
        getPersistenceMode: () => "memory",
        flushIfDirty: async () => {},
        markDirty: () => {},
    };
}

/** Formats a stable boot failure message for logs and surfaced errors. */
function formatBootError(step: string, error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    return `Boot failed at step '${step}': ${reason}`;
}

/** Reads the current buildId from build-meta.json, if available. */
async function readCurrentBuildId(): Promise<string | null> {
    try {
        const response = await fetch(chrome.runtime.getURL(BUILD_META_URL), { cache: "no-store" });
        if (!response.ok) {
            return null;
        }

        const meta = await response.json() as { buildId?: unknown };
        return typeof meta.buildId === "string" && meta.buildId.length > 0
            ? meta.buildId
            : null;
    } catch {
        return null;
    }
}

/** Binds all handler modules to the shared DbManager. */
function bindAllHandlers(manager: DbManager): void {
    bindDbManager(manager);
    bindStorageDbManager(manager);
    bindErrorDbManager(manager);
    bindPromptDbManager(manager);
    bindKvDbManager(manager);
    bindGroupedKvDbManager(manager);
    bindFileStorageDbManager(manager);
    // Wire file-change → namespace cache invalidation without circular import.
    onFileStorageChange((projectId) => {
        invalidateNamespaceCache(projectId).catch(() => {});
    });
    bindStorageBrowserDbManager(manager);
    bindUpdaterDbManager(manager);
}

/**
 * Pre-caches ALL stable injection scripts into IndexedDB on boot.
 * This eliminates cold-start fetch latency (~500ms savings).
 * SDK/XPath are fully stable; macro-looping changes with builds
 * but cache is invalidated by build-ID checks elsewhere.
 */
async function precacheStableScripts(): Promise<void> {
    const stableScripts = [
        "projects/scripts/marco-sdk/marco-sdk.js",
        "projects/scripts/xpath/xpath.js",
        "projects/scripts/macro-controller/macro-looping.js",
    ];

    const t0 = performance.now();

    const cacheResults = await Promise.all(
        stableScripts.map(async (path): Promise<string> => {
            try {
                const cached = await getCachedScriptCode(path);
                if (cached !== null) {
                    return path + " (already cached)";
                }

                const url = chrome.runtime.getURL(path);
                const response = await fetch(url);
                if (!response.ok) {
                    return path + " (fetch failed: " + response.status + ")";
                }

                const code = await response.text();
                await cacheScriptCode(path, code);
                return path + " (cached " + code.length + " chars)";
            } catch (err) {
                return path + " (error: " + (err instanceof Error ? err.message : String(err)) + ")";
            }
        }),
    );

    const ms = (performance.now() - t0).toFixed(1);
    console.log("[Marco] Pre-cached %d scripts in %sms: %s", stableScripts.length, ms, cacheResults.join(", "));
}
