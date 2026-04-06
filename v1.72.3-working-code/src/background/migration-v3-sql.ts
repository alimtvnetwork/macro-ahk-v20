/**
 * Marco Extension — Schema Migration v3 SQL
 *
 * Converts Sessions table from TEXT PRIMARY KEY to INTEGER PRIMARY KEY AUTOINCREMENT.
 * Uses the rename-recreate-copy pattern since SQLite cannot ALTER PRIMARY KEY.
 *
 * All column names use PascalCase per database naming convention.
 * See: spec/03-imported-spec/03-coding-guidelines/database-id-convention.md
 */

import type { Database as SqlJsDatabase } from "sql.js";

/* ------------------------------------------------------------------ */
/*  Sessions TEXT→INTEGER PK (logs.db)                                 */
/* ------------------------------------------------------------------ */

/**
 * Detects whether the Sessions table has a TEXT primary key.
 * Returns true if Sessions.id is TEXT (legacy), false if INTEGER (already migrated).
 */
export function sessionsHasTextPk(db: SqlJsDatabase): boolean {
    try {
        const result = db.exec("PRAGMA table_info(Sessions)");
        if (result.length === 0) return false;

        const cols = result[0].columns;
        const nameIdx = cols.indexOf("name");
        const typeIdx = cols.indexOf("type");

        for (const row of result[0].values) {
            if (row[nameIdx] === "id" && String(row[typeIdx]).toUpperCase() === "TEXT") {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

/**
 * Migrates Sessions from TEXT PK to INTEGER AUTOINCREMENT PK.
 * Old TEXT ids are discarded — new integer IDs are auto-assigned.
 * The Logs table's SessionId references are updated to match.
 */
export function migrateSessionsToIntegerPk(db: SqlJsDatabase): void {
    // 1. Rename old table
    db.run("ALTER TABLE Sessions RENAME TO Sessions_old");

    // 2. Create new table with INTEGER PK and PascalCase columns
    db.run(`
        CREATE TABLE Sessions (
            Id        INTEGER PRIMARY KEY AUTOINCREMENT,
            StartedAt TEXT NOT NULL,
            EndedAt   TEXT,
            Version   TEXT NOT NULL,
            UserAgent TEXT,
            Notes     TEXT
        )
    `);

    // 3. Copy data — handle both snake_case and PascalCase source columns
    let oldRows;
    try {
        oldRows = db.exec("SELECT id, started_at, ended_at, version, user_agent, notes FROM Sessions_old ORDER BY started_at");
    } catch {
        oldRows = db.exec("SELECT Id, StartedAt, EndedAt, Version, UserAgent, Notes FROM Sessions_old ORDER BY StartedAt");
    }

    if (oldRows.length > 0 && oldRows[0].values.length > 0) {
        const idMapping = new Map<string, number>();

        for (const row of oldRows[0].values) {
            const oldId = String(row[0]);
            db.run(
                "INSERT INTO Sessions (StartedAt, EndedAt, Version, UserAgent, Notes) VALUES (?, ?, ?, ?, ?)",
                [row[1], row[2], row[3], row[4], row[5]]
            );
            const newIdResult = db.exec("SELECT last_insert_rowid()");
            const newId = Number(newIdResult[0].values[0][0]);
            idMapping.set(oldId, newId);
        }

        // 4. Update Logs.SessionId (or session_id) references
        for (const [oldId, newId] of idMapping) {
            try {
                db.run("UPDATE Logs SET SessionId = ? WHERE SessionId = ?", [newId, oldId]);
            } catch {
                db.run("UPDATE Logs SET session_id = ? WHERE session_id = ?", [newId, oldId]);
            }
        }
    }

    // 5. Drop old table
    db.run("DROP TABLE Sessions_old");
}

/* ------------------------------------------------------------------ */
/*  Prompts slug column (logs.db)                                      */
/* ------------------------------------------------------------------ */

/** Adds `Slug TEXT` column to Prompts if it doesn't exist, with a separate unique index. */
export const V3_PROMPTS_SLUG = [
    "ALTER TABLE Prompts ADD COLUMN Slug TEXT",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_slug ON Prompts(Slug)",
];
