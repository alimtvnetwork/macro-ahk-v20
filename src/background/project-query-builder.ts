/**
 * Marco Extension — Prisma-Style Query Builder for Project DBs
 *
 * Translates Prisma-style calls (create, findMany, findUnique, update, delete, count)
 * into parameterized SQL for sql.js. Uses PascalCase table/column names.
 *
 * See spec/05-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import type { SqlValue } from "sql.js";
import type { Database as SqlJsDatabase } from "sql.js";
import { ensureMetaTables } from "./schema-meta-engine";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface WhereClause {
    [column: string]: SqlValue | Record<string, SqlValue>;
}

export interface OrderByClause {
    [column: string]: "asc" | "desc";
}

export interface CreateArgs {
    data: Record<string, unknown>;
}

export interface FindManyArgs {
    where?: WhereClause;
    orderBy?: OrderByClause;
    take?: number;
    skip?: number;
}

export interface FindUniqueArgs {
    where: WhereClause;
}

export interface UpdateArgs {
    where: WhereClause;
    data: Record<string, unknown>;
}

export interface DeleteArgs {
    where: WhereClause;
}

export interface CountArgs {
    where?: WhereClause;
}

/* ------------------------------------------------------------------ */
/*  Table name validation                                              */
/* ------------------------------------------------------------------ */

const TABLE_NAME_REGEX = /^[A-Z][A-Za-z0-9]{0,63}$/;

function assertValidTable(name: string): void {
    if (!TABLE_NAME_REGEX.test(name)) {
        throw new Error(`[query-builder] Invalid table name: "${name}". Must be PascalCase.`);
    }
}

/* ------------------------------------------------------------------ */
/*  WHERE builder                                                      */
/* ------------------------------------------------------------------ */

function buildWhere(where?: WhereClause): { clause: string; params: SqlValue[] } {
    if (!where || Object.keys(where).length === 0) {
        return { clause: "", params: [] };
    }

    const conditions: string[] = [];
    const params: SqlValue[] = [];

    for (const [col, val] of Object.entries(where)) {
        if (typeof val === 'object' && val !== null) {
            const obj = val as Record<string, unknown>;
            if ('ilike' in obj) {
                conditions.push(`"${col}" LIKE ? COLLATE NOCASE`);
                params.push(obj.ilike);
            } else if ('like' in obj) {
                conditions.push(`"${col}" LIKE ?`);
                params.push(obj.like);
            } else {
                conditions.push(`"${col}" = ?`);
                params.push(val);
            }
        } else {
            conditions.push(`"${col}" = ?`);
            params.push(val);
        }
    }

    return { clause: ` WHERE ${conditions.join(" AND ")}`, params };
}

/* ------------------------------------------------------------------ */
/*  ORDER BY builder                                                   */
/* ------------------------------------------------------------------ */

function buildOrderBy(orderBy?: OrderByClause): string {
    if (!orderBy || Object.keys(orderBy).length === 0) return "";

    const parts = Object.entries(orderBy).map(
        ([col, dir]) => `"${col}" ${dir.toUpperCase()}`,
    );
    return ` ORDER BY ${parts.join(", ")}`;
}

/* ------------------------------------------------------------------ */
/*  Row collector                                                      */
/* ------------------------------------------------------------------ */

function collectRows(db: SqlJsDatabase, sql: string, params: SqlValue[]): Record<string, SqlValue>[] {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);

    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
    }
    stmt.free();
    return rows;
}

/* ------------------------------------------------------------------ */
/*  Query operations                                                   */
/* ------------------------------------------------------------------ */

export function queryCreate(
    db: SqlJsDatabase,
    table: string,
    args: CreateArgs,
): Record<string, unknown> {
    assertValidTable(table);
    const cols = Object.keys(args.data);
    const placeholders = cols.map(() => "?").join(", ");
    const values = cols.map((c) => args.data[c]);

    const quotedCols = cols.map(c => `"${c}"`).join(", ");
    const sql = `INSERT INTO "${table}" (${quotedCols}) VALUES (${placeholders})`;
    db.run(sql, values);

    const idResult = db.exec("SELECT last_insert_rowid() AS Id");
    const id = idResult.length > 0 ? idResult[0].values[0][0] : null;

    return { Id: id, ...args.data };
}

export function queryFindMany(
    db: SqlJsDatabase,
    table: string,
    args?: FindManyArgs,
): Record<string, unknown>[] {
    assertValidTable(table);
    const { clause, params } = buildWhere(args?.where);
    const orderBy = buildOrderBy(args?.orderBy);
    const limit = args?.take ? ` LIMIT ${Number(args.take)}` : "";
    const offset = args?.skip ? ` OFFSET ${Number(args.skip)}` : "";

    const sql = `SELECT * FROM "${table}"${clause}${orderBy}${limit}${offset}`;
    return collectRows(db, sql, params);
}

export function queryFindUnique(
    db: SqlJsDatabase,
    table: string,
    args: FindUniqueArgs,
): Record<string, unknown> | null {
    assertValidTable(table);
    const { clause, params } = buildWhere(args.where);
    const sql = `SELECT * FROM "${table}"${clause} LIMIT 1`;
    const rows = collectRows(db, sql, params);
    return rows.length > 0 ? rows[0] : null;
}

export function queryUpdate(
    db: SqlJsDatabase,
    table: string,
    args: UpdateArgs,
): { count: number } {
    assertValidTable(table);
    const setCols = Object.keys(args.data);
    const setClause = setCols.map((c) => `"${c}" = ?`).join(", ");
    const setValues = setCols.map((c) => args.data[c]);

    const { clause, params } = buildWhere(args.where);
    const sql = `UPDATE "${table}" SET ${setClause}${clause}`;
    db.run(sql, [...setValues, ...params]);

    const changes = db.exec("SELECT changes() AS Count");
    const count = changes.length > 0 ? (changes[0].values[0][0] as number) : 0;
    return { count };
}

export function queryDelete(
    db: SqlJsDatabase,
    table: string,
    args: DeleteArgs,
): { count: number } {
    assertValidTable(table);
    const { clause, params } = buildWhere(args.where);
    const sql = `DELETE FROM "${table}"${clause}`;
    db.run(sql, params);

    const changes = db.exec("SELECT changes() AS Count");
    const count = changes.length > 0 ? (changes[0].values[0][0] as number) : 0;
    return { count };
}

export function queryCount(
    db: SqlJsDatabase,
    table: string,
    args?: CountArgs,
): number {
    assertValidTable(table);
    const { clause, params } = buildWhere(args?.where);
    const sql = `SELECT COUNT(*) AS Count FROM "${table}"${clause}`;
    const rows = collectRows(db, sql, params);
    return rows.length > 0 ? (rows[0].Count as number) : 0;
}

/* ------------------------------------------------------------------ */
/*  Schema management                                                  */
/* ------------------------------------------------------------------ */

export interface ColumnDef {
    Name: string;
    Type: "TEXT" | "INTEGER" | "REAL" | "BLOB" | "BOOLEAN";
    Nullable?: boolean;
    Default?: string;
}

export function createUserTable(db: SqlJsDatabase, tableName: string, columns: ColumnDef[]): void {
    assertValidTable(tableName);

    const colDefs = columns.map((col) => {
        const type = col.Type === "BOOLEAN" ? "INTEGER" : col.Type;
        const nullable = col.Nullable ? "" : " NOT NULL";
        const def = col.Default !== undefined ? ` DEFAULT ${col.Default}` : "";
        return `"${col.Name}" ${type}${nullable}${def}`;
    });

    const sql = `CREATE TABLE IF NOT EXISTS "${tableName}" (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    ${colDefs.join(",\n    ")},
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
)`;
    db.run(sql);

    // Register in ProjectSchema meta-table
    db.run(
        `INSERT OR REPLACE INTO ProjectSchema (TableName, ColumnDefs, UpdatedAt) VALUES (?, ?, datetime('now'))`,
        [tableName, JSON.stringify(columns)],
    );

    // Also register in MetaTables + MetaColumns for the new meta engine
    ensureMetaTables(db);

    db.run(
        `INSERT INTO MetaTables (TableName, Description, UpdatedAt) VALUES (?, '', datetime('now'))
         ON CONFLICT(TableName) DO UPDATE SET UpdatedAt = datetime('now')`,
        [tableName],
    );

    for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        db.run(
            `INSERT INTO MetaColumns (TableName, ColumnName, ColumnType, IsNullable, DefaultValue, SortOrder, UpdatedAt)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(TableName, ColumnName) DO UPDATE SET
                ColumnType = excluded.ColumnType,
                IsNullable = excluded.IsNullable,
                DefaultValue = excluded.DefaultValue,
                SortOrder = excluded.SortOrder,
                UpdatedAt = datetime('now')`,
            [tableName, col.Name, col.Type, col.Nullable ? 1 : 0, col.Default ?? null, i],
        );
    }
}

export function dropUserTable(db: SqlJsDatabase, tableName: string): void {
    assertValidTable(tableName);
    db.run(`DROP TABLE IF EXISTS "${tableName}"`);
    db.run(`DELETE FROM ProjectSchema WHERE TableName = ?`, [tableName]);
}

export function listUserTables(db: SqlJsDatabase): Array<{ TableName: string; ColumnDefs: string; EndpointName: string | null }> {
    const stmt = db.prepare("SELECT TableName, ColumnDefs, EndpointName FROM ProjectSchema ORDER BY TableName");
    const rows: Array<{ TableName: string; ColumnDefs: string; EndpointName: string | null }> = [];
    while (stmt.step()) {
        const row = stmt.getAsObject() as Record<string, unknown>;
        rows.push({
            TableName: row.TableName as string,
            ColumnDefs: row.ColumnDefs as string,
            EndpointName: (row.EndpointName as string) || null,
        });
    }
    stmt.free();
    return rows;
}
