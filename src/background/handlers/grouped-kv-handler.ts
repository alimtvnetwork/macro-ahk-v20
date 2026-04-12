/**
 * Marco Extension — Grouped Key-Value Handler (Issue 60)
 *
 * CRUD operations for GroupedKv table in logs.db.
 * All column names use PascalCase per database naming convention.
 *
 * @see .lovable/memory/architecture/project-scoped-database.md — Project-scoped DB
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";
import type { MessageRequest } from "../../shared/messages";

let dbManager: DbManager | null = null;

export function bindGroupedKvDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[grouped-kv] DbManager not bound");
    return dbManager.getLogsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

export async function handleGkvGet(msg: MessageRequest): Promise<{ value: string | null }> {
    const { group, key } = msg as MessageRequest & { group: string; key: string };
    const db = getDb();
    const result = db.exec(
        "SELECT Value FROM GroupedKv WHERE GroupName = ? AND Key = ?",
        [group, key],
    );
    const value =
        result.length > 0 && result[0].values.length > 0
            ? String(result[0].values[0][0])
            : null;
    return { value };
}

export async function handleGkvSet(msg: MessageRequest): Promise<{ isOk: true }> {
    const { group, key, value } = msg as MessageRequest & { group: string; key: string; value?: string };
    const db = getDb();
    db.run(
        `INSERT OR REPLACE INTO GroupedKv (GroupName, Key, Value, UpdatedAt) VALUES (?, ?, ?, datetime('now'))`,
        [group, key, value ?? ""],
    );
    markDirty();
    return { isOk: true };
}

export async function handleGkvDelete(msg: MessageRequest): Promise<{ isOk: true }> {
    const { group, key } = msg as MessageRequest & { group: string; key: string };
    const db = getDb();
    db.run("DELETE FROM GroupedKv WHERE GroupName = ? AND Key = ?", [group, key]);
    markDirty();
    return { isOk: true };
}

export async function handleGkvList(
    msg: MessageRequest,
): Promise<{ entries: Array<{ key: string; value: string }> }> {
    const { group } = msg as MessageRequest & { group: string };
    const db = getDb();
    const stmt = db.prepare(
        "SELECT Key, Value FROM GroupedKv WHERE GroupName = ? ORDER BY Key ASC",
    );
    stmt.bind([group]);
    const entries: Array<{ key: string; value: string }> = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        entries.push({ key: String(row.Key), value: String(row.Value) });
    }
    stmt.free();
    return { entries };
}

export async function handleGkvClearGroup(msg: MessageRequest): Promise<{ isOk: true }> {
    const { group } = msg as MessageRequest & { group: string };
    const db = getDb();
    db.run("DELETE FROM GroupedKv WHERE GroupName = ?", [group]);
    markDirty();
    return { isOk: true };
}
