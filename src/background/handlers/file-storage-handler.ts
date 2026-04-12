/**
 * Marco Extension — Project File Storage Handler (Issue 50)
 *
 * CRUD operations for ProjectFiles table in logs.db.
 * Files are stored as base64-encoded text (BLOB workaround for sql.js).
 * All column names use PascalCase per database naming convention.
 *
 * @see .lovable/memory/architecture/project-scoped-database.md — Project-scoped DB
 * @see spec/05-chrome-extension/19-opfs-persistence-strategy.md — OPFS persistence
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";
import type { MessageRequest } from "../../shared/messages";

let dbManager: DbManager | null = null;
let onFilesChanged: ((projectId: string) => void) | null = null;

/**
 * Registers a callback invoked when files change (save/delete).
 * Used by namespace-cache to invalidate without a circular import.
 */
export function onFileStorageChange(cb: (projectId: string) => void): void {
    onFilesChanged = cb;
}

export function bindFileStorageDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[file-storage] DbManager not bound");
    return dbManager.getLogsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

export interface FileEntry {
    id: string;
    projectId: string;
    filename: string;
    mimeType: string | null;
    size: number;
    createdAt: string;
}

export async function handleFileSave(msg: MessageRequest): Promise<{ isOk: true; id: string }> {
    const { projectId, filename, mimeType, dataBase64 } = msg as MessageRequest & {
        projectId: string;
        filename: string;
        mimeType?: string;
        dataBase64: string;
    };
    const db = getDb();
    const size = Math.round((dataBase64.length * 3) / 4);

    db.run(
        `INSERT INTO ProjectFiles (ProjectId, Filename, MimeType, Data, Size, CreatedAt)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [projectId, filename, mimeType || null, dataBase64, size],
    );
    const result = db.exec("SELECT last_insert_rowid()");
    const id = String(result[0].values[0][0]);
    markDirty();
    // Notify listeners (e.g. namespace cache) without circular import
    onFilesChanged?.(projectId);
    return { isOk: true, id };
}

export async function handleFileGet(msg: MessageRequest): Promise<{ file: (FileEntry & { dataBase64: string }) | null }> {
    const { fileId } = msg as MessageRequest & { fileId: string };
    const db = getDb();
    const result = db.exec(
        "SELECT Id, ProjectId, Filename, MimeType, Data, Size, CreatedAt FROM ProjectFiles WHERE Id = ?",
        [fileId],
    );

    if (result.length === 0 || result[0].values.length === 0) {
        return { file: null };
    }

    const row = result[0].values[0];
    return {
        file: {
            id: String(row[0]),
            projectId: String(row[1]),
            filename: String(row[2]),
            mimeType: row[3] ? String(row[3]) : null,
            dataBase64: String(row[4]),
            size: Number(row[5]),
            createdAt: String(row[6]),
        },
    };
}

export async function handleFileList(msg: MessageRequest): Promise<{ files: FileEntry[] }> {
    const { projectId } = msg as MessageRequest & { projectId: string };
    const db = getDb();
    const stmt = db.prepare(
        "SELECT Id, ProjectId, Filename, MimeType, Size, CreatedAt FROM ProjectFiles WHERE ProjectId = ? ORDER BY CreatedAt DESC",
    );
    stmt.bind([projectId]);
    const files: FileEntry[] = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        files.push({
            id: String(row.Id),
            projectId: String(row.ProjectId),
            filename: String(row.Filename),
            mimeType: row.MimeType ? String(row.MimeType) : null,
            size: Number(row.Size),
            createdAt: String(row.CreatedAt),
        });
    }
    stmt.free();
    return { files };
}

export async function handleFileDelete(msg: MessageRequest): Promise<{ isOk: true }> {
    const { fileId } = msg as MessageRequest & { fileId: string };
    const db = getDb();
    db.run("DELETE FROM ProjectFiles WHERE Id = ?", [fileId]);
    markDirty();
    // Note: fileId-based invalidation would need a projectId lookup;
    // the namespace cache will naturally rebuild on next project save.
    return { isOk: true };
}

/**
 * ✅ 15.4: Bulk file query — retrieves all files for a project in a single SQL query.
 * Replaces the handleFileList() + per-file handleFileGet() sequential pattern.
 * Returns filename + decoded data for up to `limit` files.
 */
export function getFilesByProject(
    projectId: string,
    limit: number = 50,
): Array<{ name: string; data: string }> {
    const db = getDb();
    const stmt = db.prepare(
        "SELECT Filename, Data FROM ProjectFiles WHERE ProjectId = ? ORDER BY CreatedAt DESC LIMIT ?",
    );
    stmt.bind([projectId, limit]);
    const files: Array<{ name: string; data: string }> = [];
    while (stmt.step()) {
        const row = stmt.getAsObject();
        const base64 = row.Data ? String(row.Data) : "";
        files.push({
            name: String(row.Filename),
            data: base64 ? atob(base64) : "",
        });
    }
    stmt.free();
    return files;
}
