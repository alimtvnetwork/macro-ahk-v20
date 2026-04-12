/**
 * Marco Extension — Config Seeder
 *
 * Seeds project config.json into the project-scoped SQLite database.
 * Uses SHA-256 hash comparison to detect changes and avoid overwriting
 * user edits made via the Settings UI.
 *
 * Flow:
 *   1. Read config JSON from chrome.storage.local (seeded by manifest-seeder)
 *   2. Compute SHA-256 hash of the JSON string
 *   3. Check ProjectConfigMeta for existing hash
 *   4. If no entry or hash mismatch → seed/re-seed config rows
 *   5. If hash matches → skip (user edits in DB are preserved)
 *
 * Tables created (PascalCase per convention):
 *   - ProjectConfig: Id, Section, Key, Value, ValueType, CreatedAt, UpdatedAt
 *   - ProjectConfigMeta: Id, ConfigName, SourceHash, SeededAt, UpdatedAt
 *
 * @see spec/05-chrome-extension/13-script-and-config-management.md — Config management
 * @see .lovable/memory/features/projects/configuration-seeding.md — Hash-based seeding strategy
 */

import type { JsonValue } from "./handlers/handler-types";
import type { ProjectDbManager } from "./project-db-manager";
import { logCaughtError, BgLogTag} from "./bg-logger";

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

export const CONFIG_TABLES_SCHEMA = `
CREATE TABLE IF NOT EXISTS ProjectConfig (
    Id         INTEGER PRIMARY KEY AUTOINCREMENT,
    Section    TEXT NOT NULL,
    Key        TEXT NOT NULL,
    Value      TEXT,
    ValueType  TEXT NOT NULL DEFAULT 'string',
    CreatedAt  TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(Section, Key)
);

CREATE TABLE IF NOT EXISTS ProjectConfigMeta (
    Id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ConfigName  TEXT NOT NULL UNIQUE,
    SourceHash  TEXT NOT NULL,
    SeededAt    TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/* ------------------------------------------------------------------ */
/*  Hash                                                               */
/* ------------------------------------------------------------------ */

async function sha256(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/*  Flatten nested config to section.key = value rows                  */
/* ------------------------------------------------------------------ */

interface ConfigRow {
    section: string;
    key: string;
    value: string;
    valueType: string;
}

function flattenConfig(obj: Record<string, unknown>, parentSection = ""): ConfigRow[] {
    const rows: ConfigRow[] = [];

    for (const [key, val] of Object.entries(obj)) {
        if (val !== null && typeof val === "object" && !Array.isArray(val)) {
            // Nested section — recurse with section prefix
            const section = parentSection ? `${parentSection}.${key}` : key;
            rows.push(...flattenConfig(val as Record<string, unknown>, section));
        } else {
            const section = parentSection || "_root";
            let valueType = typeof val;
            let serialized: string;

            if (val === null || val === undefined) {
                serialized = "";
                valueType = "null";
            } else if (Array.isArray(val)) {
                serialized = JSON.stringify(val);
                valueType = "array";
            } else if (typeof val === "object") {
                serialized = JSON.stringify(val);
                valueType = "object";
            } else {
                serialized = String(val);
            }

            rows.push({ section, key, value: serialized, valueType });
        }
    }

    return rows;
}

/* ------------------------------------------------------------------ */
/*  Seed config into project DB                                        */
/* ------------------------------------------------------------------ */

/**
 * Seeds a config JSON string into the project's SQLite database.
 * Returns true if seeding occurred, false if skipped (hash match).
 */
// eslint-disable-next-line max-lines-per-function
export async function seedConfigToDb(
    manager: ProjectDbManager,
    configName: string,
    configJson: string,
): Promise<boolean> {
    const db = manager.getDb();

    // Ensure tables exist
    db.run(CONFIG_TABLES_SCHEMA);

    // Compute hash of source config
    const sourceHash = await sha256(configJson);

    // Check existing hash
    const existing = db.exec(
        "SELECT SourceHash FROM ProjectConfigMeta WHERE ConfigName = ?",
        [configName],
    );

    if (existing.length > 0 && existing[0].values.length > 0) {
        const storedHash = String(existing[0].values[0][0]);
        if (storedHash === sourceHash) {
            console.log(`[config-seeder] Hash match for "${configName}" — skipping (user edits preserved)`);
            return false;
        }
        console.log(`[config-seeder] Hash mismatch for "${configName}" — re-seeding`);
    } else {
        console.log(`[config-seeder] First seed for "${configName}"`);
    }

    // Parse config
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(configJson);
    } catch (e) {
        logCaughtError(BgLogTag.CONFIG_SEEDER, `Invalid JSON for "${configName}"`, e);
        return false;
    }

    // Flatten to rows
    const rows = flattenConfig(parsed);
    const now = new Date().toISOString();

    // Upsert rows using INSERT OR REPLACE
    const stmt = db.prepare(
        `INSERT OR REPLACE INTO ProjectConfig (Section, Key, Value, ValueType, CreatedAt, UpdatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
    );

    for (const row of rows) {
        stmt.run([row.section, row.key, row.value, row.valueType, now, now]);
    }
    stmt.free();

    // Upsert meta
    db.run(
        `INSERT INTO ProjectConfigMeta (ConfigName, SourceHash, SeededAt, UpdatedAt)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(ConfigName) DO UPDATE SET
             SourceHash = excluded.SourceHash,
             UpdatedAt = excluded.UpdatedAt`,
        [configName, sourceHash, now, now],
    );

    manager.markDirty();
    console.log(`[config-seeder] Seeded ${rows.length} config rows for "${configName}"`);
    return true;
}

/* ------------------------------------------------------------------ */
/*  Read config back from DB (for Settings UI)                         */
/* ------------------------------------------------------------------ */

export interface StoredConfigRow {
    id: number;
    section: string;
    key: string;
    value: string;
    valueType: string;
    updatedAt: string;
}

/**
 * Reads all config rows from the project DB.
 */
export function readConfigFromDb(manager: ProjectDbManager): StoredConfigRow[] {
    const db = manager.getDb();

    try {
        const result = db.exec(
            "SELECT Id, Section, Key, Value, ValueType, UpdatedAt FROM ProjectConfig ORDER BY Section, Key",
        );
        if (result.length === 0) return [];

        return result[0].values.map(row => ({
            id: Number(row[0]),
            section: String(row[1]),
            key: String(row[2]),
            value: String(row[3]),
            valueType: String(row[4]),
            updatedAt: String(row[5]),
        }));
    } catch {
        return [];
    }
}

/**
 * Updates a single config value in the project DB (from Settings UI).
 */
export function updateConfigValue(
    manager: ProjectDbManager,
    section: string,
    key: string,
    value: string,
    valueType?: string,
): boolean {
    const db = manager.getDb();
    const now = new Date().toISOString();

    try {
        if (valueType) {
            db.run(
                "UPDATE ProjectConfig SET Value = ?, ValueType = ?, UpdatedAt = ? WHERE Section = ? AND Key = ?",
                [value, valueType, now, section, key],
            );
        } else {
            db.run(
                "UPDATE ProjectConfig SET Value = ?, UpdatedAt = ? WHERE Section = ? AND Key = ?",
                [value, now, section, key],
            );
        }
        manager.markDirty();
        return true;
    } catch (e) {
        logCaughtError(BgLogTag.CONFIG_SEEDER, "Update failed", e);
        return false;
    }
}

/**
 * Reconstructs the full config object from DB rows.
 */
export function reconstructConfigFromDb(manager: ProjectDbManager): Record<string, unknown> {
    const rows = readConfigFromDb(manager);
    const result: Record<string, unknown> = {};

    for (const row of rows) {
        const path = row.section === "_root"
            ? [row.key]
            : [...row.section.split("."), row.key];

        let target: Record<string, unknown> = result;
        for (let i = 0; i < path.length - 1; i++) {
            if (!target[path[i]] || typeof target[path[i]] !== "object") {
                target[path[i]] = {};
            }
            target = target[path[i]] as Record<string, unknown>;
        }

        const leafKey = path[path.length - 1];
        target[leafKey] = deserializeValue(row.value, row.valueType);
    }

    return result;
}

function deserializeValue(value: string, valueType: string): JsonValue {
    switch (valueType) {
        case "number": return Number(value);
        case "boolean": return value === "true";
        case "null": return null;
        case "array":
        case "object":
            try { return JSON.parse(value); } catch { return value; }
        default: return value;
    }
}
