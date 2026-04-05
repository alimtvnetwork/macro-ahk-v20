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

// Buffered writers — we append to the same files
const fileHandleCache = new Map<string, FileSystemFileHandle>();
const pendingWrites = new Map<string, string[]>();
let flushScheduled = false;

/* ------------------------------------------------------------------ */
/*  Initialization                                                     */
/* ------------------------------------------------------------------ */

/** Creates a new session directory in OPFS and prepares file handles. */
export async function initSessionLogDir(sid: string, ver: string): Promise<void> {
    sessionId = sid;
    version = ver;
    sessionStartedAt = new Date().toISOString();

    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME, { create: true });
        sessionDir = await logsRoot.getDirectoryHandle(`${SESSION_PREFIX}${sid}`, { create: true });

        // Write initial header to events.log
        const header = [
            LOG_SEPARATOR,
            `  Marco Session Log — Session #${sid}`,
            `  Started:  ${sessionStartedAt}`,
            `  Version:  ${ver}`,
            `  Platform: ${navigator.userAgent}`,
            LOG_SEPARATOR,
            "",
        ].join("\n");

        await appendToFile(EVENTS_LOG, header);
        await appendToFile(ERRORS_LOG, [
            `=== Errors — Session #${sid} — ${sessionStartedAt} ===`,
            "",
        ].join("\n"));
        await appendToFile(SCRIPTS_LOG, [
            `=== Script Lifecycle — Session #${sid} — ${sessionStartedAt} ===`,
            "",
        ].join("\n"));

        console.log(`[session-log-writer] Initialized session-logs/session-${sid}/`);

        // Fire-and-forget: prune old sessions on each new session start
        void pruneOldSessionLogs();
    } catch (err) {
        console.warn("[session-log-writer::initSessionDir] OPFS session dir init failed:", err);
        sessionDir = null;
    }
}

/* ------------------------------------------------------------------ */
/*  Write helpers                                                      */
/* ------------------------------------------------------------------ */

/** Appends text to a file in the session directory. Buffered + debounced. */
async function appendToFile(filename: string, text: string): Promise<void> {
    if (!sessionDir) return;

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
    if (!sessionDir) return;

    const entries = Array.from(pendingWrites.entries());
    pendingWrites.clear();

    for (const [filename, chunks] of entries) {
        try {
            let handle = fileHandleCache.get(filename);
            if (!handle) {
                handle = await sessionDir.getFileHandle(filename, { create: true });
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
            console.warn(`[session-log-writer::flushPending] Failed to write ${filename}:`, err);
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

    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);
        const dir = await logsRoot.getDirectoryHandle(`${SESSION_PREFIX}${targetSid}`);

        const sections: string[] = [];

        // Read each log file
        for (const filename of ["events.log", "errors.log", "scripts.log"]) {
            try {
                const handle = await dir.getFileHandle(filename);
                const file = await handle.getFile();
                const text = await file.text();
                if (text.trim()) {
                    sections.push(text);
                }
            } catch {
                // File may not exist yet — skip
            }
        }

        if (sections.length === 0) {
            return `[Session #${targetSid}] No log files found.`;
        }

        const ver = version || "?";
        const header = [
            LOG_SEPARATOR,
            `  Marco Full Session Report`,
            `  Session:   #${targetSid}`,
            `  Generated: ${new Date().toISOString()}`,
            `  Version:   ${ver}`,
            LOG_SEPARATOR,
            "",
        ].join("\n");

        return header + sections.join("\n\n");
    } catch (err) {
        return `[session-log-writer] Failed to read session #${targetSid}: ${err}`;
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
                // No events.log → stale dir, mark for deletion
                toDelete.push(name);
            }
        }

        for (const name of toDelete) {
            await logsRoot.removeEntry(name, { recursive: true });
            removed++;
        }

        if (removed > 0) {
            console.log(`[session-log-writer] Pruned ${removed} session dirs older than ${maxAgeDays}d`);
        }
    } catch (err) {
        console.warn("[session-log-writer::pruneOldSessionLogs] Session log pruning failed:", err);
    }
    return removed;
}

/** Lists all available session IDs from OPFS. */
export async function listSessionIds(): Promise<string[]> {
    try {
        const root = await navigator.storage.getDirectory();
        const logsRoot = await root.getDirectoryHandle(LOGS_DIR_NAME);
        const ids: string[] = [];

        const entries = (logsRoot as FileSystemDirectoryHandle & AsyncIterable<[string, FileSystemHandle]>)[Symbol.asyncIterator]();
        for await (const [name, handle] of { [Symbol.asyncIterator]: () => entries }) {
            if (handle.kind === "directory" && name.startsWith(SESSION_PREFIX)) {
                ids.push(name.replace(SESSION_PREFIX, ""));
            }
        }

        return ids.sort((a, b) => Number(b) - Number(a));
    } catch {
        return [];
    }
}
