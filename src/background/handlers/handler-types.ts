/**
 * Marco Extension — Shared Handler Types
 *
 * Common type aliases used across background message handlers
 * to replace bare `unknown` with semantically meaningful types.
 */

import type { SqlValue } from "sql.js";

/** A single row returned by sql.js `stmt.getAsObject()`. */
export type SqlRow = Record<string, SqlValue>;

/** Generic JSON-compatible value for message payloads and storage. */
export type JsonValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | JsonValue[]
    | { [key: string]: JsonValue };

/** Generic JSON-compatible object (e.g., message payload fields). */
export type JsonRecord = Record<string, JsonValue>;

/** Collects all rows from a sql.js prepared statement into typed array. */
export function collectTypedRows(
    stmt: { step(): boolean; getAsObject(): SqlRow; free(): void },
): SqlRow[] {
    const rows: SqlRow[] = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}
