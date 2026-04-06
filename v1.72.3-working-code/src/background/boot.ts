/**
 * Marco Extension — Boot Sequence
 *
 * Initializes databases, rehydrates state, binds handlers, seeds defaults,
 * and drains the pre-init message buffer.
 */

import { initDatabases, type DbManager } from "./db-manager";
import { bindDbManager, startSession } from "./handlers/logging-handler";
import { bindStorageDbManager } from "./handlers/storage-handler";
import { bindErrorDbManager } from "./handlers/error-handler";
import { bindPromptDbManager, reseedPrompts } from "./handlers/prompt-handler";
import { bindKvDbManager } from "./handlers/kv-handler";
import { bindGroupedKvDbManager } from "./handlers/grouped-kv-handler";
import { bindFileStorageDbManager } from "./handlers/file-storage-handler";
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
import { seedDefaultScripts } from "./default-scripts-seeder";
import { setBootStep, setBootPersistenceMode, finalizeBoot } from "./boot-diagnostics";
import { configureUserScriptWorld } from "./csp-fallback";
import { markInitialized, drainBuffer } from "./message-buffer";

/* ------------------------------------------------------------------ */
/*  Boot                                                               */
/* ------------------------------------------------------------------ */

/** Boots the extension: init DB → rehydrate → bind → drain buffer. */
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
        await seedDefaultScripts();
        console.log("[Marco] ✓ Default scripts seeded");

        step = "reseed-prompts";
        setBootStep(step);
        await reseedPrompts();
        console.log("[Marco] ✓ Prompts reseeded from dist");

        step = "normalize-default-project";
        setBootStep(step);
        await ensureDefaultProjectSingleScript();
        console.log("[Marco] ✓ Default project normalized");

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

/** Binds all handler modules to the shared DbManager. */
function bindAllHandlers(manager: DbManager): void {
    bindDbManager(manager);
    bindStorageDbManager(manager);
    bindErrorDbManager(manager);
    bindPromptDbManager(manager);
    bindKvDbManager(manager);
    bindGroupedKvDbManager(manager);
    bindFileStorageDbManager(manager);
    bindStorageBrowserDbManager(manager);
    bindUpdaterDbManager(manager);
}
