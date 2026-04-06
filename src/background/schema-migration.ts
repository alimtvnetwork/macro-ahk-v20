/**
 * Marco Extension — Schema Migration Runner
 *
 * Sequential, crash-safe schema migrations for SQLite databases.
 * See spec 06-logging-architecture.md §Schema Migration.
 */

import type { Database as SqlJsDatabase } from "sql.js";
import { V2_LOG_COLUMNS, V2_ERROR_COLUMNS, V2_ERROR_CODES } from "./migration-v2-sql";
import {
    sessionsHasTextPk,
    migrateSessionsToIntegerPk,
    V3_PROMPTS_SLUG,
} from "./migration-v3-sql";
import {
    V4_SESSIONS_RENAMES,
    V4_LOGS_RENAMES,
    V4_ERRORS_RENAMES,
    V4_PROMPTS_RENAMES,
    V4_PROMPTS_CATEGORY_RENAMES,
    V4_PROMPTS_TO_CATEGORY_RENAMES,
    V4_PROJECT_KV_RENAMES,
    V4_PROJECT_FILES_RENAMES,
    V4_SCRIPTS_RENAMES,
    V4_RECREATE_PROMPTS_VIEW,
} from "./migration-v4-sql";
import { getV5Statements } from "./migration-v5-sql";
import { getV6Statements } from "./migration-v6-sql";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/** A single schema migration definition. */
export interface Migration {
    version: number;
    description: string;
    up: (logsDb: SqlJsDatabase, errorsDb: SqlJsDatabase) => void;
    down: (logsDb: SqlJsDatabase, errorsDb: SqlJsDatabase) => void;
}

/** Result of running all pending migrations. */
export interface MigrationResult {
    fromVersion: number;
    toVersion: number;
    applied: number;
    failed: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SCHEMA_VERSION_KEY = "marco_schema_version";
const CURRENT_SCHEMA_VERSION = 5;

/* ------------------------------------------------------------------ */
/*  Migration Registry                                                 */
/* ------------------------------------------------------------------ */

const MIGRATIONS: Migration[] = [
    {
        version: 2,
        description: "Add project/script/config context columns and new error codes",
        up: applyV2Up,
        down: applyV2Down,
    },
    {
        version: 3,
        description: "Convert Sessions TEXT PK to INTEGER AUTOINCREMENT; add Prompts slug column",
        up: applyV3Up,
        down: applyV3Down,
    },
    {
        version: 4,
        description: "Rename all snake_case columns to PascalCase",
        up: applyV4Up,
        down: applyV4Down,
    },
    {
        version: 5,
        description: "Add Updater tables (UpdaterInfo, UpdaterCategory, UpdaterToCategory, UpdaterEndpoints, UpdaterSteps, UpdaterDetails view)",
        up: applyV5Up,
        down: applyV5Down,
    },
    {
        version: 6,
        description: "Add changelog, caching, auto-check, confirm settings to UpdaterInfo; create UpdateSettings table",
        up: applyV6Up,
        down: applyV6Down,
    },
];

/* ------------------------------------------------------------------ */
/*  Migration v2 — Context Columns                                     */
/* ------------------------------------------------------------------ */

function applyV2Up(logsDb: SqlJsDatabase, errorsDb: SqlJsDatabase): void {
    runIgnoringDuplicates(logsDb, V2_LOG_COLUMNS);
    runIgnoringDuplicates(errorsDb, V2_ERROR_COLUMNS);
    runIgnoringDuplicates(errorsDb, V2_ERROR_CODES);
}

function applyV2Down(_logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    // No-op — SQLite cannot DROP COLUMN safely
}

/* ------------------------------------------------------------------ */
/*  Migration v3 — INTEGER AUTOINCREMENT PKs                           */
/* ------------------------------------------------------------------ */

function applyV3Up(logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    if (sessionsHasTextPk(logsDb)) {
        migrateSessionsToIntegerPk(logsDb);
        console.log("[migration] v3: Converted Sessions TEXT PK → INTEGER AUTOINCREMENT");
    }
    runIgnoringDuplicates(logsDb, V3_PROMPTS_SLUG);
}

function applyV3Down(_logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    // No-op
}

/* ------------------------------------------------------------------ */
/*  Migration v4 — PascalCase Column Rename                            */
/* ------------------------------------------------------------------ */

function applyV4Up(logsDb: SqlJsDatabase, errorsDb: SqlJsDatabase): void {
    // Rename columns in logs.db tables
    runIgnoringDuplicates(logsDb, V4_SESSIONS_RENAMES);
    runIgnoringDuplicates(logsDb, V4_LOGS_RENAMES);
    runIgnoringDuplicates(logsDb, V4_PROMPTS_RENAMES);
    runIgnoringDuplicates(logsDb, V4_PROMPTS_CATEGORY_RENAMES);
    runIgnoringDuplicates(logsDb, V4_PROMPTS_TO_CATEGORY_RENAMES);
    runIgnoringDuplicates(logsDb, V4_PROJECT_KV_RENAMES);
    runIgnoringDuplicates(logsDb, V4_PROJECT_FILES_RENAMES);
    runIgnoringDuplicates(logsDb, V4_SCRIPTS_RENAMES);

    // Rename columns in errors.db
    runIgnoringDuplicates(errorsDb, V4_ERRORS_RENAMES);

    // Recreate PromptsDetails view with PascalCase column references
    runIgnoringDuplicates(logsDb, V4_RECREATE_PROMPTS_VIEW);

    console.log("[migration] v4: Renamed all columns to PascalCase");
}

function applyV4Down(_logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    // No-op — reverse rename would be destructive
}

/* ------------------------------------------------------------------ */
/*  Migration v5 — Updater Tables                                      */
/*  See: spec/05-chrome-extension/58-updater-system.md                 */
/* ------------------------------------------------------------------ */

function applyV5Up(logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    runIgnoringDuplicates(logsDb, getV5Statements());
    console.log("[migration] v5: Created Updater tables and view");
}

function applyV5Down(_logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    // No-op — DROP TABLE is destructive
}

/* ------------------------------------------------------------------ */
/*  Migration v6 — Updater Settings & Caching                          */
/* ------------------------------------------------------------------ */

function applyV6Up(logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    runIgnoringDuplicates(logsDb, getV6Statements());
    // Seed default global settings row if none exists
    try {
        const existing = logsDb.exec("SELECT COUNT(*) FROM UpdateSettings");
        if (existing.length > 0 && (existing[0].values[0][0] as number) === 0) {
            logsDb.run("INSERT INTO UpdateSettings (AutoCheckIntervalMinutes, HasUserConfirmBeforeUpdate, HasChangelogFromVersionInfo, CacheExpiryMinutes) VALUES (1440, 0, 1, 10080)");
        }
    } catch {
        // Table may not exist yet in edge cases
    }
    console.log("[migration] v6: Added updater settings, caching, and changelog columns");
}

function applyV6Down(_logsDb: SqlJsDatabase, _errorsDb: SqlJsDatabase): void {
    // No-op — ALTER TABLE ADD COLUMN is not reversible in SQLite
}

/* ------------------------------------------------------------------ */
/*  Runner                                                             */
/* ------------------------------------------------------------------ */

export async function migrateSchema(
    logsDb: SqlJsDatabase,
    errorsDb: SqlJsDatabase,
): Promise<MigrationResult> {
    const fromVersion = await readSchemaVersion();
    const isUpToDate = fromVersion >= CURRENT_SCHEMA_VERSION;

    if (isUpToDate) {
        return { fromVersion, toVersion: fromVersion, applied: 0, failed: false };
    }

    const pending = getPendingMigrations(fromVersion);
    return applyMigrations(pending, logsDb, errorsDb, fromVersion);
}

async function readSchemaVersion(): Promise<number> {
    const stored = await chrome.storage.local.get(SCHEMA_VERSION_KEY);
    return (stored[SCHEMA_VERSION_KEY] as number) ?? 1;
}

function getPendingMigrations(currentVersion: number): Migration[] {
    return MIGRATIONS
        .filter((m) => m.version > currentVersion)
        .sort((a, b) => a.version - b.version);
}

async function applyMigrations(
    pending: Migration[],
    logsDb: SqlJsDatabase,
    errorsDb: SqlJsDatabase,
    fromVersion: number,
): Promise<MigrationResult> {
    let lastVersion = fromVersion;

    for (const migration of pending) {
        const isSuccess = await applySingleMigration(migration, logsDb, errorsDb);

        if (isSuccess) {
            lastVersion = migration.version;
        } else {
            return buildResult(fromVersion, lastVersion, true);
        }
    }

    return buildResult(fromVersion, lastVersion, false);
}

function buildResult(
    fromVersion: number,
    toVersion: number,
    failed: boolean,
): MigrationResult {
    return {
        fromVersion,
        toVersion,
        applied: toVersion - fromVersion,
        failed,
    };
}

async function applySingleMigration(
    migration: Migration,
    logsDb: SqlJsDatabase,
    errorsDb: SqlJsDatabase,
): Promise<boolean> {
    try {
        migration.up(logsDb, errorsDb);
        await persistVersion(migration.version);

        console.log(`[migration] v${migration.version}: ${migration.description}`);
        return true;
    } catch (err) {
        console.error(`[migration] v${migration.version} failed:`, err);  // Keep bare console.error — DB may be mid-migration
        attemptRollback(migration, logsDb, errorsDb);
        return false;
    }
}

async function persistVersion(version: number): Promise<void> {
    await chrome.storage.local.set({ [SCHEMA_VERSION_KEY]: version });
}

function attemptRollback(
    migration: Migration,
    logsDb: SqlJsDatabase,
    errorsDb: SqlJsDatabase,
): void {
    try {
        migration.down(logsDb, errorsDb);
        console.error(`[migration] Rolled back v${migration.version}`);
    } catch (rollbackErr) {
        console.error(`[migration] Rollback of v${migration.version} also failed:`, rollbackErr);
    }
}

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function runIgnoringDuplicates(db: SqlJsDatabase, statements: string[]): void {
    for (const sql of statements) {
        try {
            db.run(sql);
        } catch {
            // Column/index already exists — safe to ignore
        }
    }
}
