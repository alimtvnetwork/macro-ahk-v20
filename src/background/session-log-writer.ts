/**
 * Marco Extension — Session Log File Writer
 *
 * Writes human-readable log files to OPFS alongside SQLite storage.
 * Each session gets a directory: session-logs/session-{id}/
 * containing:
 *   - events.log    — all log entries (appended in real-time)
 *   - errors.log    — all error entries
 *   - scripts.log   — script loading/injection lifecycle
 *   - summary.log   — header with session metadata (written on-demand)
 *
 * @see spec/05-chrome-extension/06-logging-architecture.md
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface LogLine {
    level: string;
    source: string;
    category: string;
    action: string;
    detail: string;
    scriptId?: string;
    projectId?: string;
    configId?: string;
}

interface ErrorLine {
    level: string;
    source: string;
    category: string;
    errorCode: string;
    message: string;
    stackTrace?: string;
    context?: string;
    scriptId?: string;
    scriptFile?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const LOGS_DIR_NAME = "session-logs";
const SESSION_PREFIX = "session-";
const EVENTS_LOG = "events.log";
const ERRORS_LOG = "errors.log";
const SCRIPTS_LOG = "scripts.log";
const LOG_SEPARATOR = "============================================================";

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let sessionDir: FileSystemDirectoryHandle | null = null;
let sessionId: string | null = null;
let version: string = "0.0.0";
let sessionStartedAt: string = "";
let sessionInitPromise: Promise<void> | null = null;

// Buffered writers — we append to the same files
const fileHandleCache = new Map<string, FileSystemFileHandle>();
const pendingWrites = new Map<string, string[]>();
let flushScheduled = false;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

async function ensureSessionDir(): Promise<FileSystemDirectoryHandle | null> {
    if (!sessionId) return null;
    if (sessionDir) return sessionDir;

    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME, { create: true });
        sessionDir = await logsRoot.getDirectoryHandle(`${SESSION_PREFIX}${sessionId}`, { create: true });
        return sessionDir;
    } catch (err) {
        const absDir = `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${sessionId}`;
        console.error(`[session-log-writer::ensureSessionDir] Failed to access "${absDir}"`, err);
        sessionDir = null;
        return null;
    }
}

/** Creates a new session directory in OPFS and prepares file handles. */
export async function initSessionLogDir(sid: string, ver: string): Promise<void> {
    sessionId = sid;
    version = ver;
    sessionStartedAt = new Date().toISOString();
    fileHandleCache.clear();

    sessionInitPromise = (async () => {
        try {
            const dir = await ensureSessionDir();
            if (!dir) return;

            // Seed files directly during init to avoid waiting on our own init promise
            const seeds = new Map<string, string>([
                [EVENTS_LOG, [
                    LOG_SEPARATOR,
                    `  Marco Session Log — Session #${sid}`,
                    `  Started:  ${sessionStartedAt}`,
                    `  Version:  ${ver}`,
                    `  Platform: ${navigator.userAgent}`,
                    LOG_SEPARATOR,
                    "",
                ].join("\n")],
                [ERRORS_LOG, [
                    `=== Errors — Session #${sid} — ${sessionStartedAt} ===`,
                    "",
                ].join("\n")],
                [SCRIPTS_LOG, [
                    `=== Script Lifecycle — Session #${sid} — ${sessionStartedAt} ===`,
                    "",
                ].join("\n")],
            ]);

            for (const [filename, content] of seeds) {
                const handle = await dir.getFileHandle(filename, { create: true });
                fileHandleCache.set(filename, handle);
                const writable = await handle.createWritable({ keepExistingData: true });
                const file = await handle.getFile();
                await writable.seek(file.size);
                await writable.write(content);
                await writable.close();
            }

            console.log(`[session-log-writer] Initialized OPFS dir "opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${sid}/" with files: [${EVENTS_LOG}, ${ERRORS_LOG}, ${SCRIPTS_LOG}]`);

            // Fire-and-forget: prune old sessions on each new session start
            void pruneOldSessionLogs();
        } catch (err) {
            const absDir = `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${sid}`;
            console.error(`[session-log-writer::initSessionDir] OPFS dir init failed at "${absDir}". Expected files: [${absDir}/${EVENTS_LOG}, ${absDir}/${ERRORS_LOG}, ${absDir}/${SCRIPTS_LOG}]`, err);
            sessionDir = null;
        }
    })();

    await sessionInitPromise;
    sessionInitPromise = null;
}

/* ------------------------------------------------------------------ */
/*  Write helpers                                                      */
/* ------------------------------------------------------------------ */

/** Appends text to a file in the session directory. Buffered + debounced. */
async function appendToFile(filename: string, text: string): Promise<void> {
    if (sessionInitPromise) {
        await sessionInitPromise;
    }

    const dir = await ensureSessionDir();
    if (!dir) return;

    const existing = pendingWrites.get(filename) ?? [];
    existing.push(text);
    pendingWrites.set(filename, existing);

    if (!flushScheduled) {
        flushScheduled = true;
        // Microtask-batch: flush after current call stack clears
        setTimeout(() => void flushPending(), 100);
    }
}

/** Flushes all pending writes to OPFS files. */
async function flushPending(): Promise<void> {
    flushScheduled = false;
    const dir = await ensureSessionDir();
    if (!dir) return;

    const entries = Array.from(pendingWrites.entries());
    pendingWrites.clear();

    for (const [filename, chunks] of entries) {
        try {
            let handle = fileHandleCache.get(filename);
            if (!handle) {
                handle = await dir.getFileHandle(filename, { create: true });
                fileHandleCache.set(filename, handle);
            }

            const writable = await handle.createWritable({ keepExistingData: true });
            const file = await handle.getFile();
            // Seek to end
            await writable.seek(file.size);
            const content = chunks.join("");
            await writable.write(content);
            await writable.close();
        } catch (err) {
            const absPath = `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${sessionId}/${filename}`;
            console.error(`[session-log-writer::flushPending] Failed to write "${absPath}"`, err);
            fileHandleCache.delete(filename);
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

function ts(): string {
    return new Date().toISOString();
}

function formatLogLine(msg: LogLine): string {
    const t = ts();
    const lvl = (msg.level ?? "INFO").toUpperCase().padEnd(5);
    const src = (msg.source ?? "—").padEnd(12);
    const cat = (msg.category ?? "").padEnd(12);
    const act = msg.action ?? "";
    const det = msg.detail ?? "";
    const sid = msg.scriptId ? ` [${msg.scriptId}]` : "";
    return `${t}  ${lvl}  ${src}  ${cat}  ${act}${sid}  ${det}\n`;
}

function formatErrorLine(msg: ErrorLine): string {
    const t = ts();
    const lvl = (msg.level ?? "ERROR").toUpperCase().padEnd(5);
    const src = (msg.source ?? "—").padEnd(12);
    const code = msg.errorCode ?? "UNKNOWN";
    const m = msg.message ?? "";
    const file = msg.scriptFile ? ` [${msg.scriptFile}]` : "";
    const stack = msg.stackTrace ? `\n    Stack: ${msg.stackTrace}` : "";
    const ctx = msg.context ? `\n    Context: ${msg.context}` : "";
    return `${t}  ${lvl}  ${src}  ${code}${file}  ${m}${stack}${ctx}\n`;
}

/* ------------------------------------------------------------------ */
/*  Public API — called from logging-handler.ts                        */
/* ------------------------------------------------------------------ */

/** Appends a log entry to events.log (and scripts.log if injection-related). */
export function writeLogEntry(msg: LogLine): void {
    const line = formatLogLine(msg);
    void appendToFile(EVENTS_LOG, line);

    // Also log injection & script lifecycle events to scripts.log
    const cat = (msg.category ?? "").toUpperCase();
    if (cat === "INJECTION" || cat === "SCRIPT" || cat === "BOOTSTRAP" || cat === "RESOLVE") {
        void appendToFile(SCRIPTS_LOG, line);
    }
}

/** Appends an error entry to errors.log and events.log. */
export function writeErrorEntry(msg: ErrorLine): void {
    const line = formatErrorLine(msg);
    void appendToFile(ERRORS_LOG, line);
    void appendToFile(EVENTS_LOG, line);
}

/* ------------------------------------------------------------------ */
/*  Session report reader                                              */
/* ------------------------------------------------------------------ */

/** Reads all session log files and builds a comprehensive report string. */
export async function buildSessionReport(sid?: string): Promise<string> {
    const targetSid = sid ?? sessionId;
    if (!targetSid) {
        return "[session-log-writer] No active session.";
    }

    const result = await tryReadSessionDir(targetSid);
    if (result.ok) return result.report;

    // Fallback: requested session dir missing — try the most recent available session
    const available = await listSessionIds();
    const availableList = available.length > 0
        ? available.map((id) => `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${id}/`).join(", ")
        : "(none)";

    if (available.length > 0) {
        const fallbackSid = available[0]; // most recent
        const fallback = await tryReadSessionDir(fallbackSid);
        if (fallback.ok) {
            const notice = [
                `[session-log-writer] Requested session #${targetSid} not found at "opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${targetSid}/".`,
                `  Available sessions: [${availableList}]`,
                `  Falling back to most recent session #${fallbackSid}.`,
                "",
            ].join("\n");
            return notice + fallback.report;
        }
    }

    // No fallback available
    const absDir = `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${targetSid}`;
    const expectedPaths = [EVENTS_LOG, ERRORS_LOG, SCRIPTS_LOG].map((f) => `${absDir}/${f}`);
    return `[session-log-writer] Failed to read session #${targetSid} at OPFS dir "${absDir}". Expected file paths: [${expectedPaths.join(", ")}]. Available sessions: [${availableList}]. No fallback session had readable data.`;
}

/** Attempts to read a session directory. Returns { ok, report } or { ok: false, error }. */
async function tryReadSessionDir(sid: string): Promise<{ ok: true; report: string } | { ok: false; error: string }> {
    const absDir = `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${sid}`;
    const expectedFiles = [EVENTS_LOG, ERRORS_LOG, SCRIPTS_LOG] as const;

    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);
        const dir = await logsRoot.getDirectoryHandle(`${SESSION_PREFIX}${sid}`);

        const sections: string[] = [];
        const found: string[] = [];
        const missing: string[] = [];

        for (const filename of expectedFiles) {
            try {
                const handle = await dir.getFileHandle(filename);
                const file = await handle.getFile();
                const text = await file.text();
                if (text.trim()) {
                    sections.push(text);
                }
                found.push(`${absDir}/${filename}`);
            } catch {
                missing.push(`${absDir}/${filename}`);
            }
        }

        if (sections.length === 0) {
            const missingList = missing.length > 0 ? ` Missing files: [${missing.join(", ")}].` : "";
            const foundList = found.length > 0 ? ` Found but empty: [${found.join(", ")}].` : "";
            return { ok: false, error: `Session #${sid} has no readable log data at dir "${absDir}".${missingList}${foundList}` };
        }

        const ver = version || "?";
        const header = [
            LOG_SEPARATOR,
            `  Marco Full Session Report`,
            `  Session:   #${sid}`,
            `  Generated: ${new Date().toISOString()}`,
            `  Version:   ${ver}`,
            LOG_SEPARATOR,
            "",
        ].join("\n");

        return { ok: true, report: header + sections.join("\n\n") };
    } catch (err) {
        const errName = err instanceof DOMException ? err.name : "UnknownError";
        const errMsg = err instanceof Error ? err.message : String(err);
        const expectedPaths = expectedFiles.map((f) => `${absDir}/${f}`);
        return { ok: false, error: `Failed to read session #${sid} at "${absDir}" (${errName}: ${errMsg}). Expected: [${expectedPaths.join(", ")}]` };
    }
}

/** Purges session directories older than `maxAgeDays`. */
export async function pruneOldSessionLogs(maxAgeDays = 7): Promise<number> {
    let removed = 0;
    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);
        const cutoff = Date.now() - maxAgeDays * 86_400_000;
        const toDelete: string[] = [];

        const entries = (logsRoot as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]();
        for await (const [name, handle] of { [Symbol.asyncIterator]: () => entries }) {
            if (handle.kind !== "directory" || !name.startsWith(SESSION_PREFIX)) continue;
            // Check events.log modification time as proxy for session age
            try {
                const dir = await logsRoot.getDirectoryHandle(name);
                const fh = await dir.getFileHandle(EVENTS_LOG);
                const file = await fh.getFile();
                if (file.lastModified < cutoff) {
                    toDelete.push(name);
                }
            } catch {
                // No events.log at "opfs-root/session-logs/{name}/events.log" → stale dir, mark for deletion
                toDelete.push(name);
            }
        }

        for (const name of toDelete) {
            await logsRoot.removeEntry(name, { recursive: true });
            removed++;
        }

        if (removed > 0) {
            console.log(`[session-log-writer] Pruned ${removed} session dirs from "opfs-root/${LOGS_DIR_NAME}/" older than ${maxAgeDays}d`);
        }
    } catch (err) {
        console.error(`[session-log-writer::pruneOldSessionLogs] Pruning failed at "opfs-root/${LOGS_DIR_NAME}/"`, err);
    }
    return removed;
}

/** Checks the health of the current OPFS session directory. */
export interface OpfsStatusData {
    sessionId: string | null;
    dirExists: boolean;
    files: Array<{ name: string; absolutePath: string; sizeBytes: number; exists: boolean }>;
    healthy: boolean;
}

export async function getOpfsSessionStatus(): Promise<OpfsStatusData> {
    const sid = sessionId;
    if (!sid) {
        return { sessionId: null, dirExists: false, files: [], healthy: false };
    }

    const absBase = `opfs-root/${LOGS_DIR_NAME}/${SESSION_PREFIX}${sid}`;
    const expectedFiles = [EVENTS_LOG, ERRORS_LOG, SCRIPTS_LOG];

    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);
        const dir = await logsRoot.getDirectoryHandle(`${SESSION_PREFIX}${sid}`);

        const files: OpfsStatusData["files"] = [];
        for (const fname of expectedFiles) {
            try {
                const fh = await dir.getFileHandle(fname);
                const file = await fh.getFile();
                files.push({ name: fname, absolutePath: `${absBase}/${fname}`, sizeBytes: file.size, exists: true });
            } catch {
                files.push({ name: fname, absolutePath: `${absBase}/${fname}`, sizeBytes: 0, exists: false });
            }
        }

        const allExist = files.every((f) => f.exists);
        return { sessionId: sid, dirExists: true, files, healthy: allExist };
    } catch {
        const files = expectedFiles.map((f) => ({ name: f, absolutePath: `${absBase}/${f}`, sizeBytes: 0, exists: false }));
        return { sessionId: sid, dirExists: false, files, healthy: false };
    }
}

/** Lists all available session IDs from OPFS. */
export async function listSessionIds(): Promise<string[]> {
    const sessions = await listSessionsWithTimestamps();
    return sessions.map((s) => s.id);
}

/** Session info with ID and last-modified timestamp. */
export interface SessionInfo {
    id: string;
    lastModified: string; // ISO timestamp
}

/** Lists all available sessions with their most recent file timestamp. */
export async function listSessionsWithTimestamps(): Promise<SessionInfo[]> {
    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);
        const results: SessionInfo[] = [];

        const entries = (logsRoot as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]();
        for await (const [name, handle] of { [Symbol.asyncIterator]: () => entries }) {
            if (handle.kind !== "directory" || !name.startsWith(SESSION_PREFIX)) continue;
            const sid = name.replace(SESSION_PREFIX, "");
            let latestMs = 0;

            try {
                const dir = await logsRoot.getDirectoryHandle(name);
                for (const fname of [EVENTS_LOG, ERRORS_LOG, SCRIPTS_LOG]) {
                    try {
                        const fh = await dir.getFileHandle(fname);
                        const file = await fh.getFile();
                        if (file.lastModified > latestMs) latestMs = file.lastModified;
                    } catch { /* file may not exist */ }
                }
            } catch { /* dir unreadable */ }

            results.push({
                id: sid,
                lastModified: latestMs > 0 ? new Date(latestMs).toISOString() : "",
            });
        }

        return results.sort((a, b) => Number(b.id) - Number(a.id));
    } catch {
        return [];
    }
}

/* ------------------------------------------------------------------ */
/*  OPFS Session Browser                                               */
/* ------------------------------------------------------------------ */

interface SessionFileInfo {
    name: string;
    absolutePath: string;
    sizeBytes: number;
    lastModified: string;
}

interface SessionDirInfo {
    sessionId: string;
    absolutePath: string;
    files: SessionFileInfo[];
    totalSizeBytes: number;
}

/** Browses all OPFS session directories and returns file metadata with absolute paths. */
export async function browseOpfsSessions(): Promise<{
    rootPath: string;
    sessions: SessionDirInfo[];
    totalSessions: number;
}> {
    const rootPath = `opfs-root/${LOGS_DIR_NAME}`;
    const sessions: SessionDirInfo[] = [];

    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);

        const dirEntries = (logsRoot as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]();
        for await (const [name, handle] of { [Symbol.asyncIterator]: () => dirEntries }) {
            if (handle.kind !== "directory" || !name.startsWith(SESSION_PREFIX)) continue;

            const sid = name.replace(SESSION_PREFIX, "");
            const absoluteDirPath = `${rootPath}/${name}`;
            const files: SessionFileInfo[] = [];
            let totalSizeBytes = 0;

            try {
                const dir = await logsRoot.getDirectoryHandle(name);
                const fileEntries = (dir as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]();
                for await (const [fileName, fileHandle] of { [Symbol.asyncIterator]: () => fileEntries }) {
                    if (fileHandle.kind !== "file") continue;
                    try {
                        const fh = await dir.getFileHandle(fileName);
                        const file = await fh.getFile();
                        const sizeBytes = file.size;
                        totalSizeBytes += sizeBytes;
                        files.push({
                            name: fileName,
                            absolutePath: `${absoluteDirPath}/${fileName}`,
                            sizeBytes,
                            lastModified: new Date(file.lastModified).toISOString(),
                        });
                    } catch {
                        files.push({
                            name: fileName,
                            absolutePath: `${absoluteDirPath}/${fileName}`,
                            sizeBytes: 0,
                            lastModified: "unknown",
                        });
                    }
                }
            } catch {
                // Directory exists but can't be read
            }

            sessions.push({ sessionId: sid, absolutePath: absoluteDirPath, files, totalSizeBytes });
        }
    } catch {
        // OPFS root or session-logs dir doesn't exist
    }

    sessions.sort((a, b) => Number(b.sessionId) - Number(a.sessionId));
    return { rootPath, sessions, totalSessions: sessions.length };
}
