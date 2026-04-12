/**
 * Marco Extension — Cross-Project Sync Library Handler
 *
 * CRUD operations for SharedAsset, AssetLink, ProjectGroup,
 * and ProjectGroupMember tables in logs.db.
 *
 * @see spec/13-features/cross-project-sync.md — Full feature spec
 */

import type { Database as SqlJsDatabase } from "sql.js";
import type { DbManager } from "../db-manager";
import { computeContentHash } from "./library-content-hasher";
import { bumpMinor } from "./library-version-manager";
import { collectTypedRows, type JsonValue } from "./handler-types";

/* ------------------------------------------------------------------ */
/*  Message Interfaces                                                 */
/* ------------------------------------------------------------------ */

interface AssetTypeMsg { assetType?: AssetType }
interface AssetIdMsg { assetId: number }
interface SaveAssetMsg { asset: Partial<SharedAsset> & { Name: string; Type: AssetType; ContentJson: string; Slug: string } }
interface LinkFilterMsg { projectId?: number; sharedAssetId?: number }
interface SaveLinkMsg { link: Partial<AssetLink> & { SharedAssetId: number; ProjectId: number } }
interface LinkIdMsg { linkId: number }
interface PromoteMsg { slug: string; name: string; type: AssetType; contentJson: string }
interface ReplaceMsg { assetId: number; contentJson: string; name?: string }
interface ForkMsg { originalSlug: string; name: string; type: AssetType; contentJson: string }
interface GroupMsg { group: Partial<ProjectGroup> & { Name: string } }
interface GroupIdMsg { groupId: number }
interface GroupMemberMsg { groupId: number; projectId: number }
interface VersionIdMsg { assetId: number; versionId: number }
interface ImportMsg { bundle: LibraryExport }

/* ------------------------------------------------------------------ */
/*  DB Binding                                                         */
/* ------------------------------------------------------------------ */

let dbManager: DbManager | null = null;

export function bindLibraryDbManager(manager: DbManager): void {
    dbManager = manager;
}

function getDb(): SqlJsDatabase {
    if (!dbManager) throw new Error("[library] DbManager not bound\n  Path: src/background/handlers/library-handler.ts\n  Missing: DbManager binding\n  Reason: bindLibraryDbManager() was never called");
    return dbManager.getLogsDb();
}

function markDirty(): void {
    dbManager?.markDirty();
}

const SQL_LAST_INSERT_ROWID = "SELECT last_insert_rowid()";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type AssetType = "prompt" | "script" | "chain" | "preset";
export type LinkState = "synced" | "pinned" | "detached";

export interface SharedAsset {
    Id: number;
    Type: AssetType;
    Name: string;
    Slug: string;
    ContentJson: string;
    ContentHash: string;
    Version: string;
    CreatedAt: string;
    UpdatedAt: string;
}

export interface AssetVersion {
    Id: number;
    SharedAssetId: number;
    Version: string;
    ContentJson: string;
    ContentHash: string;
    ChangedBy: string;
    CreatedAt: string;
}

export interface AssetLink {
    Id: number;
    SharedAssetId: number;
    ProjectId: number;
    LinkState: LinkState;
    PinnedVersion: string | null;
    LocalOverrideJson: string | null;
    SyncedAt: string;
}

export interface ProjectGroup {
    Id: number;
    Name: string;
    SharedSettingsJson: string | null;
    CreatedAt: string;
}

export interface ProjectGroupMember {
    Id: number;
    GroupId: number;
    ProjectId: number;
}

/* ------------------------------------------------------------------ */
/*  SharedAsset CRUD                                                   */
/* ------------------------------------------------------------------ */

export async function handleGetSharedAssets(msg: AssetTypeMsg): Promise<{ assets: SharedAsset[] }> {
    const { assetType } = msg;
    const db = getDb();
    const sql = assetType
        ? "SELECT * FROM SharedAsset WHERE Type = ? ORDER BY Name ASC"
        : "SELECT * FROM SharedAsset ORDER BY Name ASC";
    const params = assetType ? [assetType] : [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const assets = collectTypedRows(stmt) as SharedAsset[];
    return { assets };
}

export async function handleGetSharedAsset(msg: AssetIdMsg): Promise<{ asset: SharedAsset | null }> {
    const { assetId } = msg;
    const db = getDb();
    const result = db.exec("SELECT * FROM SharedAsset WHERE Id = ?", [assetId]);
    if (result.length === 0 || result[0].values.length === 0) return { asset: null };
    const cols = result[0].columns;
    const vals = result[0].values[0];
    const asset = Object.fromEntries(cols.map((c, i) => [c, vals[i]])) as SharedAsset;
    return { asset };
}

/**
 * Record a version snapshot in AssetVersion table.
 */
function snapshotVersion(db: ReturnType<typeof getDb>, assetId: number, version: string, contentJson: string, contentHash: string, changedBy = "user"): void {
    db.run(
        `INSERT INTO AssetVersion (SharedAssetId, Version, ContentJson, ContentHash, ChangedBy) VALUES (?, ?, ?, ?, ?)`,
        [assetId, version, contentJson, contentHash, changedBy],
    );
}

export async function handleSaveSharedAsset(msg: unknown): Promise<{ assetId: number }> {
    const { asset } = msg as { asset: Partial<SharedAsset> & { Name: string; Type: AssetType; ContentJson: string; Slug: string } };
    const db = getDb();
    const contentHash = await computeContentHash(asset.ContentJson);
    const version = asset.Version ?? "1.0.0";

    if (asset.Id) {
        // Update existing — snapshot before overwriting
        snapshotVersion(db, asset.Id, version, asset.ContentJson, contentHash);
        db.run(
            `UPDATE SharedAsset SET Name = ?, Type = ?, ContentJson = ?, ContentHash = ?, Version = ?, Slug = ?, UpdatedAt = datetime('now') WHERE Id = ?`,
            [asset.Name, asset.Type, asset.ContentJson, contentHash, version, asset.Slug, asset.Id],
        );
        markDirty();
        return { assetId: asset.Id };
    }

    // Insert new
    db.run(
        `INSERT INTO SharedAsset (Type, Name, Slug, ContentJson, ContentHash, Version) VALUES (?, ?, ?, ?, ?, ?)`,
        [asset.Type, asset.Name, asset.Slug, asset.ContentJson, contentHash, version],
    );
    const idResult = db.exec(SQL_LAST_INSERT_ROWID);
    const newId = idResult[0].values[0][0] as number;
    // Snapshot initial version
    snapshotVersion(db, newId, version, asset.ContentJson, contentHash, "create");
    markDirty();
    return { assetId: newId };
}

export async function handleDeleteSharedAsset(msg: unknown): Promise<{ isOk: true; detachedCount: number }> {
    const { assetId } = msg as { assetId: number };
    const db = getDb();

    // Per spec §6.3: synced links become detached (preserving local copies)
    const syncedLinks = db.exec(
        "SELECT Id FROM AssetLink WHERE SharedAssetId = ? AND LinkState = 'synced'",
        [assetId],
    );
    const detachedCount = syncedLinks.length > 0 ? syncedLinks[0].values.length : 0;

    db.run(
        "UPDATE AssetLink SET LinkState = 'detached', SyncedAt = datetime('now') WHERE SharedAssetId = ? AND LinkState = 'synced'",
        [assetId],
    );

    // CASCADE will delete remaining links (pinned become orphans too — detach first)
    db.run(
        "UPDATE AssetLink SET LinkState = 'detached', SyncedAt = datetime('now') WHERE SharedAssetId = ? AND LinkState = 'pinned'",
        [assetId],
    );

    db.run("DELETE FROM SharedAsset WHERE Id = ?", [assetId]);
    markDirty();
    return { isOk: true, detachedCount };
}

/* ------------------------------------------------------------------ */
/*  AssetLink CRUD                                                     */
/* ------------------------------------------------------------------ */

export async function handleGetAssetLinks(msg: unknown): Promise<{ links: AssetLink[] }> {
    const { projectId, sharedAssetId } = msg as { projectId?: number; sharedAssetId?: number };
    const db = getDb();
    let sql = "SELECT * FROM AssetLink";
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (projectId !== undefined) {
        conditions.push("ProjectId = ?");
        params.push(projectId);
    }
    if (sharedAssetId !== undefined) {
        conditions.push("SharedAssetId = ?");
        params.push(sharedAssetId);
    }
    if (conditions.length > 0) {
        sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY Id ASC";

    const stmt = db.prepare(sql);
    stmt.bind(params);
    const links: AssetLink[] = [];
    while (stmt.step()) {
        links.push(stmt.getAsObject() as unknown as AssetLink);
    }
    stmt.free();
    return { links };
}

export async function handleSaveAssetLink(msg: unknown): Promise<{ linkId: number }> {
    const { link } = msg as { link: Partial<AssetLink> & { SharedAssetId: number; ProjectId: number } };
    const db = getDb();
    const linkState = link.LinkState ?? "synced";

    if (link.Id) {
        db.run(
            `UPDATE AssetLink SET LinkState = ?, PinnedVersion = ?, LocalOverrideJson = ?, SyncedAt = datetime('now') WHERE Id = ?`,
            [linkState, link.PinnedVersion ?? null, link.LocalOverrideJson ?? null, link.Id],
        );
        markDirty();
        return { linkId: link.Id };
    }

    db.run(
        `INSERT OR REPLACE INTO AssetLink (SharedAssetId, ProjectId, LinkState, PinnedVersion, LocalOverrideJson) VALUES (?, ?, ?, ?, ?)`,
        [link.SharedAssetId, link.ProjectId, linkState, link.PinnedVersion ?? null, link.LocalOverrideJson ?? null],
    );
    const idResult = db.exec(SQL_LAST_INSERT_ROWID);
    const newId = idResult[0].values[0][0] as number;
    markDirty();
    return { linkId: newId };
}

export async function handleDeleteAssetLink(msg: unknown): Promise<{ isOk: true }> {
    const { linkId } = msg as { linkId: number };
    const db = getDb();
    db.run("DELETE FROM AssetLink WHERE Id = ?", [linkId]);
    markDirty();
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Sync Engine                                                        */
/* ------------------------------------------------------------------ */

export async function handleSyncLibraryAsset(msg: unknown): Promise<{ syncedCount: number; pinnedNotified: number }> {
    const { assetId } = msg as { assetId: number };
    const db = getDb();

    // Get the latest asset
    const assetResult = db.exec("SELECT ContentJson, ContentHash, Version FROM SharedAsset WHERE Id = ?", [assetId]);
    if (assetResult.length === 0 || assetResult[0].values.length === 0) {
        return { syncedCount: 0, pinnedNotified: 0 };
    }
    const [contentJson, contentHash, version] = assetResult[0].values[0] as [string, string, string];

    // Update all synced links — overwrite project copies
    const syncedLinks = db.exec(
        "SELECT Id FROM AssetLink WHERE SharedAssetId = ? AND LinkState = 'synced'",
        [assetId],
    );
    const syncedCount = syncedLinks.length > 0 ? syncedLinks[0].values.length : 0;

    if (syncedCount > 0) {
        db.run(
            `UPDATE AssetLink SET LocalOverrideJson = NULL, PinnedVersion = NULL, SyncedAt = datetime('now') WHERE SharedAssetId = ? AND LinkState = 'synced'`,
            [assetId],
        );
    }

    // Count pinned links (they get "update available" badge — UI responsibility)
    const pinnedLinks = db.exec(
        "SELECT Id FROM AssetLink WHERE SharedAssetId = ? AND LinkState = 'pinned'",
        [assetId],
    );
    const pinnedNotified = pinnedLinks.length > 0 ? pinnedLinks[0].values.length : 0;

    markDirty();
    return { syncedCount, pinnedNotified };
}

/**
 * Promote a local project asset to the shared library.
 * Per spec §6.2: compares content hash, returns action needed.
 */
export async function handlePromoteAsset(msg: unknown): Promise<{
    action: "created" | "identical" | "conflict";
    assetId?: number;
    existingVersion?: string;
}> {
    const { slug, name, type, contentJson } = msg as {
        slug: string;
        name: string;
        type: AssetType;
        contentJson: string;
    };
    const db = getDb();
    const hash = await computeContentHash(contentJson);

    // Check if slug already exists
    const existing = db.exec("SELECT Id, ContentHash, Version FROM SharedAsset WHERE Slug = ?", [slug]);

    if (existing.length === 0 || existing[0].values.length === 0) {
        // New asset — create
        db.run(
            `INSERT INTO SharedAsset (Type, Name, Slug, ContentJson, ContentHash, Version) VALUES (?, ?, ?, ?, ?, '1.0.0')`,
            [type, name, slug, contentJson, hash],
        );
        const idResult = db.exec(SQL_LAST_INSERT_ROWID);
        const newId = idResult[0].values[0][0] as number;
        snapshotVersion(db, newId, "1.0.0", contentJson, hash, "promote");
        markDirty();
        return { action: "created", assetId: newId };
    }

    const [existingId, existingHash, existingVersion] = existing[0].values[0] as [number, string, string];

    if (existingHash === hash) {
        return { action: "identical", assetId: existingId };
    }

    // Content differs — caller must choose Replace/Fork/Cancel
    return { action: "conflict", assetId: existingId, existingVersion };
}

/**
 * Replace an existing library asset with new content (user chose "Replace").
 */
export async function handleReplaceLibraryAsset(msg: unknown): Promise<{ isOk: true; newVersion: string }> {
    const { assetId, contentJson, name } = msg as { assetId: number; contentJson: string; name?: string };
    const db = getDb();
    const hash = await computeContentHash(contentJson);

    const versionResult = db.exec("SELECT Version FROM SharedAsset WHERE Id = ?", [assetId]);
    const currentVersion = (versionResult[0]?.values[0]?.[0] as string) ?? "1.0.0";
    const newVersion = bumpMinor(currentVersion);

    const nameSql = name ? ", Name = ?" : "";
    const params = name
        ? [contentJson, hash, newVersion, name, assetId]
        : [contentJson, hash, newVersion, assetId];

    // Snapshot the new version
    snapshotVersion(db, assetId, newVersion, contentJson, hash, "replace");

    db.run(
        `UPDATE SharedAsset SET ContentJson = ?, ContentHash = ?, Version = ?${nameSql}, UpdatedAt = datetime('now') WHERE Id = ?`,
        params,
    );
    markDirty();
    return { isOk: true, newVersion };
}

/**
 * Fork an existing asset as a new library entry (user chose "Fork").
 */
export async function handleForkLibraryAsset(msg: unknown): Promise<{ assetId: number; slug: string }> {
    const { originalSlug, name, type, contentJson } = msg as {
        originalSlug: string;
        name: string;
        type: AssetType;
        contentJson: string;
    };
    const db = getDb();
    const hash = await computeContentHash(contentJson);

    // Generate fork slug
    let forkSlug = `${originalSlug}-fork`;
    let counter = 2;
    while (true) {
        const check = db.exec("SELECT Id FROM SharedAsset WHERE Slug = ?", [forkSlug]);
        if (check.length === 0 || check[0].values.length === 0) break;
        forkSlug = `${originalSlug}-fork-${counter}`;
        counter++;
    }

    db.run(
        `INSERT INTO SharedAsset (Type, Name, Slug, ContentJson, ContentHash, Version) VALUES (?, ?, ?, ?, ?, '1.0.0')`,
        [type, name, forkSlug, contentJson, hash],
    );
    const idResult = db.exec(SQL_LAST_INSERT_ROWID);
    const newId = idResult[0].values[0][0] as number;
    markDirty();
    return { assetId: newId, slug: forkSlug };
}

/* ------------------------------------------------------------------ */
/*  ProjectGroup CRUD                                                  */
/* ------------------------------------------------------------------ */

export async function handleGetProjectGroups(): Promise<{ groups: ProjectGroup[] }> {
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM ProjectGroup ORDER BY Name ASC");
    const groups: ProjectGroup[] = [];
    while (stmt.step()) {
        groups.push(stmt.getAsObject() as unknown as ProjectGroup);
    }
    stmt.free();
    return { groups };
}

export async function handleSaveProjectGroup(msg: unknown): Promise<{ groupId: number; cascadedCount: number }> {
    const { group } = msg as { group: Partial<ProjectGroup> & { Name: string } };
    const db = getDb();

    if (group.Id) {
        db.run(
            `UPDATE ProjectGroup SET Name = ?, SharedSettingsJson = ? WHERE Id = ?`,
            [group.Name, group.SharedSettingsJson ?? null, group.Id],
        );
        markDirty();
        // Auto-cascade settings to members on update
        const cascadedCount = group.SharedSettingsJson
            ? cascadeSettingsToMembers(db, group.Id, group.SharedSettingsJson)
            : 0;
        return { groupId: group.Id, cascadedCount };
    }

    db.run(
        `INSERT INTO ProjectGroup (Name, SharedSettingsJson) VALUES (?, ?)`,
        [group.Name, group.SharedSettingsJson ?? null],
    );
    const idResult = db.exec(SQL_LAST_INSERT_ROWID);
    const newId = idResult[0].values[0][0] as number;
    markDirty();
    return { groupId: newId, cascadedCount: 0 };
}

export async function handleDeleteProjectGroup(msg: unknown): Promise<{ isOk: true }> {
    const { groupId } = msg as { groupId: number };
    const db = getDb();
    db.run("DELETE FROM ProjectGroup WHERE Id = ?", [groupId]);
    markDirty();
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  ProjectGroupMember CRUD                                            */
/* ------------------------------------------------------------------ */

export async function handleGetGroupMembers(msg: unknown): Promise<{ members: ProjectGroupMember[] }> {
    const { groupId } = msg as { groupId: number };
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM ProjectGroupMember WHERE GroupId = ?");
    stmt.bind([groupId]);
    const members: ProjectGroupMember[] = [];
    while (stmt.step()) {
        members.push(stmt.getAsObject() as unknown as ProjectGroupMember);
    }
    stmt.free();
    return { members };
}

export async function handleAddGroupMember(msg: unknown): Promise<{ memberId: number }> {
    const { groupId, projectId } = msg as { groupId: number; projectId: number };
    const db = getDb();
    db.run(
        `INSERT OR IGNORE INTO ProjectGroupMember (GroupId, ProjectId) VALUES (?, ?)`,
        [groupId, projectId],
    );
    const idResult = db.exec(SQL_LAST_INSERT_ROWID);
    const newId = idResult[0].values[0][0] as number;
    markDirty();
    return { memberId: newId };
}

export async function handleRemoveGroupMember(msg: unknown): Promise<{ isOk: true }> {
    const { groupId, projectId } = msg as { groupId: number; projectId: number };
    const db = getDb();
    db.run("DELETE FROM ProjectGroupMember WHERE GroupId = ? AND ProjectId = ?", [groupId, projectId]);
    markDirty();
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  Settings Cascade                                                   */
/* ------------------------------------------------------------------ */

/**
 * Write each key from SharedSettingsJson into ProjectKv for all member projects.
 * Keys are prefixed with "group:" to distinguish from project-local settings.
 */
function cascadeSettingsToMembers(db: ReturnType<typeof getDb>, groupId: number, settingsJson: string): number {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(settingsJson);
    } catch {
        console.warn(`[library] Cannot parse SharedSettingsJson for group ${groupId} — skipping cascade`);
        return 0;
    }

    // Get all member project IDs
    const memberStmt = db.prepare("SELECT ProjectId FROM ProjectGroupMember WHERE GroupId = ?");
    memberStmt.bind([groupId]);
    const projectIds: number[] = [];
    while (memberStmt.step()) {
        projectIds.push(memberStmt.get()[0] as number);
    }
    memberStmt.free();

    if (projectIds.length === 0) return 0;

    const entries = Object.entries(parsed);
    for (const projectId of projectIds) {
        for (const [key, value] of entries) {
            const kvKey = `group:${key}`;
            const kvValue = typeof value === "string" ? value : JSON.stringify(value);
            db.run(
                `INSERT OR REPLACE INTO ProjectKv (ProjectId, Key, Value, UpdatedAt) VALUES (?, ?, ?, datetime('now'))`,
                [String(projectId), kvKey, kvValue],
            );
        }
    }

    markDirty();
    return projectIds.length;
}

/**
 * Manual cascade trigger — push current group settings to all members.
 */
export async function handleCascadeGroupSettings(msg: unknown): Promise<{ cascadedCount: number }> {
    const { groupId } = msg as { groupId: number };
    const db = getDb();

    const result = db.exec("SELECT SharedSettingsJson FROM ProjectGroup WHERE Id = ?", [groupId]);
    if (result.length === 0 || result[0].values.length === 0) {
        throw new Error(`[library] Group ${groupId} not found\n  Path: src/background/handlers/library-handler.ts\n  Missing: ProjectGroup row\n  Reason: groupId does not exist in ProjectGroup table`);
    }

    const settingsJson = result[0].values[0][0] as string | null;
    if (!settingsJson) {
        return { cascadedCount: 0 };
    }

    const cascadedCount = cascadeSettingsToMembers(db, groupId, settingsJson);
    return { cascadedCount };
}

/* ------------------------------------------------------------------ */
/*  Version History                                                    */
/* ------------------------------------------------------------------ */

export async function handleGetAssetVersions(msg: unknown): Promise<{ versions: AssetVersion[] }> {
    const { assetId } = msg as { assetId: number };
    const db = getDb();
    const stmt = db.prepare("SELECT * FROM AssetVersion WHERE SharedAssetId = ? ORDER BY CreatedAt DESC");
    stmt.bind([assetId]);
    const versions: AssetVersion[] = [];
    while (stmt.step()) {
        versions.push(stmt.getAsObject() as unknown as AssetVersion);
    }
    stmt.free();
    return { versions };
}

export async function handleRollbackAssetVersion(msg: unknown): Promise<{ isOk: true; rolledBackTo: string }> {
    const { assetId, versionId } = msg as { assetId: number; versionId: number };
    const db = getDb();

    // Get the target version's content
    const versionResult = db.exec(
        "SELECT Version, ContentJson, ContentHash FROM AssetVersion WHERE Id = ? AND SharedAssetId = ?",
        [versionId, assetId],
    );
    if (versionResult.length === 0 || versionResult[0].values.length === 0) {
        throw new Error(`[library] Version ${versionId} not found for asset ${assetId}\n  Path: src/background/handlers/library-handler.ts\n  Missing: AssetVersion row\n  Reason: versionId does not exist or belongs to different asset`);
    }

    const [targetVersion, contentJson, contentHash] = versionResult[0].values[0] as [string, string, string];

    // Get current version for snapshot
    const currentResult = db.exec("SELECT Version, ContentJson, ContentHash FROM SharedAsset WHERE Id = ?", [assetId]);
    if (currentResult.length > 0 && currentResult[0].values.length > 0) {
        const [curVer, curJson, curHash] = currentResult[0].values[0] as [string, string, string];
        // Snapshot current state before rollback
        snapshotVersion(db, assetId, curVer, curJson, curHash, "pre-rollback");
    }

    // Apply the rollback
    const newVersion = bumpMinor(targetVersion);
    snapshotVersion(db, assetId, newVersion, contentJson, contentHash, "rollback");

    db.run(
        `UPDATE SharedAsset SET ContentJson = ?, ContentHash = ?, Version = ?, UpdatedAt = datetime('now') WHERE Id = ?`,
        [contentJson, contentHash, newVersion, assetId],
    );
    markDirty();
    return { isOk: true, rolledBackTo: newVersion };
}

/* ------------------------------------------------------------------ */
/*  Import/Export                                                       */
/* ------------------------------------------------------------------ */

export interface LibraryExport {
    exportVersion: string;
    exportedAt: string;
    assets: Array<{
        type: AssetType;
        slug: string;
        name: string;
        version: string;
        content: unknown;
    }>;
    groups: Array<{
        name: string;
        sharedSettings: unknown;
        memberProjectIds: number[];
    }>;
}

function exportAssets(db: SqlJsDatabase): LibraryExport["assets"] {
    const stmt = db.prepare("SELECT * FROM SharedAsset ORDER BY Name ASC");
    const assets: LibraryExport["assets"] = [];
    while (stmt.step()) {
        const row = stmt.getAsObject() as unknown as SharedAsset;
        let content: unknown;
        try { content = JSON.parse(row.ContentJson); } catch { content = row.ContentJson; }
        assets.push({ type: row.Type, slug: row.Slug, name: row.Name, version: row.Version, content });
    }
    stmt.free();
    return assets;
}

function exportGroups(db: SqlJsDatabase): LibraryExport["groups"] {
    const stmt = db.prepare("SELECT * FROM ProjectGroup ORDER BY Name ASC");
    const groups: LibraryExport["groups"] = [];
    while (stmt.step()) {
        const row = stmt.getAsObject() as unknown as ProjectGroup;
        const memberResult = db.exec("SELECT ProjectId FROM ProjectGroupMember WHERE GroupId = ?", [row.Id]);
        const memberProjectIds = memberResult.length > 0 ? memberResult[0].values.map((v) => v[0] as number) : [];
        let sharedSettings: unknown = null;
        if (row.SharedSettingsJson) {
            try { sharedSettings = JSON.parse(row.SharedSettingsJson); } catch { sharedSettings = row.SharedSettingsJson; }
        }
        groups.push({ name: row.Name, sharedSettings, memberProjectIds });
    }
    stmt.free();
    return groups;
}

export async function handleExportLibrary(): Promise<{ bundle: LibraryExport }> {
    const db = getDb();
    return {
        bundle: {
            exportVersion: "1.0",
            exportedAt: new Date().toISOString(),
            assets: exportAssets(db),
            groups: exportGroups(db),
        },
    };
}

interface ImportResult {
    imported: number;
    skipped: number;
    conflicts: Array<{ slug: string; existingVersion: string }>;
}

async function importAsset(
    db: SqlJsDatabase,
    asset: LibraryExport["assets"][0],
    result: ImportResult,
): Promise<void> {
    const contentJson = typeof asset.content === "string" ? asset.content : JSON.stringify(asset.content);
    const hash = await computeContentHash(contentJson);
    const existing = db.exec("SELECT Id, ContentHash, Version FROM SharedAsset WHERE Slug = ?", [asset.slug]);

    if (existing.length === 0 || existing[0].values.length === 0) {
        db.run(
            `INSERT INTO SharedAsset (Type, Name, Slug, ContentJson, ContentHash, Version) VALUES (?, ?, ?, ?, ?, ?)`,
            [asset.type, asset.name, asset.slug, contentJson, hash, asset.version],
        );
        result.imported++;
    } else {
        const [, existingHash, existingVersion] = existing[0].values[0] as [number, string, string];
        if (existingHash === hash) {
            result.skipped++;
        } else {
            result.conflicts.push({ slug: asset.slug, existingVersion });
        }
    }
}

function importGroups(db: SqlJsDatabase, groups: LibraryExport["groups"]): void {
    for (const group of groups) {
        db.run(
            `INSERT INTO ProjectGroup (Name, SharedSettingsJson) VALUES (?, ?)`,
            [group.name, group.sharedSettings ? JSON.stringify(group.sharedSettings) : null],
        );
        const groupId = db.exec(SQL_LAST_INSERT_ROWID)[0].values[0][0] as number;
        for (const projectId of group.memberProjectIds) {
            db.run(`INSERT OR IGNORE INTO ProjectGroupMember (GroupId, ProjectId) VALUES (?, ?)`, [groupId, projectId]);
        }
    }
}

export async function handleImportLibrary(msg: unknown): Promise<ImportResult> {
    const { bundle } = msg as { bundle: LibraryExport };
    const db = getDb();
    const result: ImportResult = { imported: 0, skipped: 0, conflicts: [] };

    for (const asset of bundle.assets) {
        await importAsset(db, asset, result);
    }
    importGroups(db, bundle.groups);
    markDirty();

    return result;
}
