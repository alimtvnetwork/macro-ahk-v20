/**
 * Marco Extension — User Script Log Handler
 *
 * Handles USER_SCRIPT_LOG messages from the injected marco SDK.
 * Inserts into logs.db with source='user-script', and also
 * into errors.db when level is 'ERROR'.
 * All column names use PascalCase per database naming convention.
 *
 * @see spec/05-chrome-extension/42-user-script-logging-and-data-bridge.md — User script logging & data bridge
 * @see spec/05-chrome-extension/06-logging-architecture.md — Logging architecture
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import { getLogsDb, getErrorsDb, getCurrentSessionId, markLoggingDirty, startSession } from "./logging-handler";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_MESSAGES_PER_SECOND = 100;
const RATE_WINDOW_MS = 1000;
const SENSITIVE_KEY_PATTERN = /token|auth|key|secret|password/i;
const REDACTED_SUFFIX = "...REDACTED";
const REDACTED_PREFIX_LENGTH = 8;

/* ------------------------------------------------------------------ */
/*  Rate Limiting                                                      */
/* ------------------------------------------------------------------ */

let rateWindowStart = 0;
let rateCount = 0;

/** Returns true if the message should be dropped due to rate limiting. */
function isRateLimited(): boolean {
    const now = Date.now();
    const isNewWindow = now - rateWindowStart > RATE_WINDOW_MS;

    if (isNewWindow) {
        rateWindowStart = now;
        rateCount = 0;
    }

    rateCount++;
    return rateCount > MAX_MESSAGES_PER_SECOND;
}

/* ------------------------------------------------------------------ */
/*  Payload Type                                                       */
/* ------------------------------------------------------------------ */

interface UserScriptLogPayload {
    level: string;
    source: string;
    category: string;
    action: string;
    detail: string;
    metadata: string | null;
    projectId: string | null;
    scriptId: string | null;
    configId: string | null;
    urlRuleId: string | null;
    pageUrl: string | null;
    timestamp: string;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                            */
/* ------------------------------------------------------------------ */

/** Handles a USER_SCRIPT_LOG message from the injected SDK. */
export async function handleUserScriptLog(
    message: MessageRequest,
): Promise<OkResponse> {
    const isDropped = isRateLimited();

    if (isDropped) {
        return { isOk: true };
    }

    const msg = message as MessageRequest & { payload: UserScriptLogPayload };
    const payload = msg.payload;
    const sanitizedMetadata = redactSensitiveMetadata(payload.metadata);

    await insertUserScriptLogRow(payload, sanitizedMetadata);

    const isErrorLevel = payload.level === "ERROR";

    if (isErrorLevel) {
        await insertUserScriptErrorRow(payload, sanitizedMetadata);
    }

    markLoggingDirty();
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Insert Helpers                                                     */
/* ------------------------------------------------------------------ */

/** Inserts a user-script log entry into logs.db. */
function insertUserScriptLogRow(
    payload: UserScriptLogPayload,
    sanitizedMetadata: string | null,
): Promise<void> {
    const db = getLogsDb();
    const version = chrome.runtime.getManifest().version;

    return resolveCurrentSessionId(version).then((sessionId) => {
        db.run(
            `INSERT INTO Logs (SessionId, Timestamp, Level, Source, Category, Action, Detail, Metadata, ProjectId, UrlRuleId, ScriptId, ConfigId, ExtVersion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                sessionId,
                payload.timestamp,
                payload.level,
                "user-script",
                payload.category || "USER",
                payload.action || "log",
                payload.detail,
                sanitizedMetadata,
                payload.projectId,
                payload.urlRuleId,
                payload.scriptId,
                payload.configId,
                version,
            ],
        );
    });
}

/** Inserts a corresponding error row when user script logs at ERROR level. */
function insertUserScriptErrorRow(
    payload: UserScriptLogPayload,
    sanitizedMetadata: string | null,
): Promise<void> {
    const db = getErrorsDb();
    const version = chrome.runtime.getManifest().version;

    return resolveCurrentSessionId(version).then((sessionId) => {
        db.run(
            `INSERT INTO Errors (SessionId, Timestamp, Level, Source, Category, ErrorCode, Message, Context, ProjectId, UrlRuleId, ScriptId, ConfigId, ExtVersion)
             VALUES (?, ?, 'ERROR', 'user-script', ?, 'USER_SCRIPT_LOG_ERROR', ?, ?, ?, ?, ?, ?, ?)`,
            [
                sessionId,
                payload.timestamp,
                payload.category || "USER",
                payload.detail,
                sanitizedMetadata,
                payload.projectId,
                payload.urlRuleId,
                payload.scriptId,
                payload.configId,
                version,
            ],
        );
    });
}

async function resolveCurrentSessionId(version: string): Promise<number> {
    const currentSessionId = getCurrentSessionId();

    if (currentSessionId !== null) {
        return Number(currentSessionId);
    }

    const newSessionId = await startSession(version);
    return Number(newSessionId);
}

/* ------------------------------------------------------------------ */
/*  Metadata Redaction                                                 */
/* ------------------------------------------------------------------ */

/** Redacts sensitive values in metadata JSON. */
function redactSensitiveMetadata(metadata: string | null): string | null {
    const hasNoMetadata = metadata === null || metadata === "";

    if (hasNoMetadata) {
        return null;
    }

    try {
        const parsed = JSON.parse(metadata!) as Record<string, unknown>;
        const redacted = redactObject(parsed);

        return JSON.stringify(redacted);
    } catch {
        return metadata;
    }
}

/** Recursively redacts sensitive keys in an object. */
function redactObject(
    obj: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(obj)) {
        const value = obj[key];
        const isSensitiveKey = SENSITIVE_KEY_PATTERN.test(key);
        const isStringValue = typeof value === "string";

        if (isSensitiveKey && isStringValue) {
            result[key] = (value as string).slice(0, REDACTED_PREFIX_LENGTH) + REDACTED_SUFFIX;
        } else {
            result[key] = value;
        }
    }

    return result;
}
