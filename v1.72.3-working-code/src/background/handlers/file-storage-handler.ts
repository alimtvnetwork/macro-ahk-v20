/**
 * Marco Extension — Project File Storage Handler (Issue 50)
 *
 * CRUD operations for ProjectFiles table in logs.db.
 * Files are stored as base64-encoded text (BLOB workaround for sql.js).
 * All column names use PascalCase per database naming convention.
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";

let dbManager: DbManager | null = null;

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

export async function handleFileSave(msg: unknown): Promise<{ isOk: true; id: string }> {
    const { projectId, filename, mimeType, dataBase64 } = msg as {
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
    return { isOk: true, id };
}

export async function handleFileGet(msg: unknown): Promise<{ file: (FileEntry & { dataBase64: string }) | null }> {
    const { fileId } = msg as { fileId: string };
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

export async function handleFileList(msg: unknown): Promise<{ files: FileEntry[] }> {
    const { projectId } = msg as { projectId: string };
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

export async function handleFileDelete(msg: unknown): Promise<{ isOk: true }> {
    const { fileId } = msg as { fileId: string };
    const db = getDb();
    db.run("DELETE FROM ProjectFiles WHERE Id = ?", [fileId]);
    markDirty();
    return { isOk: true };
}
