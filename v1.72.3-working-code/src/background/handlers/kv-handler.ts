/**
 * Marco Extension — Project-Scoped Key-Value Handler (Issue 50)
 *
 * CRUD operations for ProjectKv table in logs.db.
 * All column names use PascalCase per database naming convention.
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";

let dbManager: DbManager | null = null;

export function bindKvDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[kv] DbManager not bound");
    return dbManager.getLogsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

export async function handleKvGet(msg: unknown): Promise<{ value: string | null }> {
    const { projectId, key } = msg as { projectId: string; key: string };
    const db = getDb();
    const result = db.exec("SELECT Value FROM ProjectKv WHERE ProjectId = ? AND Key = ?", [projectId, key]);
    const value = result.length > 0 && result[0].values.length > 0
        ? String(result[0].values[0][0])
        : null;
    return { value };
}

export async function handleKvSet(msg: unknown): Promise<{ isOk: true }> {
    const { projectId, key, value } = msg as { projectId: string; key: string; value: string };
    const db = getDb();
    db.run(
        `INSERT OR REPLACE INTO ProjectKv (ProjectId, Key, Value, UpdatedAt) VALUES (?, ?, ?, datetime('now'))`,
        [projectId, key, typeof value === "string" ? value : JSON.stringify(value)],
    );
    markDirty();
    return { isOk: true };
}

export async function handleKvDelete(msg: unknown): Promise<{ isOk: true }> {
    const { projectId, key } = msg as { projectId: string; key: string };
    const db = getDb();
    db.run("DELETE FROM ProjectKv WHERE ProjectId = ? AND Key = ?", [projectId, key]);
    markDirty();
    return { isOk: true };
}

export async function handleKvList(msg: unknown): Promise<{ entries: Array<{ key: string; value: string }> }> {
    const { projectId } = msg as { projectId: string };
    const db = getDb();
    const stmt = db.prepare("SELECT Key, Value FROM ProjectKv WHERE ProjectId = ? ORDER BY Key ASC");
    stmt.bind([projectId]);
    const entries: Array<{ key: string; value: string }> = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        entries.push({ key: String(row.Key), value: String(row.Value) });
    }
    stmt.free();
    return { entries };
}
