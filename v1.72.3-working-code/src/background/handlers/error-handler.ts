/**
 * Marco Extension — Error & User Script Error Handler
 *
 * Handles GET_ACTIVE_ERRORS and USER_SCRIPT_ERROR messages.
 * Uses db-manager for SQLite queries and state-manager for health updates.
 * All column names use PascalCase per database naming convention.
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import type { DbManager } from "../db-manager";
import { setHealthState } from "../state-manager";

let dbManager: DbManager | null = null;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/** Binds the error handler to an initialized DbManager. */
export function bindErrorDbManager(manager: DbManager): void {
    dbManager = manager;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getErrorsDb() {
    const isMissingDb = dbManager === null;
    if (isMissingDb) {
        throw new Error(
            "[error-handler] DbManager not bound — boot may still be in progress or failed. " +
            "Check service worker console for boot errors.",
        );
    }
    return dbManager!.getErrorsDb();
}

/** Collects all rows from a prepared statement. */
function collectRows(stmt: { step(): boolean; getAsObject(): unknown; free(): void }): unknown[] {
    const rows: unknown[] = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
}

/* ------------------------------------------------------------------ */
/*  GET_ACTIVE_ERRORS                                                  */
/* ------------------------------------------------------------------ */

/** Returns currently active (unresolved) errors. */
export async function handleGetActiveErrors(): Promise<{ errors: unknown[] }> {
    const db = getErrorsDb();
    const errors = queryUnresolvedErrors(db);
    const hasErrors = errors.length > 0;
    if (hasErrors) {
        setHealthState("DEGRADED");
    }
    return { errors };
}

/** Queries all unresolved error rows, newest first. */
function queryUnresolvedErrors(db: ReturnType<typeof getErrorsDb>): unknown[] {
    const stmt = db.prepare(
        "SELECT * FROM Errors WHERE Resolved = 0 ORDER BY Timestamp DESC LIMIT 100",
    );
    return collectRows(stmt);
}

/* ------------------------------------------------------------------ */
/*  USER_SCRIPT_ERROR                                                  */
/* ------------------------------------------------------------------ */

/** Records a user script error into the errors database. */
export async function handleUserScriptError(
    message: MessageRequest,
): Promise<OkResponse> {
    const msg = message as MessageRequest & {
        scriptId: string;
        message: string;
        stack: string;
        scriptCode?: string;
        projectId?: string;
    };

    insertUserScriptError(msg);
    dbManager!.markDirty();
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  CLEAR_ERRORS                                                       */
/* ------------------------------------------------------------------ */

/** Marks all unresolved errors as resolved. */
export async function handleClearErrors(): Promise<OkResponse> {
    const db = getErrorsDb();
    db.run("UPDATE Errors SET Resolved = 1 WHERE Resolved = 0");
    dbManager!.markDirty();
    setHealthState("OK");
    return { isOk: true };
}

/** Inserts a USER_SCRIPT_ERROR row into the errors table. */
function insertUserScriptError(msg: {
    scriptId: string;
    message: string;
    stack: string;
    scriptCode?: string;
    projectId?: string;
}): void {
    const db = getErrorsDb();
    const now = new Date().toISOString();
    const version = chrome.runtime.getManifest().version;
    const codeSnippet = msg.scriptCode?.slice(0, 500) ?? null;

    db.run(
        `INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, ErrorCode, Message, StackTrace, ScriptId, ProjectId, ScriptFile, ExtVersion)
         VALUES ('', ?, 'ERROR', 'user-script', 'INJECTION', 'USER_SCRIPT_ERROR', ?, ?, ?, ?, ?, ?)`,
        [now, msg.message, msg.stack, msg.scriptId, msg.projectId ?? null, codeSnippet, version],
    );
}
