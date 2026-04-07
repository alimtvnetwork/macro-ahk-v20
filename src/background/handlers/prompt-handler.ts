/* eslint-disable sonarjs/no-duplicate-string -- prompt seed data repeats timestamps and fields */
/**
 * Marco Extension — Prompt CRUD Handler (Spec 15 T-10)
 *
 * Manages custom prompts in SQLite (logs.db).
 * Automatically migrates existing prompts from chrome.storage.local on first load.
 * Seeds default prompts into the Prompts table so they are always visible.
 *
 * Categories are stored in PromptsCategory with a many-to-many junction
 * table PromptsToCategory. All relational reads use the PromptsDetails view.
 *
 * All column names use PascalCase per database naming convention.
 *
 * @see spec/05-chrome-extension/45-prompt-manager-crud.md — Prompt manager CRUD
 * @see spec/05-chrome-extension/52-prompt-caching-indexeddb.md — Prompt caching
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";
import { logCaughtError, BgLogTag} from "../bg-logger";

const LEGACY_STORAGE_KEY = "marco_custom_prompts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PromptEntry {
    id: string;
    slug?: string;
    name: string;
    text: string;
    version?: string;
    order: number;
    isDefault?: boolean;
    isFavorite?: boolean;
    category?: string;
    categories?: string;
    createdAt: string;
    updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  DbManager binding                                                  */
/* ------------------------------------------------------------------ */

let dbManager: DbManager | null = null;

export function bindPromptDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) {
        throw new Error("[prompts] DbManager not bound. Call bindPromptDbManager() first.");
    }
    return dbManager.getLogsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

/* ------------------------------------------------------------------ */
/*  SQLite helpers                                                     */
/* ------------------------------------------------------------------ */

function ensurePromptsTable(): void {
    const db = getDb();
    db.run(`
        CREATE TABLE IF NOT EXISTS Prompts (
            Id         INTEGER PRIMARY KEY AUTOINCREMENT,
            Slug       TEXT UNIQUE,
            Name       TEXT NOT NULL,
            Text       TEXT NOT NULL,
            Version    TEXT DEFAULT '1.0.0',
            SortOrder  INTEGER DEFAULT 0,
            IsDefault  INTEGER DEFAULT 0,
            IsFavorite INTEGER DEFAULT 0,
            CreatedAt  TEXT NOT NULL,
            UpdatedAt  TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS PromptsCategory (
            Id        INTEGER PRIMARY KEY AUTOINCREMENT,
            Name      TEXT NOT NULL UNIQUE,
            SortOrder INTEGER DEFAULT 0,
            CreatedAt TEXT NOT NULL
        )
    `);
    db.run(`
        CREATE TABLE IF NOT EXISTS PromptsToCategory (
            Id         INTEGER PRIMARY KEY AUTOINCREMENT,
            PromptId   INTEGER NOT NULL,
            CategoryId INTEGER NOT NULL,
            FOREIGN KEY (PromptId) REFERENCES Prompts(Id) ON DELETE CASCADE,
            FOREIGN KEY (CategoryId) REFERENCES PromptsCategory(Id) ON DELETE CASCADE,
            UNIQUE (PromptId, CategoryId)
        )
    `);
    // Migration: add Version column if missing
    try { db.run("ALTER TABLE Prompts ADD COLUMN Version TEXT DEFAULT '1.0.0'"); } catch { /* already exists */ }
    // Migration: add Slug column if missing (UNIQUE cannot be in ALTER TABLE ADD COLUMN in SQLite)
    try { db.run("ALTER TABLE Prompts ADD COLUMN Slug TEXT"); } catch { /* already exists */ }
    // Ensure unique index on Slug (safe to call repeatedly)
    try { db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_prompts_slug ON Prompts(Slug)"); } catch { /* already exists */ }
}

/** Ensures a category exists and returns its ID (INTEGER AUTOINCREMENT). */
function ensureCategoryId(categoryName: string): string {
    const db = getDb();
    const trimmed = categoryName.trim();
    if (!trimmed) return "";

    const existing = db.exec("SELECT Id FROM PromptsCategory WHERE Name = ?", [trimmed]);
    if (existing.length > 0 && existing[0].values.length > 0) {
        return String(existing[0].values[0][0]);
    }

    const now = new Date().toISOString();
    db.run(
        "INSERT INTO PromptsCategory (Name, SortOrder, CreatedAt) VALUES (?, 0, ?)",
        [trimmed, now],
    );
    const result = db.exec("SELECT last_insert_rowid()");
    return String(result[0].values[0][0]);
}

/** Links a prompt to a category via the junction table. */
function linkPromptToCategory(promptId: string, categoryId: string): void {
    if (!categoryId) return;
    const db = getDb();
    try {
        db.run(
            "INSERT OR IGNORE INTO PromptsToCategory (PromptId, CategoryId) VALUES (?, ?)",
            [Number(promptId), Number(categoryId)],
        );
    } catch {
        // Already linked — safe to ignore
    }
}

function rowToPrompt(row: Record<string, unknown>): PromptEntry {
    return {
        id: String(row.Id ?? row.PromptId ?? row.id ?? row.promptId ?? ""),
        name: String(row.Name ?? row.Title ?? row.name ?? row.title ?? ""),
        text: String(row.Text ?? row.Content ?? row.text ?? row.content ?? ""),
        version: String(row.Version ?? row.version ?? "1.0.0"),
        order: Number(row.SortOrder ?? row.sortOrder ?? row.sort_order ?? 0),
        isDefault: (row.IsDefault ?? row.isDefault ?? row.is_default) === 1,
        isFavorite: (row.IsFavorite ?? row.isFavorite ?? row.is_favorite) === 1,
        category: row.Categories ? String(row.Categories) : (row.categories ? String(row.categories) : undefined),
        categories: row.Categories ? String(row.Categories) : (row.categories ? String(row.categories) : undefined),
        slug: row.Slug ? String(row.Slug) : (row.slug ? String(row.slug) : undefined),
        createdAt: String(row.CreatedAt ?? row.createdAt ?? row.created_at ?? ""),
        updatedAt: String(row.UpdatedAt ?? row.updatedAt ?? row.updated_at ?? ""),
    };
}

/** Reads all prompts using the PromptsDetails view for joined data. */
function queryAllPromptsViaView(): PromptEntry[] {
    const db = getDb();
    try {
        const stmt = db.prepare("SELECT * FROM PromptsDetails ORDER BY SortOrder ASC");
        const results: PromptEntry[] = [];
        while (stmt.step()) {
            results.push(rowToPrompt(stmt.getAsObject()));
        }
        stmt.free();
        return results;
    } catch {
        // View may not exist yet — fall back to direct query
        return queryAllPromptsDirect();
    }
}

function queryAllPromptsDirect(): PromptEntry[] {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM Prompts ORDER BY SortOrder ASC");
    const results: PromptEntry[] = [];
    while (stmt.step()) {
        results.push(rowToPrompt(stmt.getAsObject()));
    }
    stmt.free();
    return results;
}

function queryAllCustomPrompts(): PromptEntry[] {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM Prompts WHERE IsDefault = 0 ORDER BY SortOrder ASC");
    const results: PromptEntry[] = [];
    while (stmt.step()) {
        results.push(rowToPrompt(stmt.getAsObject()));
    }
    stmt.free();
    return results;
}

/* ------------------------------------------------------------------ */
/*  Migration: chrome.storage.local → SQLite                           */
/* ------------------------------------------------------------------ */

let migrationDone = false;

async function migrateFromStorageIfNeeded(): Promise<void> {
    if (migrationDone) return;
    migrationDone = true;

    try {
        ensurePromptsTable();
        await seedDefaultPromptsIfEmpty();

        const db = getDb();
        const countResult = db.exec("SELECT COUNT(*) as cnt FROM Prompts WHERE IsDefault = 0");
        const existingCount = countResult.length > 0 ? Number(countResult[0].values[0][0]) : 0;
        if (existingCount > 0) return;

        const localResult = await chrome.storage.local.get(LEGACY_STORAGE_KEY);
        const legacyPrompts = localResult[LEGACY_STORAGE_KEY];
        if (!Array.isArray(legacyPrompts) || legacyPrompts.length === 0) return;

        try {
            const syncResult = await chrome.storage.sync.get(LEGACY_STORAGE_KEY);
            const syncData = syncResult[LEGACY_STORAGE_KEY];
            if (Array.isArray(syncData) && syncData.length > 0 && legacyPrompts.length === 0) {
                for (const prompt of syncData) {
                    insertPromptRow(prompt as PromptEntry);
                }
                await chrome.storage.sync.remove(LEGACY_STORAGE_KEY);
                console.log(`[prompts] Migrated ${syncData.length} prompts from sync → SQLite`);
                markDirty();
                return;
            }
        } catch {
            // sync unavailable
        }

        for (const prompt of legacyPrompts) {
            insertPromptRow(prompt as PromptEntry);
        }

        console.log(`[prompts] Migrated ${legacyPrompts.length} prompts from storage.local → SQLite`);
        markDirty();
        await chrome.storage.local.remove(LEGACY_STORAGE_KEY);
    } catch (err) {
        logCaughtError(BgLogTag.PROMPTS, "Migration error", err);
    }
}

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
function insertPromptRow(prompt: PromptEntry): void {
    const db = getDb();
    const now = new Date().toISOString();
    const slug = prompt.id || undefined; // Legacy text IDs become slugs

    // Check if a prompt with this slug already exists (for seeding dedup)
    if (slug) {
        const existing = db.exec("SELECT Id FROM Prompts WHERE Slug = ?", [slug]);
        if (existing.length > 0 && existing[0].values.length > 0) {
            // Already seeded — update instead
            const existingId = existing[0].values[0][0];
            db.run(
                `UPDATE Prompts SET Name = ?, Text = ?, Version = ?, SortOrder = ?, IsDefault = ?, IsFavorite = ?, UpdatedAt = ? WHERE Id = ?`,
                [prompt.name || "Untitled", prompt.text || "", prompt.version || "1.0.0", prompt.order ?? 0, prompt.isDefault ? 1 : 0, prompt.isFavorite ? 1 : 0, prompt.updatedAt || now, existingId],
            );
            const promptId = String(existingId);
            const category = prompt.category || "";
            if (category) {
                const categoryId = ensureCategoryId(category);
                linkPromptToCategory(promptId, categoryId);
            }
            return;
        }
    }

    db.run(
        `INSERT INTO Prompts (Slug, Name, Text, Version, SortOrder, IsDefault, IsFavorite, CreatedAt, UpdatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            slug || null,
            prompt.name || "Untitled",
            prompt.text || "",
            prompt.version || "1.0.0",
            prompt.order ?? 0,
            prompt.isDefault ? 1 : 0,
            prompt.isFavorite ? 1 : 0,
            prompt.createdAt || now,
            prompt.updatedAt || now,
        ],
    );

    const result = db.exec("SELECT last_insert_rowid()");
    const promptId = String(result[0].values[0][0]);

    // Handle category via junction table
    const category = prompt.category || "";
    if (category) {
        const categoryId = ensureCategoryId(category);
        linkPromptToCategory(promptId, categoryId);
    }
}

/* ------------------------------------------------------------------ */
/*  Default prompts seeding                                            */
/* ------------------------------------------------------------------ */

const PROMPTS_SEED_VERSION_KEY = "marco_prompts_seed_version";

/**
 * Seeds default prompts into the Prompts table if:
 * 1. The table is empty (first run), OR
 * 2. The bundled prompts version has changed since last seed.
 *
 * Version is derived from the count + hash of bundled prompt names.
 * This ensures re-seeding happens on extension updates that add/change prompts,
 * but NOT on every startup.
 */
async function seedDefaultPromptsIfEmpty(): Promise<void> {
    const db = getDb();
    const countResult = db.exec("SELECT COUNT(*) FROM Prompts");
    const count = countResult.length > 0 ? Number(countResult[0].values[0][0]) : 0;

    const defaults = (await loadBundledDefaultPrompts()) ?? getFallbackDefaultPrompts();
    const bundledVersion = computeBundledVersion(defaults);

    if (count === 0) {
        // First run — seed everything
        console.log("[prompts] Prompts table empty — seeding defaults...");
        for (const prompt of defaults) {
            insertPromptRow(prompt);
        }
        markDirty();
        await chrome.storage.local.set({ [PROMPTS_SEED_VERSION_KEY]: bundledVersion });
        console.log(`[prompts] Seeded ${defaults.length} default prompts (version: ${bundledVersion})`);
        return;
    }

    // Check if bundled version changed
    const stored = await chrome.storage.local.get(PROMPTS_SEED_VERSION_KEY);
    const storedVersion = stored[PROMPTS_SEED_VERSION_KEY] as string | undefined;

    if (storedVersion === bundledVersion) {
        return; // No change — skip re-seeding
    }

    console.log(`[prompts] Bundled prompts version changed (${storedVersion ?? "none"} → ${bundledVersion}) — re-seeding defaults...`);

    // Re-seed: upsert defaults (insertPromptRow handles slug-based dedup)
    for (const prompt of defaults) {
        insertPromptRow(prompt);
    }
    markDirty();
    await chrome.storage.local.set({ [PROMPTS_SEED_VERSION_KEY]: bundledVersion });
    console.log(`[prompts] Re-seeded ${defaults.length} default prompts (version: ${bundledVersion})`);
}

/** Compute a simple version string from bundled prompts for change detection. */
function computeBundledVersion(prompts: PromptEntry[]): string {
    const signature = prompts
        .map((p) => `${p.id ?? ""}:${p.name}:${p.version ?? "1.0.0"}`)
        .join("|");
    // Simple hash
    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
        hash = ((hash << 5) - hash + signature.charCodeAt(i)) | 0;
    }
    return `${prompts.length}-${(hash >>> 0).toString(36)}`;
}

function getFallbackDefaultPrompts(): PromptEntry[] {
    return [
        { id: "default-start", name: "Start Prompt", text: "Write a readme.txt text file with 3 words with no context at all \"let's start now {date:dd-MMM-YYYY} {time:12 hr clock format exact time now for malaysia}\"", order: 0, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-start-v2", name: "Start Prompt v2", text: "Write a readme.txt text file with 3 words with no context at all \"let's start now {date:dd-MMM-YYYY} {time:12 hr clock format exact time now for malaysia}\"\n\nUh, try to write a file to the Git system. I'm not sure what you are doing. I'm asking you to write the text file in the read.txt file, readme.txt file with the date and time, and you are not doing it. You are not doing a Git, uh, update. Are you stupid?", order: 1, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-rejog", name: "Rejog the Memory v1", text: "Read and synthesize existing repository context from the memory folder and the full specification set, then produce a reliability risk report before any implementation work begins.", order: 2, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-unified", name: "Unified AI Prompt v4", text: "Read and synthesize existing repository context. Follow Required Execution Order: scan repo, read memory, read specs, reconstruct context, produce reliability report, propose corrections, update memory, update plan, ask user which task to implement next.", order: 3, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-issues", name: "Issues Tracking", text: "Do not implement any code changes. Update specifications and documentation only. Enforce a strict workflow so the same mistakes do not repeat, and ensure every fix is recorded in a standardized issue write-up file and reflected in memory.", order: 4, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-test", name: "Unit Test Failing", text: "Fix failing tests: 1) Check code, 2) Check actual method implementation, 3) Check logical implementation of the test, 4) Check test case, 5) Fix logically either the implementation or the test. Document at /spec/05-failing-tests/{seq}-failing-test-name.md with root cause and solution.", order: 5, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-audit", name: "Audit Spec v1", text: "Perform a comprehensive audit of every specification file. Score each spec on Completeness, Consistency, Implementation Alignment, Clarity, Maintainability, and Test Coverage (1-10 scale). Produce a scorecard, detailed findings for specs below 8.0, cross-spec dependency map, and priority fix list. Write report to .memory/audit/spec-audit-report.md.", order: 6, isDefault: true, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-minor-bump", name: "Minor Bump", text: "Bump all Minor versions for all", order: 7, isDefault: true, category: "versioning", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-major-bump", name: "Major Bump", text: "Bump all Major versions for all", order: 8, isDefault: true, category: "versioning", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-patch-bump", name: "Patch Bump", text: "Bump all Patch versions for all", order: 9, isDefault: true, category: "versioning", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "default-code-coverage-basic", name: "Code Coverage Basic", text: "Based on low-coverage packages (>1000 lines), plan 200-line segments for coverage tests. Cover branches, logical segments. Follow AAA format, naming conventions, Should Be methods.", order: 10, isDefault: true, category: "code-coverage", createdAt: "2026-03-21T00:00:00Z", updatedAt: "2026-03-21T00:00:00Z" },
        { id: "default-code-coverage-details", name: "Code Coverage Details", text: "Plan 200-line segments for low-coverage packages. Follow AAA format, naming conventions. Identify packages >1000 lines, segment into 200-line chunks, cover branches and logical flows.", order: 11, isDefault: true, category: "code-coverage", createdAt: "2026-03-21T00:00:00Z", updatedAt: "2026-03-21T00:00:00Z" },
        { id: "default-next-tasks", name: "Next Tasks", text: "Next,\n\nList out the remaining tasks always, if you finish then in future `next` command, find any remaining tasks from memory and suggest", order: 12, isDefault: true, category: "automation", createdAt: "2026-03-21T00:00:00Z", updatedAt: "2026-03-21T00:00:00Z" },
        { id: "default-unit-test-issues-v2-enhanced", name: "Unit Test Issues V2 Enhanced", text: "Based on the packages that have low coverage, if a package has more than 1000 lines, then for that specific package we should split it into segments of 200 lines per task.\n\nYou should create a plan where each 200-line segment is treated as one task. Each task should focus on writing meaningful test coverage, including:\n- Branch coverage\n- Logical segment coverage\n- Edge cases\n\nFirst, create a detailed plan outlining:\n- Which packages will be handled\n- How many segments each package will be split into\n- The step-by-step execution plan\n\nEach time I say \"next\", you should proceed with the next package or segment and work towards achieving 100% code coverage.", order: 13, isDefault: true, category: "code-coverage", createdAt: "2026-03-21T00:00:00Z", updatedAt: "2026-03-21T00:00:00Z" },
    ];
}

let bundledDefaultsCache: PromptEntry[] | null = null;

export async function loadBundledDefaultPrompts(): Promise<PromptEntry[] | null> {
    if (bundledDefaultsCache !== null) return bundledDefaultsCache;

    try {
        const url = chrome.runtime.getURL("prompts/macro-prompts.json");
        const response = await fetch(url);
        if (!response.ok) return null;

        const parsed = await response.json() as { prompts?: Array<{ name?: unknown; text?: unknown; category?: unknown }> } | Array<{ name?: unknown; text?: unknown; category?: unknown }>;
        const rawEntries = Array.isArray(parsed)
            ? parsed
            : (Array.isArray(parsed.prompts) ? parsed.prompts : []);

        const now = new Date().toISOString();
        const defaults = rawEntries
            .map((entry, index) => {
                const name = typeof entry.name === "string" ? entry.name : "";
                const text = typeof entry.text === "string" ? entry.text : "";
                if (!name || !text) return null;
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
                const category = typeof entry.category === "string" && entry.category ? entry.category : undefined;
                return {
                    id: `default-${slug || index}`,
                    name,
                    text,
                    order: index,
                    isDefault: true,
                    category,
                    createdAt: now,
                    updatedAt: now,
                } as PromptEntry;
            })
            .filter((entry): entry is PromptEntry => entry !== null);

        if (defaults.length === 0) return null;
        bundledDefaultsCache = defaults;
        return defaults;
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/*  Public Handlers                                                    */
/* ------------------------------------------------------------------ */

export async function handleGetPrompts(): Promise<{ prompts: PromptEntry[] }> {
    await migrateFromStorageIfNeeded();

    // All prompts (defaults + custom) are now in the DB — read via view
    const prompts = queryAllPromptsViaView();
    return { prompts };
}

// eslint-disable-next-line max-lines-per-function, sonarjs/cognitive-complexity
export async function handleSavePrompt(msg: unknown): Promise<{ isOk: true; prompt: PromptEntry }> {
    await migrateFromStorageIfNeeded();

    const input = msg as { prompt: Partial<PromptEntry> };
    const now = new Date().toISOString();
    const db = getDb();

    // Check if updating an existing prompt (id is an integer string)
    let promptId = input.prompt.id;
    let exists = false;
    if (promptId) {
        const existingResult = db.exec("SELECT Id FROM Prompts WHERE Id = ?", [Number(promptId)]);
        exists = existingResult.length > 0 && existingResult[0].values.length > 0;
    }

    if (exists && promptId) {
        const setClauses: string[] = [];
        const values: unknown[] = [];

        if (input.prompt.name !== undefined) { setClauses.push("Name = ?"); values.push(input.prompt.name); }
        if (input.prompt.text !== undefined) { setClauses.push("Text = ?"); values.push(input.prompt.text); }
        if (input.prompt.order !== undefined) { setClauses.push("SortOrder = ?"); values.push(input.prompt.order); }
        if (input.prompt.isFavorite !== undefined) { setClauses.push("IsFavorite = ?"); values.push(input.prompt.isFavorite ? 1 : 0); }
        setClauses.push("UpdatedAt = ?"); values.push(now);
        values.push(Number(promptId));

        db.run(`UPDATE Prompts SET ${setClauses.join(", ")} WHERE Id = ?`, values);

        // Update category via junction table if provided
        if (input.prompt.category !== undefined) {
            db.run("DELETE FROM PromptsToCategory WHERE PromptId = ?", [Number(promptId)]);
            if (input.prompt.category) {
                const categoryId = ensureCategoryId(input.prompt.category);
                linkPromptToCategory(promptId, categoryId);
            }
        }
    } else {
        db.run(
            `INSERT INTO Prompts (Name, Text, Version, SortOrder, IsDefault, IsFavorite, CreatedAt, UpdatedAt)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?)`,
            [
                input.prompt.name ?? "Untitled Prompt",
                input.prompt.text ?? "",
                input.prompt.version ?? "1.0.0",
                input.prompt.order ?? 0,
                input.prompt.isFavorite ? 1 : 0,
                now,
                now,
            ],
        );

        const result = db.exec("SELECT last_insert_rowid()");
        promptId = String(result[0].values[0][0]);

        // Link category
        if (input.prompt.category) {
            const categoryId = ensureCategoryId(input.prompt.category);
            linkPromptToCategory(promptId, categoryId);
        }
    }

    markDirty();

    const saved = db.exec("SELECT * FROM Prompts WHERE Id = ?", [Number(promptId)]);
    const row = saved.length > 0 && saved[0].values.length > 0
        ? Object.fromEntries(saved[0].columns.map((col, i) => [col, saved[0].values[0][i]]))
        : { Id: Number(promptId), Name: input.prompt.name ?? "Untitled", Text: input.prompt.text ?? "", SortOrder: 0, IsDefault: 0, IsFavorite: 0, CreatedAt: now, UpdatedAt: now };

    return { isOk: true, prompt: rowToPrompt(row) };
}

export async function handleDeletePrompt(msg: unknown): Promise<{ isOk: true }> {
    await migrateFromStorageIfNeeded();

    const { promptId } = msg as { promptId: string };
    const numId = Number(promptId);
    const db = getDb();
    // Delete junction entries first
    db.run("DELETE FROM PromptsToCategory WHERE PromptId = ?", [numId]);
    db.run("DELETE FROM Prompts WHERE Id = ? AND IsDefault = 0", [numId]);
    markDirty();
    return { isOk: true };
}

export async function handleReorderPrompts(msg: unknown): Promise<{ isOk: true }> {
    await migrateFromStorageIfNeeded();

    const { promptIds } = msg as { promptIds: string[] };
    const db = getDb();

    for (let i = 0; i < promptIds.length; i++) {
        db.run("UPDATE Prompts SET SortOrder = ? WHERE Id = ?", [i, Number(promptIds[i])]);
    }

    markDirty();
    return { isOk: true };
}

/** Reseed prompts: clears all and re-inserts defaults. Updates version key. */
export async function reseedPrompts(): Promise<void> {
    ensurePromptsTable();
    const db = getDb();
    db.run("DELETE FROM PromptsToCategory");
    db.run("DELETE FROM Prompts");
    db.run("DELETE FROM PromptsCategory");

    bundledDefaultsCache = null;
    const defaults = (await loadBundledDefaultPrompts()) ?? getFallbackDefaultPrompts();
    for (const prompt of defaults) {
        insertPromptRow(prompt);
    }
    markDirty();

    // Update seed version so version-based seeding won't re-trigger
    const bundledVersion = computeBundledVersion(defaults);
    await chrome.storage.local.set({ [PROMPTS_SEED_VERSION_KEY]: bundledVersion });

    console.log(`[prompts] Reseeded ${defaults.length} default prompts (version: ${bundledVersion})`);
}
