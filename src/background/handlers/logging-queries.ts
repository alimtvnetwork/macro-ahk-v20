/**
 * Marco Extension — Logging Query Helpers
 *
 * Shared query utilities for logging and storage handlers.
 * All column names use PascalCase per database naming convention.
 *
 * @see spec/05-chrome-extension/06-logging-architecture.md — Logging architecture
 */

import type { SqlRow } from "./handler-types";

/* ------------------------------------------------------------------ */
/*  Row Collection                                                     */
/* ------------------------------------------------------------------ */

/** Collects all rows from a prepared statement into an array. */
export function collectRows(
    stmt: { step(): boolean; getAsObject(): SqlRow; free(): void },
): SqlRow[] {
    const rows: SqlRow[] = [];

    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }

    stmt.free();
    return rows;
}

/* ------------------------------------------------------------------ */
/*  Table Counting                                                     */
/* ------------------------------------------------------------------ */

/** Statement result shape from sql.js exec(). */
interface ExecResult {
    columns: string[];
    values: Array<Array<string | number | Uint8Array | null>>;
}

/** Allowed table names for dynamic SQL queries (defense-in-depth). */
const ALLOWED_TABLES = new Set(["Logs", "Errors", "Sessions", "Prompts", "ProjectKv", "ProjectFiles", "Scripts"]);

/** Counts all rows in a table. Table name is validated against an allowlist. */
export function countTable(
    db: { exec(sql: string): ExecResult[] },
    table: string,
): number {
    if (!ALLOWED_TABLES.has(table)) {
        throw new Error(`[SQL safety] Table name "${table}" not in allowlist`);
    }
    const result = db.exec(`SELECT COUNT(*) as cnt FROM ${table}`);
    const hasResult = result.length > 0 && result[0].values.length > 0;

    return hasResult ? (result[0].values[0][0] as number) : 0;
}

/* ------------------------------------------------------------------ */
/*  Filtered Queries                                                   */
/* ------------------------------------------------------------------ */

/** Prepared statement interface for sql.js. */
interface PreparedDb {
    prepare(sql: string): {
        bind(params: Array<string | number | null>): void;
        step(): boolean;
        getAsObject(): SqlRow;
        free(): void;
    };
}

/** Queries logs filtered by source. */
export function queryWithSource(db: PreparedDb, source: string, limit: number): SqlRow[] {
    const stmt = db.prepare(
        "SELECT * FROM Logs WHERE Source = ? ORDER BY Timestamp DESC LIMIT ?",
    );
    stmt.bind([source, limit]);
    return collectRows(stmt);
}

/** Queries all logs without filter. */
export function queryAll(db: PreparedDb, limit: number): SqlRow[] {
    const stmt = db.prepare("SELECT * FROM Logs ORDER BY Timestamp DESC LIMIT ?");
    stmt.bind([limit]);
    return collectRows(stmt);
}
