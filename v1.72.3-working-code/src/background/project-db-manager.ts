/**
 * Marco Extension — Project-Scoped Database Manager
 *
 * Each project gets its own SQLite .db file named by slug.
 * Managed via OPFS (primary) or chrome.storage.local (fallback).
 * See spec/12-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import type { Database as SqlJsDatabase } from "sql.js";
import initSqlJs from "./sqljs-loader";
import { loadOrCreateFromOpfs, saveToOpfs, loadFromStorage } from "./db-persistence";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SqlJs = typeof import("sql.js");
type PersistenceMode = "opfs" | "storage" | "memory";

export interface ProjectDbManager {
    getDb(): SqlJsDatabase;
    flush(): Promise<void>;
    drop(): Promise<void>;
    markDirty(): void;
}

/* ------------------------------------------------------------------ */
/*  ProjectSchema meta-table                                           */
/* ------------------------------------------------------------------ */

export const PROJECT_SCHEMA_TABLE = `
CREATE TABLE IF NOT EXISTS ProjectSchema (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    TableName    TEXT NOT NULL UNIQUE,
    ColumnDefs   TEXT NOT NULL,
    EndpointName TEXT,
    CreatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt    TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/* ------------------------------------------------------------------ */
/*  Module state                                                       */
/* ------------------------------------------------------------------ */

let SQL: SqlJs | null = null;
const projectDbs = new Map<string, SqlJsDatabase>();
const dirtySet = new Set<string>();
let persistenceMode: PersistenceMode = "memory";
let flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

const FLUSH_DEBOUNCE_MS = 5000;

/* ------------------------------------------------------------------ */
/*  SQL.js loader                                                      */
/* ------------------------------------------------------------------ */

async function ensureSqlJs(): Promise<SqlJs> {
    if (SQL) return SQL;
    const wasmUrl = chrome.runtime.getURL("wasm/sql-wasm.wasm");
    const wasmResponse = await fetch(wasmUrl);
    const wasmBinary = await wasmResponse.arrayBuffer();
    SQL = await initSqlJs({ wasmBinary });
    return SQL;
}

/* ------------------------------------------------------------------ */
/*  DB file naming                                                     */
/* ------------------------------------------------------------------ */

function dbFileName(slug: string): string {
    return `project-${slug}.db`;
}

function storageKey(slug: string): string {
    return `sqlite_project_${slug}`;
}

/* ------------------------------------------------------------------ */
/*  Init / Load                                                        */
/* ------------------------------------------------------------------ */

export async function initProjectDb(slug: string, extraSchema?: string): Promise<ProjectDbManager> {
    const existing = projectDbs.get(slug);
    if (existing) return buildProjectManager(slug);

    const sql = await ensureSqlJs();
    const schema = PROJECT_SCHEMA_TABLE + (extraSchema || "");

    const db = await tryLoadDb(sql, slug, schema);
    projectDbs.set(slug, db);

    return buildProjectManager(slug);
}

async function tryLoadDb(sql: SqlJs, slug: string, schema: string): Promise<SqlJsDatabase> {
    // Try OPFS first
    try {
        const root = await navigator.storage.getDirectory();
        const db = await loadOrCreateFromOpfs(sql, root, dbFileName(slug), schema);
        persistenceMode = "opfs";
        console.log(`[project-db] OPFS: ${slug}`);
        return db;
    } catch {
        // OPFS unavailable
    }

    // Try chrome.storage.local
    try {
        const db = await loadFromStorage(sql, storageKey(slug), schema);
        persistenceMode = "storage";
        console.log(`[project-db] storage: ${slug}`);
        return db;
    } catch {
        // storage failed
    }

    // In-memory fallback
    const db = new sql.Database();
    db.run(schema);
    persistenceMode = "memory";
    console.log(`[project-db] memory: ${slug}`);
    return db;
}

/* ------------------------------------------------------------------ */
/*  Get existing DB                                                    */
/* ------------------------------------------------------------------ */

export function getProjectDb(slug: string): SqlJsDatabase {
    const db = projectDbs.get(slug);
    if (!db) throw new Error(`[project-db] Not initialized: ${slug}`);
    return db;
}

export function hasProjectDb(slug: string): boolean {
    return projectDbs.has(slug);
}

/* ------------------------------------------------------------------ */
/*  Flush                                                              */
/* ------------------------------------------------------------------ */

export async function flushProjectDb(slug: string): Promise<void> {
    const db = projectDbs.get(slug);
    if (!db) return;

    if (persistenceMode === "opfs") {
        const root = await navigator.storage.getDirectory();
        await saveToOpfs(root, dbFileName(slug), db);
    } else if (persistenceMode === "storage") {
        await chrome.storage.local.set({
            [storageKey(slug)]: Array.from(db.export()),
        });
    }
    dirtySet.delete(slug);
}

function scheduleDirtyFlush(slug: string): void {
    dirtySet.add(slug);
    const existing = flushTimers.get(slug);
    if (existing) clearTimeout(existing);
    flushTimers.set(
        slug,
        setTimeout(() => void flushProjectDb(slug), FLUSH_DEBOUNCE_MS),
    );
}

/* ------------------------------------------------------------------ */
/*  Drop                                                               */
/* ------------------------------------------------------------------ */

export async function dropProjectDb(slug: string): Promise<void> {
    const db = projectDbs.get(slug);
    if (db) {
        db.close();
        projectDbs.delete(slug);
    }
    dirtySet.delete(slug);
    const timer = flushTimers.get(slug);
    if (timer) {
        clearTimeout(timer);
        flushTimers.delete(slug);
    }

    if (persistenceMode === "opfs") {
        try {
            const root = await navigator.storage.getDirectory();
            await root.removeEntry(dbFileName(slug));
        } catch { /* file may not exist */ }
    } else if (persistenceMode === "storage") {
        await chrome.storage.local.remove(storageKey(slug));
    }
    console.log(`[project-db] Dropped: ${slug}`);
}

/* ------------------------------------------------------------------ */
/*  Flush all dirty project DBs                                        */
/* ------------------------------------------------------------------ */

export async function flushAllProjectDbs(): Promise<void> {
    const slugs = Array.from(dirtySet);
    for (const slug of slugs) {
        await flushProjectDb(slug);
    }
}

/* ------------------------------------------------------------------ */
/*  Manager builder                                                    */
/* ------------------------------------------------------------------ */

function buildProjectManager(slug: string): ProjectDbManager {
    return {
        getDb: () => getProjectDb(slug),
        flush: () => flushProjectDb(slug),
        drop: () => dropProjectDb(slug),
        markDirty: () => scheduleDirtyFlush(slug),
    };
}
