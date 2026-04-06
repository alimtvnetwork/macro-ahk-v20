/**
 * Marco Extension — Database Persistence Helpers
 *
 * OPFS and chrome.storage.local read/write operations.
 * Extracted from db-manager.ts to stay under 200-line file limit.
 */

import type { Database as SqlJsDatabase } from "sql.js";

type SqlJs = typeof import("sql.js");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Applies idempotent schema statements (CREATE TABLE/VIEW/INDEX IF NOT EXISTS)
 * to an existing database. This ensures that views and tables added after the
 * database was first created are available on pre-existing databases.
 *
 * Bug fix: PromptsDetails view was never created on databases that existed
 * before the view was added to FULL_LOGS_SCHEMA, because loadOrCreateFromOpfs
 * and loadFromStorage skipped schema application for existing databases.
 */
function ensureIdempotentSchema(db: SqlJsDatabase, schema: string): void {
    try {
        db.run(schema);
    } catch (err) {
        // Schema may contain statements that conflict with existing objects
        // (e.g., column already exists). Fall back to statement-by-statement.
        const statements = schema
            .split(";")
            .map(s => s.trim())
            .filter(s => s.length > 0);
        for (const stmt of statements) {
            try {
                db.run(stmt);
            } catch {
                // Individual statement failed — likely already exists, safe to skip
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  OPFS                                                               */
/* ------------------------------------------------------------------ */

/** Loads an existing DB file from OPFS, or creates a fresh one. */
export async function loadOrCreateFromOpfs(
    SQL: SqlJs,
    root: FileSystemDirectoryHandle,
    name: string,
    schema: string,
): Promise<SqlJsDatabase> {
    const existingBuffer = await readOpfsFile(root, name);
    const hasExisting = existingBuffer !== null;

    if (hasExisting) {
        const db = new SQL.Database(new Uint8Array(existingBuffer));
        // Ensure views and IF NOT EXISTS objects are created on pre-existing DBs
        ensureIdempotentSchema(db, schema);
        return db;
    }

    const db = new SQL.Database();
    db.run(schema);
    await saveToOpfs(root, name, db);
    return db;
}

/** Reads a file from OPFS, returning null if it doesn't exist. */
async function readOpfsFile(
    root: FileSystemDirectoryHandle,
    name: string,
): Promise<ArrayBuffer | null> {
    try {
        const handle = await root.getFileHandle(name, { create: false });
        const file = await handle.getFile();
        const buffer = await file.arrayBuffer();
        const hasContent = buffer.byteLength > 0;

        return hasContent ? buffer : null;
    } catch {
        return null;
    }
}

/** Writes a database to an OPFS file. */
export async function saveToOpfs(
    root: FileSystemDirectoryHandle,
    name: string,
    db: SqlJsDatabase,
): Promise<void> {
    const handle = await root.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();

    await writable.write(db.export());
    await writable.close();
}

/* ------------------------------------------------------------------ */
/*  chrome.storage.local                                               */
/* ------------------------------------------------------------------ */

/** Loads a DB from chrome.storage.local by key. */
export async function loadFromStorage(
    SQL: SqlJs,
    key: string,
    schema: string,
): Promise<SqlJsDatabase> {
    const stored = await chrome.storage.local.get(key);
    const hasStored = stored[key] !== undefined;

    if (hasStored) {
        const db = new SQL.Database(new Uint8Array(stored[key]));
        // Ensure views and IF NOT EXISTS objects are created on pre-existing DBs
        ensureIdempotentSchema(db, schema);
        return db;
    }

    const db = new SQL.Database();
    db.run(schema);
    return db;
}

/** Options for flushing databases to chrome.storage.local. */
interface FlushStorageOptions {
    logsDb: SqlJsDatabase;
    errorsDb: SqlJsDatabase;
    logsKey: string;
    errorsKey: string;
}

/** Saves databases to chrome.storage.local. */
export async function flushToStorage(options: FlushStorageOptions): Promise<void> {
    await chrome.storage.local.set({
        [options.logsKey]: Array.from(options.logsDb.export()),
        [options.errorsKey]: Array.from(options.errorsDb.export()),
    });
}
