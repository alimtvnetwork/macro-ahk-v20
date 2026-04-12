/**
 * Marco Extension — SQLite Bundle Export / Import
 *
 * Exports all projects, scripts, configs, and prompts into a single SQLite DB
 * file, compressed as a .zip for portability.
 * Import reads the same format and replaces all existing data.
 *
 * ALL table and column names use PascalCase — no underscores allowed.
 *
 * ID CONVENTION: All primary key `Id` columns use INTEGER PRIMARY KEY AUTOINCREMENT.
 * Original runtime IDs are stored in a separate `Uid` TEXT column for merge/diff matching.
 * See: spec/06-coding-guidelines/coding-guidelines/database-id-convention.md
 */

import type { SqlValue } from "@/background/handlers/handler-types";
import initSqlJs, { type Database } from "sql.js";
import JSZip from "jszip";
import { sendMessage } from "@/lib/message-client";
import type {
  StoredProject,
  StoredScript,
  StoredConfig,
} from "@/hooks/use-projects-scripts";
import type { PromptEntry } from "@/hooks/use-prompts";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DB_FILENAME = "marco-backup.db";
const ZIP_FILENAME = "marco-backup.zip";
const WASM_URL = "https://sql.js.org/dist/sql-wasm.wasm";

/* ------------------------------------------------------------------ */
/*  Schema (PascalCase, INTEGER AUTOINCREMENT IDs)                     */
/* ------------------------------------------------------------------ */

const CREATE_PROJECTS_TABLE = `
  CREATE TABLE IF NOT EXISTS Projects (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Uid TEXT,
    SchemaVersion INTEGER NOT NULL DEFAULT 1,
    Name TEXT NOT NULL,
    Version TEXT NOT NULL,
    Description TEXT,
    TargetUrls TEXT,
    Scripts TEXT,
    Configs TEXT,
    CookieRules TEXT,
    Settings TEXT,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
  );
`;

const CREATE_SCRIPTS_TABLE = `
  CREATE TABLE IF NOT EXISTS Scripts (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Uid TEXT,
    Name TEXT NOT NULL,
    Description TEXT,
    Code TEXT NOT NULL,
    RunOrder INTEGER NOT NULL DEFAULT 0,
    RunAt TEXT,
    ConfigBinding TEXT,
    IsIife INTEGER DEFAULT 0,
    HasDomUsage INTEGER DEFAULT 0,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
  );
`;

const CREATE_CONFIGS_TABLE = `
  CREATE TABLE IF NOT EXISTS Configs (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Uid TEXT,
    Name TEXT NOT NULL,
    Description TEXT,
    Json TEXT NOT NULL,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
  );
`;

const CREATE_META_TABLE = `
  CREATE TABLE IF NOT EXISTS Meta (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Key TEXT UNIQUE NOT NULL,
    Value TEXT
  );
`;

const CREATE_PROMPTS_TABLE = `
  CREATE TABLE IF NOT EXISTS Prompts (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    Uid TEXT,
    Name TEXT NOT NULL,
    Text TEXT NOT NULL,
    RunOrder INTEGER NOT NULL DEFAULT 0,
    IsDefault INTEGER DEFAULT 0,
    IsFavorite INTEGER DEFAULT 0,
    Category TEXT,
    CreatedAt TEXT NOT NULL,
    UpdatedAt TEXT NOT NULL
  );
`;

/* ------------------------------------------------------------------ */
/*  Init sql.js                                                        */
/* ------------------------------------------------------------------ */

async function initDb(): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => WASM_URL });
  return new SQL.Database();
}

async function openDb(data: Uint8Array): Promise<Database> {
  const SQL = await initSqlJs({ locateFile: () => WASM_URL });
  return new SQL.Database(data);
}

/* ------------------------------------------------------------------ */
/*  Export                                                             */
/* ------------------------------------------------------------------ */

function insertProjects(db: Database, projects: StoredProject[]): void {
  const stmt = db.prepare(`
    INSERT INTO Projects (Uid, SchemaVersion, Name, Version, Description,
      TargetUrls, Scripts, Configs, CookieRules, Settings, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const p of projects) {
    stmt.run([
      p.id ?? null,
      p.schemaVersion ?? 1,
      p.name ?? "",
      p.version ?? "1.0.0",
      p.description ?? null,
      JSON.stringify(p.targetUrls ?? []),
      JSON.stringify(p.scripts ?? []),
      JSON.stringify(p.configs ?? []),
      JSON.stringify(p.cookieRules ?? []),
      JSON.stringify(p.settings ?? {}),
      p.createdAt ?? now,
      p.updatedAt ?? now,
    ]);
  }
  stmt.free();
}

function insertScripts(db: Database, scripts: StoredScript[]): void {
  const stmt = db.prepare(`
    INSERT INTO Scripts (Uid, Name, Description, Code, RunOrder, RunAt,
      ConfigBinding, IsIife, HasDomUsage, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const s of scripts) {
    stmt.run([
      s.id ?? null,
      s.name ?? "",
      s.description ?? null,
      s.code ?? "",
      s.order ?? 0,
      s.runAt ?? null,
      s.configBinding ?? null,
      s.isIife ? 1 : 0,
      s.hasDomUsage ? 1 : 0,
      s.createdAt ?? now,
      s.updatedAt ?? now,
    ]);
  }
  stmt.free();
}

function insertConfigs(db: Database, configs: StoredConfig[]): void {
  const stmt = db.prepare(`
    INSERT INTO Configs (Uid, Name, Description, Json, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();

  for (const c of configs) {
    stmt.run([
      c.id ?? null,
      c.name ?? "",
      c.description ?? null,
      c.json ?? "{}",
      c.createdAt ?? now,
      c.updatedAt ?? now,
    ]);
  }
  stmt.free();
}

function insertMeta(db: Database): void {
  const now = new Date().toISOString();
  db.run(`INSERT INTO Meta (Key, Value) VALUES ('exported_at', ?)`, [now]);
  db.run(`INSERT INTO Meta (Key, Value) VALUES ('format_version', '4')`, []);
}

function insertPrompts(db: Database, prompts: PromptEntry[]): void {
  const stmt = db.prepare(`
    INSERT INTO Prompts (Uid, Name, Text, RunOrder, IsDefault, IsFavorite,
      Category, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  for (const p of prompts) {
    stmt.run([
      p.id ?? null,
      p.name ?? "",
      p.text ?? "",
      p.order ?? 0,
      p.isDefault ? 1 : 0,
      p.isFavorite ? 1 : 0,
      p.category ?? null,
      p.createdAt ?? now,
      p.updatedAt ?? now,
    ]);
  }
  stmt.free();
}

/** Fetches all data, builds a SQLite DB, zips it, and triggers download. */
// eslint-disable-next-line max-lines-per-function
export async function exportAllAsSqliteZip(): Promise<void> {
  const [projRes, scriptsRes, configsRes, promptsRes] = await Promise.all([
    sendMessage<{ projects: StoredProject[] }>({ type: "GET_ALL_PROJECTS" }),
    sendMessage<{ scripts: StoredScript[] }>({ type: "GET_ALL_SCRIPTS" }),
    sendMessage<{ configs: StoredConfig[] }>({ type: "GET_ALL_CONFIGS" }),
    sendMessage<{ prompts?: PromptEntry[] }>({ type: "GET_PROMPTS" }),
  ]);

  const prompts: PromptEntry[] = Array.isArray(promptsRes.prompts)
    ? promptsRes.prompts.map((raw, i) => {
        const r = raw as unknown as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          name: (r.name as string) ?? "",
          text: (r.text as string) ?? "",
          order: typeof r.order === "number" ? r.order : i,
          isDefault: r.isDefault === true,
          isFavorite: r.isFavorite === true,
          category: typeof r.category === "string" ? r.category : undefined,
          createdAt: (r.createdAt as string) ?? new Date().toISOString(),
          updatedAt: (r.updatedAt as string) ?? new Date().toISOString(),
        };
      })
    : [];

  const db = await initDb();

  db.run(CREATE_PROJECTS_TABLE);
  db.run(CREATE_SCRIPTS_TABLE);
  db.run(CREATE_CONFIGS_TABLE);
  db.run(CREATE_PROMPTS_TABLE);
  db.run(CREATE_META_TABLE);

  insertProjects(db, projRes.projects);
  insertScripts(db, scriptsRes.scripts);
  insertConfigs(db, configsRes.configs);
  insertPrompts(db, prompts);
  insertMeta(db);

  const dbData = db.export();
  db.close();

  const zip = new JSZip();
  zip.file(DB_FILENAME, dbData);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  triggerDownload(blob, ZIP_FILENAME);
}

/** Exports a single project (with all related scripts & configs) as a SQLite zip. */
// eslint-disable-next-line max-lines-per-function
export async function exportProjectAsSqliteZip(project: StoredProject): Promise<void> {
  const [scriptsRes, configsRes] = await Promise.all([
    sendMessage<{ scripts: StoredScript[] }>({ type: "GET_ALL_SCRIPTS" }),
    sendMessage<{ configs: StoredConfig[] }>({ type: "GET_ALL_CONFIGS" }),
  ]);

  // Filter scripts & configs referenced by this project
  const scriptPaths = new Set((project.scripts ?? []).map((s) => s.path));
  const configPaths = new Set((project.configs ?? []).map((c) => c.path));

  const relatedScripts = scriptsRes.scripts.filter((s) => scriptPaths.has(s.id) || scriptPaths.has(s.name));
  const relatedConfigs = configsRes.configs.filter((c) => configPaths.has(c.id) || configPaths.has(c.name));

  // Create synthetic script records for inline code that didn't match a library script
  const matchedIds = new Set(relatedScripts.map((s) => s.name));
  const matchedNames = new Set(relatedScripts.map((s) => s.id));
  const now = new Date().toISOString();

  for (const entry of project.scripts ?? []) {
    const alreadyMatched = matchedIds.has(entry.path) || matchedNames.has(entry.path);
    if (!alreadyMatched && entry.code) {
      relatedScripts.push({
        id: `inline_${entry.path.replace(/[^a-zA-Z0-9]/g, "_")}`,
        name: entry.path,
        code: entry.code,
        order: entry.order,
        runAt: entry.runAt,
        configBinding: entry.configBinding,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const db = await initDb();

  db.run(CREATE_PROJECTS_TABLE);
  db.run(CREATE_SCRIPTS_TABLE);
  db.run(CREATE_CONFIGS_TABLE);
  db.run(CREATE_PROMPTS_TABLE);
  db.run(CREATE_META_TABLE);

  insertProjects(db, [project]);
  insertScripts(db, relatedScripts);
  insertConfigs(db, relatedConfigs);
  insertMeta(db);

  const dbData = db.export();
  db.close();

  const zip = new JSZip();
  zip.file(DB_FILENAME, dbData);

  const safeName = project.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  triggerDownload(blob, `${safeName}-backup.zip`);
}

/* ------------------------------------------------------------------ */
/*  Import                                                             */
/* ------------------------------------------------------------------ */

/**
 * Column name resolver — supports PascalCase (v3+), legacy snake_case,
 * and the new Uid column (v4+) with fallback to old Id TEXT column.
 */
function col(obj: Record<string, SqlValue>, pascalName: string, snakeName: string): SqlValue {
  return obj[pascalName] ?? obj[snakeName];
}

/** Resolves the runtime UID: prefers Uid column (v4+), falls back to Id column (v3 TEXT PK bundles). */
function resolveUid(obj: Record<string, unknown>): string {
  const uid = obj["Uid"] ?? obj["uid"];
  if (uid != null && String(uid) !== "") return String(uid);
  // Fallback for v3 bundles where Id was TEXT PK containing the runtime UUID
  const id = obj["Id"] ?? obj["id"];
  return String(id ?? "");
}

function readProjects(db: Database): StoredProject[] {
  let rows;
  try { rows = db.exec("SELECT * FROM Projects"); } catch {
    try { rows = db.exec("SELECT * FROM projects"); } catch { return []; }
  }
  const hasRows = rows.length > 0 && rows[0].values.length > 0;
  if (!hasRows) return [];

  const cols = rows[0].columns;
  return rows[0].values.map((row: SqlValue[]) => {
    const obj = Object.fromEntries(cols.map((c: SqlValue, i: number) => [c, row[i]]));
    return {
      id: resolveUid(obj),
      schemaVersion: (col(obj, "SchemaVersion", "schema_version") as number) ?? 1,
      name: (col(obj, "Name", "name") as string),
      version: (col(obj, "Version", "version") as string),
      description: (col(obj, "Description", "description") as string) ?? undefined,
      targetUrls: safeJsonParse(col(obj, "TargetUrls", "target_urls") as string, []),
      scripts: safeJsonParse(col(obj, "Scripts", "scripts") as string, []),
      configs: safeJsonParse(col(obj, "Configs", "configs") as string, []),
      cookieRules: safeJsonParse(col(obj, "CookieRules", "cookie_rules") as string, []),
      settings: safeJsonParse(col(obj, "Settings", "settings") as string, {}),
      createdAt: (col(obj, "CreatedAt", "created_at") as string),
      updatedAt: (col(obj, "UpdatedAt", "updated_at") as string),
    } as StoredProject;
  });
}

function readScripts(db: Database): StoredScript[] {
  let rows;
  try { rows = db.exec("SELECT * FROM Scripts"); } catch {
    try { rows = db.exec("SELECT * FROM scripts"); } catch { return []; }
  }
  const hasRows = rows.length > 0 && rows[0].values.length > 0;
  if (!hasRows) return [];

  const cols = rows[0].columns;
  return rows[0].values.map((row: SqlValue[]) => {
    const obj = Object.fromEntries(cols.map((c: SqlValue, i: number) => [c, row[i]]));
    return {
      id: resolveUid(obj),
      name: (col(obj, "Name", "name") as string),
      description: (col(obj, "Description", "description") as string) ?? undefined,
      code: (col(obj, "Code", "code") as string),
      order: (col(obj, "RunOrder", "run_order") as number) ?? 0,
      runAt: (col(obj, "RunAt", "run_at") as string) ?? undefined,
      configBinding: (col(obj, "ConfigBinding", "config_binding") as string) ?? undefined,
      isIife: col(obj, "IsIife", "is_iife") === 1,
      hasDomUsage: col(obj, "HasDomUsage", "has_dom_usage") === 1,
      createdAt: (col(obj, "CreatedAt", "created_at") as string),
      updatedAt: (col(obj, "UpdatedAt", "updated_at") as string),
    } as StoredScript;
  });
}

function readConfigs(db: Database): StoredConfig[] {
  let rows;
  try { rows = db.exec("SELECT * FROM Configs"); } catch {
    try { rows = db.exec("SELECT * FROM configs"); } catch { return []; }
  }
  const hasRows = rows.length > 0 && rows[0].values.length > 0;
  if (!hasRows) return [];

  const cols = rows[0].columns;
  return rows[0].values.map((row: SqlValue[]) => {
    const obj = Object.fromEntries(cols.map((c: SqlValue, i: number) => [c, row[i]]));
    return {
      id: resolveUid(obj),
      name: (col(obj, "Name", "name") as string),
      description: (col(obj, "Description", "description") as string) ?? undefined,
      json: (col(obj, "Json", "json") as string),
      createdAt: (col(obj, "CreatedAt", "created_at") as string),
      updatedAt: (col(obj, "UpdatedAt", "updated_at") as string),
    } as StoredConfig;
  });
}

function readPrompts(db: Database): PromptEntry[] {
  try {
    let rows;
    try { rows = db.exec("SELECT * FROM Prompts"); } catch {
      try { rows = db.exec("SELECT * FROM prompts"); } catch { return []; }
    }
    const hasRows = rows.length > 0 && rows[0].values.length > 0;
    if (!hasRows) return [];

    const cols = rows[0].columns;
    return rows[0].values.map((row: SqlValue[]) => {
      const obj = Object.fromEntries(cols.map((c: SqlValue, i: number) => [c, row[i]]));
      return {
        id: resolveUid(obj),
        name: (col(obj, "Name", "name") as string),
        text: (col(obj, "Text", "text") as string),
        order: (col(obj, "RunOrder", "run_order") as number) ?? 0,
        isDefault: col(obj, "IsDefault", "is_default") === 1,
        isFavorite: col(obj, "IsFavorite", "is_favorite") === 1,
        category: (col(obj, "Category", "category") as string) ?? undefined,
        createdAt: (col(obj, "CreatedAt", "created_at") as string),
        updatedAt: (col(obj, "UpdatedAt", "updated_at") as string),
      } as PromptEntry;
    });
  } catch {
    // prompts table may not exist in older bundles
    return [];
  }
}

/** Reads a .zip and returns a preview of its contents (with diff against existing data) without importing. */
// eslint-disable-next-line max-lines-per-function
export async function previewSqliteZip(file: File): Promise<BundlePreview> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const dbFile = zip.file(DB_FILENAME);
  if (!dbFile) {
    throw new Error(`Invalid bundle: missing ${DB_FILENAME} inside the zip`);
  }

  const dbData = await dbFile.async("uint8array");
  const db = await openDb(dbData);

  const projects = readProjects(db);
  const scripts = readScripts(db);
  const configs = readConfigs(db);

  // Read exported_at from Meta
  let exportedAt: string | undefined;
  try {
    let metaRows: { columns: string[]; values: SqlValue[][] }[];
    try { metaRows = db.exec("SELECT Value FROM Meta WHERE Key = 'exported_at'"); } catch {
      try { metaRows = db.exec("SELECT value FROM meta WHERE key = 'exported_at'"); } catch { metaRows = []; }
    }
    if (Array.isArray(metaRows) && metaRows.length > 0 && metaRows[0].values.length > 0) {
      exportedAt = metaRows[0].values[0][0] as string;
    }
  } catch { /* meta table may not exist */ }

  db.close();

  // Fetch existing data for diff
  const [existingProjects, existingScripts, existingConfigs] = await Promise.all([
    sendMessage<{ projects: StoredProject[] }>({ type: "GET_ALL_PROJECTS" }),
    sendMessage<{ scripts: StoredScript[] }>({ type: "GET_ALL_SCRIPTS" }),
    sendMessage<{ configs: StoredConfig[] }>({ type: "GET_ALL_CONFIGS" }),
  ]);

  const existingProjectIds = new Set(existingProjects.projects.map((p) => p.id));
  const existingScriptIds = new Set(existingScripts.scripts.map((s) => s.id));
  const existingConfigIds = new Set(existingConfigs.configs.map((c) => c.id));

  const projectItems: DiffItem[] = projects.map((p) => ({
    name: p.name,
    status: existingProjectIds.has(p.id) ? "overwrite" : "new",
  }));
  const scriptItems: DiffItem[] = scripts.map((s) => ({
    name: s.name,
    status: existingScriptIds.has(s.id) ? "overwrite" : "new",
  }));
  const configItems: DiffItem[] = configs.map((c) => ({
    name: c.name,
    status: existingConfigIds.has(c.id) ? "overwrite" : "new",
  }));

  return {
    projectCount: projects.length,
    scriptCount: scripts.length,
    configCount: configs.length,
    projectNames: projects.map((p) => p.name),
    scriptNames: scripts.map((s) => s.name),
    configNames: configs.map((c) => c.name),
    projectItems,
    scriptItems,
    configItems,
    exportedAt,
  };
}

export interface DiffItem {
  name: string;
  status: "new" | "overwrite";
}

export interface BundlePreview {
  projectCount: number;
  scriptCount: number;
  configCount: number;
  projectNames: string[];
  scriptNames: string[];
  configNames: string[];
  projectItems: DiffItem[];
  scriptItems: DiffItem[];
  configItems: DiffItem[];
  exportedAt?: string;
}

/** Reads a .zip file, extracts the SQLite DB, and replaces all data. */
export async function importFromSqliteZip(file: File): Promise<ImportResult> {
  const { projects, scripts, configs } = await extractBundle(file);
  await replaceAll(projects, scripts, configs);
  return { projectCount: projects.length, scriptCount: scripts.length, configCount: configs.length };
}

/** Reads a .zip file and merges contents into existing data (no deletions). */
export async function mergeFromSqliteZip(file: File): Promise<ImportResult> {
  const { projects, scripts, configs } = await extractBundle(file);
  await mergeAll(projects, scripts, configs);
  return { projectCount: projects.length, scriptCount: scripts.length, configCount: configs.length };
}

async function extractBundle(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const dbFile = zip.file(DB_FILENAME);
  if (!dbFile) throw new Error(`Invalid bundle: missing ${DB_FILENAME} inside the zip`);
  const dbData = await dbFile.async("uint8array");
  const db = await openDb(dbData);
  const projects = readProjects(db);
  const scripts = readScripts(db);
  const configs = readConfigs(db);
  db.close();
  return { projects, scripts, configs };
}

export interface ImportResult {
  projectCount: number;
  scriptCount: number;
  configCount: number;
}

/* ------------------------------------------------------------------ */
/*  Replace All                                                        */
/* ------------------------------------------------------------------ */

async function replaceAll(
  projects: StoredProject[],
  scripts: StoredScript[],
  configs: StoredConfig[],
): Promise<void> {
  // Delete existing data
  const [existingProjects, existingScripts, existingConfigs] = await Promise.all([
    sendMessage<{ projects: StoredProject[] }>({ type: "GET_ALL_PROJECTS" }),
    sendMessage<{ scripts: StoredScript[] }>({ type: "GET_ALL_SCRIPTS" }),
    sendMessage<{ configs: StoredConfig[] }>({ type: "GET_ALL_CONFIGS" }),
  ]);

  await Promise.all([
    ...existingProjects.projects.map((p) =>
      sendMessage({ type: "DELETE_PROJECT", projectId: p.id }),
    ),
    ...existingScripts.scripts.map((s) =>
      sendMessage({ type: "DELETE_SCRIPT", id: s.id }),
    ),
    ...existingConfigs.configs.map((c) =>
      sendMessage({ type: "DELETE_CONFIG", id: c.id }),
    ),
  ]);

  // Insert imported data
  await Promise.all([
    ...projects.map((p) => sendMessage({ type: "SAVE_PROJECT", project: p })),
    ...scripts.map((s) => sendMessage({ type: "SAVE_SCRIPT", script: s })),
    ...configs.map((c) => sendMessage({ type: "SAVE_CONFIG", config: c })),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Merge All                                                          */
/* ------------------------------------------------------------------ */

async function mergeAll(
  projects: StoredProject[],
  scripts: StoredScript[],
  configs: StoredConfig[],
): Promise<void> {
  // Upsert: simply save each item — existing IDs get overwritten, new ones get added
  await Promise.all([
    ...projects.map((p) => sendMessage({ type: "SAVE_PROJECT", project: p })),
    ...scripts.map((s) => sendMessage({ type: "SAVE_SCRIPT", script: s })),
    ...configs.map((c) => sendMessage({ type: "SAVE_CONFIG", config: c })),
  ]);
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  const isAbsent = !raw;
  if (isAbsent) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ */
/*  Prompt-only Export / Import                                        */
/* ------------------------------------------------------------------ */

/** Exports all prompts as a SQLite ZIP. */
export async function exportPromptsAsSqliteZip(): Promise<void> {
  const result = await sendMessage<{ prompts?: PromptEntry[] }>({ type: "GET_PROMPTS" });
  const prompts: PromptEntry[] = Array.isArray(result.prompts)
    ? result.prompts.map((raw, i) => {
        const r = raw as unknown as Record<string, unknown>;
        return {
          id: String(r.id ?? ""),
          name: (r.name as string) ?? "",
          text: (r.text as string) ?? "",
          order: typeof r.order === "number" ? r.order : i,
          isDefault: r.isDefault === true,
          isFavorite: r.isFavorite === true,
          category: typeof r.category === "string" ? r.category : undefined,
          createdAt: (r.createdAt as string) ?? new Date().toISOString(),
          updatedAt: (r.updatedAt as string) ?? new Date().toISOString(),
        };
      })
    : [];

  const db = await initDb();
  db.run(CREATE_PROMPTS_TABLE);
  db.run(CREATE_META_TABLE);
  insertPrompts(db, prompts);
  insertMeta(db);

  const dbData = db.export();
  db.close();

  const zip = new JSZip();
  zip.file(DB_FILENAME, dbData);
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  triggerDownload(blob, "marco-prompts-backup.zip");
}

/** Imports prompts from a SQLite ZIP (replace mode). */
export async function importPromptsFromSqliteZip(file: File): Promise<{ promptCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const dbFile = zip.file(DB_FILENAME);
  if (!dbFile) throw new Error(`Invalid bundle: missing ${DB_FILENAME} inside the zip`);
  const dbData = await dbFile.async("uint8array");
  const db = await openDb(dbData);
  const prompts = readPrompts(db);
  db.close();

  if (prompts.length === 0) throw new Error("No prompts found in bundle");

  // Delete existing non-default prompts, then save imported ones
  const existing = await sendMessage<{ prompts?: PromptEntry[] }>({ type: "GET_PROMPTS" });
  const existingList = Array.isArray(existing.prompts) ? existing.prompts : [];
  for (const raw of existingList) {
    const r = raw as unknown as Record<string, unknown>;
    if (r.isDefault !== true && typeof r.id === "string") {
      await sendMessage({ type: "DELETE_PROMPT", promptId: r.id });
    }
  }

  for (const p of prompts) {
    await sendMessage({ type: "SAVE_PROMPT", prompt: p });
  }

  return { promptCount: prompts.length };
}

/** Merges prompts from a SQLite ZIP (no deletions). */
export async function mergePromptsFromSqliteZip(file: File): Promise<{ promptCount: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const dbFile = zip.file(DB_FILENAME);
  if (!dbFile) throw new Error(`Invalid bundle: missing ${DB_FILENAME} inside the zip`);
  const dbData = await dbFile.async("uint8array");
  const db = await openDb(dbData);
  const prompts = readPrompts(db);
  db.close();

  if (prompts.length === 0) throw new Error("No prompts found in bundle");

  for (const p of prompts) {
    await sendMessage({ type: "SAVE_PROMPT", prompt: p });
  }

  return { promptCount: prompts.length };
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
