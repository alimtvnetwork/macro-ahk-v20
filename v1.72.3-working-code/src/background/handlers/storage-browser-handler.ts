/**
 * Marco Extension — Storage Browser Handler
 *
 * Provides CRUD operations for the SQLite database tables,
 * powering the Options page "Storage" viewer.
 * Tables and views are listed separately for UI clarity.
 */

import { type MessageRequest } from "../../shared/messages";
import type { DbManager } from "../db-manager";
import type { Database as SqlJsDatabase } from "sql.js";
import { collectRows } from "./logging-queries";
import { reseedPrompts } from "./prompt-handler";

/* ------------------------------------------------------------------ */
/*  DbManager binding                                                  */
/* ------------------------------------------------------------------ */

let dbManager: DbManager | null = null;

export function bindStorageBrowserDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[storage-browser] DbManager not bound");
    return dbManager.getLogsDb();
}

function getErrorsDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[storage-browser] DbManager not bound");
    return dbManager.getErrorsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Tables allowed for browsing (defense-in-depth). */
const BROWSABLE_TABLES = new Set([
    "Sessions", "Logs", "Errors", "Prompts", "PromptsCategory", "PromptsToCategory",
    "ProjectKv", "ProjectFiles", "Scripts",
]);

/** Views allowed for browsing. */
const BROWSABLE_VIEWS = new Set([
    "PromptsDetails",
]);

/** Which database each table/view lives in. */
const TABLE_DB_MAP: Record<string, "logs" | "errors"> = {
    Sessions: "logs",
    Logs: "logs",
    Prompts: "logs",
    PromptsCategory: "logs",
    PromptsToCategory: "logs",
    ProjectKv: "logs",
    ProjectFiles: "logs",
    Scripts: "logs",
    Errors: "errors",
    PromptsDetails: "logs",
};

/** Primary key columns per table. */
const PRIMARY_KEYS: Record<string, string[]> = {
    Sessions: ["id"],
    Logs: ["id"],
    Errors: ["id"],
    Prompts: ["id"],
    PromptsCategory: ["id"],
    PromptsToCategory: ["id"],
    ProjectKv: ["ProjectId", "Key"],
    ProjectFiles: ["id"],
    Scripts: ["id"],
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function assertValidTableOrView(name: string): void {
    if (!BROWSABLE_TABLES.has(name) && !BROWSABLE_VIEWS.has(name)) {
        throw new Error(`[Storage] "${name}" not in allowlist`);
    }
}

function getDbForTable(table: string): SqlJsDatabase {
    const dbType = TABLE_DB_MAP[table] ?? "logs";
    return dbType === "errors" ? getErrorsDb() : getDb();
}

/* ------------------------------------------------------------------ */
/*  Handlers                                                           */
/* ------------------------------------------------------------------ */

/** Lists all browsable tables and views with row counts, plus total DB size. */
export async function handleStorageListTables(): Promise<{
    tables: Array<{ name: string; rowCount: number; primaryKeys: string[]; isView: boolean }>;
    dbSizeBytes: number;
}> {
    const tables: Array<{ name: string; rowCount: number; primaryKeys: string[]; isView: boolean }> = [];

    for (const name of BROWSABLE_TABLES) {
        try {
            const db = getDbForTable(name);
            const result = db.exec(`SELECT COUNT(*) as cnt FROM ${name}`);
            const rowCount = result.length > 0 && result[0].values.length > 0
                ? (result[0].values[0][0] as number)
                : 0;
            tables.push({ name, rowCount, primaryKeys: PRIMARY_KEYS[name] ?? ["id"], isView: false });
        } catch {
            tables.push({ name, rowCount: 0, primaryKeys: PRIMARY_KEYS[name] ?? ["id"], isView: false });
        }
    }

    for (const name of BROWSABLE_VIEWS) {
        try {
            const db = getDbForTable(name);
            const result = db.exec(`SELECT COUNT(*) as cnt FROM ${name}`);
            const rowCount = result.length > 0 && result[0].values.length > 0
                ? (result[0].values[0][0] as number)
                : 0;
            tables.push({ name, rowCount, primaryKeys: [], isView: true });
        } catch {
            tables.push({ name, rowCount: 0, primaryKeys: [], isView: true });
        }
    }

    const dbSizeBytes = computeDbSize();

    return { tables, dbSizeBytes };
}

/** Computes the combined size of all SQLite databases in bytes. */
function computeDbSize(): number {
    let totalBytes = 0;
    try {
        const logsData = getDb().export();
        totalBytes += logsData.byteLength;
    } catch { /* ignore */ }
    try {
        const errorsData = getErrorsDb().export();
        totalBytes += errorsData.byteLength;
    } catch { /* ignore */ }
    return totalBytes;
}

/** Returns column info for a table or view using PRAGMA. */
export async function handleStorageGetSchema(
    message: MessageRequest,
): Promise<{ columns: Array<{ name: string; type: string; notnull: boolean; pk: boolean }> }> {
    const { table } = message as { table: string };
    assertValidTableOrView(table);

    const db = getDbForTable(table);

    // For views, use PRAGMA table_xinfo which works on views too
    const isView = BROWSABLE_VIEWS.has(table);
    const pragmaCmd = isView ? `PRAGMA table_xinfo(${table})` : `PRAGMA table_info(${table})`;
    const result = db.exec(pragmaCmd);

    if (result.length === 0) return { columns: [] };

    const columns = result[0].values.map((row) => ({
        name: row[1] as string,
        type: (row[2] as string) || "TEXT",
        notnull: (row[3] as number) === 1,
        pk: isView ? false : (row[5] as number) > 0,
    }));

    return { columns };
}

/** Paginated query for table/view rows. */
export async function handleStorageQueryTable(
    message: MessageRequest,
): Promise<{ rows: unknown[]; total: number; columns: string[] }> {
    const { table, offset = 0, limit = 50 } = message as {
        table: string; offset?: number; limit?: number;
    };
    assertValidTableOrView(table);

    const db = getDbForTable(table);

    const countResult = db.exec(`SELECT COUNT(*) FROM ${table}`);
    const total = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    const stmt = db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`);
    stmt.bind([limit, offset]);
    const rows = collectRows(stmt);

    // For views, get columns from the query result or table_xinfo
    const isView = BROWSABLE_VIEWS.has(table);
    const pragmaCmd = isView ? `PRAGMA table_xinfo(${table})` : `PRAGMA table_info(${table})`;
    const pragmaResult = db.exec(pragmaCmd);
    const columns = pragmaResult.length > 0
        ? pragmaResult[0].values.map((r) => r[1] as string)
        : [];

    return { rows, total, columns };
}

/** Updates a row by primary key. */
export async function handleStorageUpdateRow(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const { table, primaryKey, updates } = message as {
        table: string;
        primaryKey: Record<string, unknown>;
        updates: Record<string, unknown>;
    };
    // Views are read-only
    if (BROWSABLE_VIEWS.has(table)) {
        throw new Error(`[Storage] Cannot update view "${table}"`);
    }
    assertValidTableOrView(table);

    const db = getDbForTable(table);
    const setClauses: string[] = [];
    const wheresClauses: string[] = [];
    const params: unknown[] = [];

    for (const [col, val] of Object.entries(updates)) {
        setClauses.push(`${col} = ?`);
        params.push(val);
    }

    for (const [col, val] of Object.entries(primaryKey)) {
        wheresClauses.push(`${col} = ?`);
        params.push(val);
    }

    if (setClauses.length === 0 || wheresClauses.length === 0) {
        throw new Error("[Storage] Missing SET or WHERE clause");
    }

    const sql = `UPDATE ${table} SET ${setClauses.join(", ")} WHERE ${wheresClauses.join(" AND ")}`;
    db.run(sql, params);
    markDirty();

    return { isOk: true };
}

/** Deletes a row by primary key. */
export async function handleStorageDeleteRow(
    message: MessageRequest,
): Promise<{ isOk: true }> {
    const { table, primaryKey } = message as {
        table: string;
        primaryKey: Record<string, unknown>;
    };
    if (BROWSABLE_VIEWS.has(table)) {
        throw new Error(`[Storage] Cannot delete from view "${table}"`);
    }
    assertValidTableOrView(table);

    const db = getDbForTable(table);
    const wheresClauses: string[] = [];
    const params: unknown[] = [];

    for (const [col, val] of Object.entries(primaryKey)) {
        wheresClauses.push(`${col} = ?`);
        params.push(val);
    }

    if (wheresClauses.length === 0) {
        throw new Error("[Storage] Missing WHERE clause for delete");
    }

    const sql = `DELETE FROM ${table} WHERE ${wheresClauses.join(" AND ")}`;
    db.run(sql, params);
    markDirty();

    return { isOk: true };
}

/** Clears all rows from a single table. */
export async function handleStorageClearTable(
    message: MessageRequest,
): Promise<{ isOk: true; table: string; deleted: number }> {
    const { table } = message as { table: string };
    if (BROWSABLE_VIEWS.has(table)) {
        throw new Error(`[Storage] Cannot clear view "${table}"`);
    }
    assertValidTableOrView(table);

    const db = getDbForTable(table);
    const countResult = db.exec(`SELECT COUNT(*) FROM ${table}`);
    const deleted = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0;

    db.run(`DELETE FROM ${table}`);
    markDirty();

    return { isOk: true, table, deleted };
}

/** Clears all rows from all browsable tables. */
export async function handleStorageClearAll(): Promise<{ isOk: true; cleared: string[] }> {
    const cleared: string[] = [];

    for (const table of BROWSABLE_TABLES) {
        try {
            const db = getDbForTable(table);
            db.run(`DELETE FROM ${table}`);
            cleared.push(table);
        } catch {
            // Table may not exist
        }
    }

    markDirty();
    return { isOk: true, cleared };
}

/** Clears all tables and re-seeds from JSON/defaults. */
export async function handleStorageReseed(): Promise<{ isOk: true; seeded: string[] }> {
    // First clear all
    await handleStorageClearAll();

    // Re-seed prompts from bundled defaults
    await reseedPrompts();

    return { isOk: true, seeded: ["Prompts", "PromptsCategory", "PromptsToCategory"] };
}
