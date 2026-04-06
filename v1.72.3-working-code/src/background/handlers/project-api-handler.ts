/**
 * Marco Extension — Project API Handler
 *
 * Handles PROJECT_API messages for per-project SQLite database CRUD.
 * Supports: create, findMany, findUnique, update, delete, count,
 * plus schema management (createTable, dropTable, listTables).
 *
 * See spec/12-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import {
    initProjectDb,
    getProjectDb,
    hasProjectDb,
    flushProjectDb,
} from "../project-db-manager";

import {
    queryCreate,
    queryFindMany,
    queryFindUnique,
    queryUpdate,
    queryDelete,
    queryCount,
    createUserTable,
    dropUserTable,
    listUserTables,
    type CreateArgs,
    type FindManyArgs,
    type FindUniqueArgs,
    type UpdateArgs,
    type DeleteArgs,
    type CountArgs,
    type ColumnDef,
} from "../project-query-builder";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectApiMessage {
    type: string;
    project: string;       // slug
    method: string;        // GET | POST | PUT | DELETE | SCHEMA
    endpoint: string;      // table name or special command
    params?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

export async function handleProjectApi(msg: unknown): Promise<unknown> {
    const m = msg as ProjectApiMessage;
    const slug = m.project;
    const method = (m.method || "GET").toUpperCase();
    const endpoint = m.endpoint;
    const params = m.params || {};

    if (!slug) {
        return { isOk: false, errorMessage: "Missing project slug" };
    }

    // Ensure project DB is initialized
    if (!hasProjectDb(slug)) {
        await initProjectDb(slug);
    }

    const db = getProjectDb(slug);

    try {
        const result = await dispatchMethod(db, slug, method, endpoint, params);
        return { isOk: true, ...result };
    } catch (err) {
        return {
            isOk: false,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}

/* ------------------------------------------------------------------ */
/*  Dispatch                                                           */
/* ------------------------------------------------------------------ */

async function dispatchMethod(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    method: string,
    endpoint: string,
    params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    // Schema management commands
    if (method === "SCHEMA") {
        return handleSchemaCommand(db, slug, endpoint, params);
    }

    // CRUD operations on user tables
    switch (method) {
        case "GET":
            return handleGet(db, endpoint, params);
        case "POST":
            return handlePost(db, slug, endpoint, params);
        case "PUT":
            return handlePut(db, slug, endpoint, params);
        case "DELETE":
            return handleDelete(db, slug, endpoint, params);
        default:
            throw new Error(`Unsupported method: ${method}`);
    }
}

/* ------------------------------------------------------------------ */
/*  CRUD handlers                                                      */
/* ------------------------------------------------------------------ */

function handleGet(
    db: ReturnType<typeof getProjectDb>,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const hasId = params.where && typeof params.where === "object" && "Id" in (params.where as Record<string, unknown>);

    if (hasId) {
        const row = queryFindUnique(db, table, { where: params.where as FindUniqueArgs["where"] });
        return { row };
    }

    if (params.count) {
        const count = queryCount(db, table, { where: params.where as CountArgs["where"] });
        return { count };
    }

    const rows = queryFindMany(db, table, {
        where: params.where as FindManyArgs["where"],
        orderBy: params.orderBy as FindManyArgs["orderBy"],
        take: params.take as number,
        skip: params.skip as number,
    });
    return { rows };
}

function handlePost(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const row = queryCreate(db, table, { data: params.data as CreateArgs["data"] });
    void markAndFlush(slug);
    return { row };
}

function handlePut(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const result = queryUpdate(db, table, {
        where: params.where as UpdateArgs["where"],
        data: params.data as UpdateArgs["data"],
    });
    void markAndFlush(slug);
    return { updated: result.count };
}

function handleDelete(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    table: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    const result = queryDelete(db, table, {
        where: params.where as DeleteArgs["where"],
    });
    void markAndFlush(slug);
    return { deleted: result.count };
}

/* ------------------------------------------------------------------ */
/*  Schema commands                                                    */
/* ------------------------------------------------------------------ */

function handleSchemaCommand(
    db: ReturnType<typeof getProjectDb>,
    slug: string,
    command: string,
    params: Record<string, unknown>,
): Record<string, unknown> {
    switch (command) {
        case "createTable": {
            const tableName = params.tableName as string;
            const columns = params.columns as ColumnDef[];
            createUserTable(db, tableName, columns);
            void markAndFlush(slug);
            return { table: tableName };
        }
        case "dropTable": {
            const tableName = params.tableName as string;
            dropUserTable(db, tableName);
            void markAndFlush(slug);
            return { dropped: tableName };
        }
        case "listTables": {
            const tables = listUserTables(db);
            return { tables };
        }
        default:
            throw new Error(`Unknown schema command: ${command}`);
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function markAndFlush(slug: string): Promise<void> {
    // Debounced flush via the project db manager
    const { initProjectDb: init } = await import("../project-db-manager");
    const manager = await init(slug);
    manager.markDirty();
}
