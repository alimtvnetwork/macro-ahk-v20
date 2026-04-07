/**
 * Marco Extension — Database Manager
 *
 * OPFS-first SQLite persistence with chrome.storage.local fallback
 * and in-memory last resort.
 *
 * @see spec/05-chrome-extension/19-opfs-persistence-strategy.md — Persistence strategy
 * @see .lovable/memory/architecture/storage/sqlite-implementation.md — SQLite architecture
 * @see .lovable/memory/architecture/storage/db-manager-binding.md — Handler binding pattern
 */

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "./sqljs-loader";
import { migrateSchema } from "./schema-migration";
import { FULL_LOGS_SCHEMA, ERRORS_SCHEMA } from "./db-schemas";
import {
    flushToStorage,
    loadFromStorage,
    loadOrCreateFromOpfs,
    saveToOpfs,
} from "./db-persistence";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SqlJs = typeof import("sql.js");
type PersistenceMode = "opfs" | "storage" | "memory";

export interface DbManager {
    getLogsDb(): SqlJsDatabase;
    getErrorsDb(): SqlJsDatabase;
    getPersistenceMode(): PersistenceMode;
    flushIfDirty(): Promise<void>;
    markDirty(): void;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DB_NAMES = {
    logs: "marco-logs.db",
    errors: "marco-errors.db",
} as const;

const STORAGE_KEYS = {
    logs: "sqlite_logs_db",
    errors: "sqlite_errors_db",
} as const;

const FLUSH_DEBOUNCE_MS = 5000;

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let SQL: SqlJs | null = null;
let logsDb: SqlJsDatabase | null = null;
let errorsDb: SqlJsDatabase | null = null;
let persistenceMode: PersistenceMode = "memory";
let isDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let isInitialized = false;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/** Loads sql.js WASM binary from the extension bundle. */
async function loadSqlJs(): Promise<SqlJs> {
    // Service workers have no `document`, so sql.js's default locateFile
    // (which uses document.currentScript) throws ReferenceError.
    // We fetch the WASM binary ourselves and pass it directly.
    const wasmUrl = chrome.runtime.getURL("wasm/sql-wasm.wasm");
    let wasmResponse: Response;
    try {
        wasmResponse = await fetch(wasmUrl);
    } catch (err) {
        throw new Error(
            `Failed to fetch WASM binary at "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" exists in the extension dist folder. ` +
            `Original error: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
    if (!wasmResponse.ok) {
        throw new Error(
            `WASM fetch returned HTTP ${wasmResponse.status} for "${wasmUrl}". ` +
            `Ensure "wasm/sql-wasm.wasm" is listed in manifest web_accessible_resources.`,
        );
    }
    const wasmBinary = await wasmResponse.arrayBuffer();

    return initSqlJs({ wasmBinary });
}

/** Attempts to load or create a DB from OPFS. */
async function tryOpfsInit(): Promise<boolean> {
    try {
        const root = await navigator.storage.getDirectory();

        logsDb = await loadOrCreateFromOpfs(SQL!, root, DB_NAMES.logs, FULL_LOGS_SCHEMA);
        errorsDb = await loadOrCreateFromOpfs(SQL!, root, DB_NAMES.errors, ERRORS_SCHEMA);
        persistenceMode = "opfs";

        console.log("[db-manager] OPFS persistence active");
        return true;
    } catch (err) {
        console.error(`[db-manager] OPFS unavailable\n  Path: navigator.storage.getDirectory() → OPFS root\n  Missing: SQLite database files (logs + errors)\n  Reason: ${err instanceof Error ? err.message : String(err)} — OPFS may not be supported or quota exceeded`, err);
        return false;
    }
}

/** Attempts to load or create a DB from chrome.storage.local. */
async function tryStorageInit(): Promise<boolean> {
    try {
        logsDb = await loadFromStorage(SQL!, STORAGE_KEYS.logs, FULL_LOGS_SCHEMA);
        errorsDb = await loadFromStorage(SQL!, STORAGE_KEYS.errors, ERRORS_SCHEMA);
        persistenceMode = "storage";

        console.log("[db-manager] storage.local persistence active");
        return true;
    } catch (err) {
        console.error("[db-manager] storage.local failed:", err);
        return false;
    }
}

/** Creates in-memory databases as a last resort. */
function initInMemory(): void {
    logsDb = new SQL!.Database();
    logsDb.run(FULL_LOGS_SCHEMA);

    errorsDb = new SQL!.Database();
    errorsDb.run(ERRORS_SCHEMA);
    persistenceMode = "memory";

    console.log("[db-manager] In-memory only (no persistence)");
}

/** Initializes databases with OPFS → storage → memory fallback. */
export async function initDatabases(): Promise<DbManager> {
    if (isInitialized) {
        return buildManager();
    }

    SQL = await loadSqlJs();
    await initWithFallback();
    await migrateSchema(logsDb!, errorsDb!);

    isInitialized = true;
    return buildManager();
}

/** Tries OPFS, then storage, then in-memory. */
async function initWithFallback(): Promise<void> {
    const isOpfsReady = await tryOpfsInit();

    if (isOpfsReady) {
        return;
    }

    const isStorageReady = await tryStorageInit();
    const isFallbackNeeded = isStorageReady === false;

    if (isFallbackNeeded) {
        initInMemory();
    }
}

/* ------------------------------------------------------------------ */
/*  Flush Logic                                                        */
/* ------------------------------------------------------------------ */

/** Marks databases as needing a flush, debounced. */
function markDirty(): void {
    isDirty = true;
    const hasExistingTimer = flushTimer !== null;

    if (hasExistingTimer) {
        clearTimeout(flushTimer!);
    }
    flushTimer = setTimeout(() => void flushIfDirty(), FLUSH_DEBOUNCE_MS);
}

/** Flushes databases to persistent storage if dirty. */
async function flushIfDirty(): Promise<void> {
    const isClean = isDirty === false;

    if (isClean) {
        return;
    }
    isDirty = false;

    await flushByMode();
}

/** Dispatches flush to the correct persistence backend. */
async function flushByMode(): Promise<void> {
    const isOpfs = persistenceMode === "opfs";

    if (isOpfs) {
        return flushToOpfs();
    }

    const isStorage = persistenceMode === "storage";

    if (isStorage) {
        await flushToStorage({
            logsDb: logsDb!,
            errorsDb: errorsDb!,
            logsKey: STORAGE_KEYS.logs,
            errorsKey: STORAGE_KEYS.errors,
        });
    }
}

/** Flushes both databases to OPFS. */
async function flushToOpfs(): Promise<void> {
    const root = await navigator.storage.getDirectory();

    await saveToOpfs(root, DB_NAMES.logs, logsDb!);
    await saveToOpfs(root, DB_NAMES.errors, errorsDb!);
}

/* ------------------------------------------------------------------ */
/*  Public Manager                                                     */
/* ------------------------------------------------------------------ */

/** Builds the public DbManager interface. */
function buildManager(): DbManager {
    return {
        getLogsDb: () => logsDb!,
        getErrorsDb: () => errorsDb!,
        getPersistenceMode: () => persistenceMode,
        flushIfDirty,
        markDirty,
    };
}
