/**
 * Marco Extension — Logging Query Helpers
 *
 * Shared query utilities for logging and storage handlers.
 * All column names use PascalCase per database naming convention.
 */

/* ------------------------------------------------------------------ */
/*  Row Collection                                                     */
/* ------------------------------------------------------------------ */

/** Collects all rows from a prepared statement into an array. */
export function collectRows(
    stmt: { step(): boolean; getAsObject(): unknown; free(): void },
): unknown[] {
    const rows: unknown[] = [];

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
    values: unknown[][];
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
        bind(params: unknown[]): void;
        step(): boolean;
        getAsObject(): unknown;
        free(): void;
    };
}

/** Queries logs filtered by source. */
export function queryWithSource(db: PreparedDb, source: string, limit: number): unknown[] {
    const stmt = db.prepare(
        "SELECT * FROM Logs WHERE Source = ? ORDER BY Timestamp DESC LIMIT ?",
    );
    stmt.bind([source, limit]);
    return collectRows(stmt);
}

/** Queries all logs without filter. */
export function queryAll(db: PreparedDb, limit: number): unknown[] {
    const stmt = db.prepare("SELECT * FROM Logs ORDER BY Timestamp DESC LIMIT ?");
    stmt.bind([limit]);
    return collectRows(stmt);
}
