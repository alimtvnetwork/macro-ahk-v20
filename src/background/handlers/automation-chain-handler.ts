/**
 * Marco Extension — Automation Chain Handler (Spec 21)
 *
 * CRUD for AutomationChains stored in each project's SQLite DB.
 * Chains are project-scoped — each project has its own set of chains.
 *
 * @see .lovable/memory/architecture/project-scoped-database.md — Project-scoped DB
 */

import {
    initProjectDb,
    getProjectDb,
    flushProjectDb,
    hasProjectDb,
} from "../project-db-manager";

import { type MessageRequest } from "../../shared/messages";
import type { SqlRow } from "./handler-types";

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const CHAIN_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS AutomationChains (
    Id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ProjectId    TEXT NOT NULL DEFAULT 'default',
    Name         TEXT NOT NULL,
    Slug         TEXT NOT NULL,
    StepsJson    TEXT NOT NULL DEFAULT '[]',
    TriggerType  TEXT NOT NULL DEFAULT 'manual',
    TriggerConfigJson TEXT DEFAULT '{}',
    Enabled      INTEGER NOT NULL DEFAULT 1,
    CreatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(ProjectId, Slug)
);
`;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ChainMessage extends MessageRequest {
    project?: string;
    chain?: ChainInput;
    chainId?: string;
    chains?: ChainInput[];
}

interface ChainInput {
    id?: string;
    projectId?: string;
    name?: string;
    slug?: string;
    steps?: JsonValue[];
    triggerType?: string;
    triggerConfig?: JsonValue;
    enabled?: boolean;
}

type JsonValue = string | number | boolean | null | undefined | JsonValue[] | { [key: string]: JsonValue };

interface ChainOutput {
    id: string;
    projectId: string;
    name: string;
    slug: string;
    steps: JsonValue[];
    triggerType: string;
    triggerConfig: JsonValue;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

interface ChainRow {
    Id: number;
    ProjectId: string;
    Name: string;
    Slug: string;
    StepsJson: string;
    TriggerType: string;
    TriggerConfigJson: string;
    Enabled: number;
    CreatedAt: string;
    UpdatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function getProjectChainDb(projectSlug: string) {
    if (!hasProjectDb(projectSlug)) {
        await initProjectDb(projectSlug);
    }
    const db = getProjectDb(projectSlug);
    db.run(CHAIN_TABLE_DDL);
    return db;
}

function resolveProject(msg: ChainMessage): string {
    return msg.project || "__system__";
}

function rowToChain(r: SqlRow): ChainOutput {
    return {
        id: String(r.Id),
        projectId: (r.ProjectId as string) || "default",
        name: r.Name as string,
        slug: r.Slug as string,
        steps: (() => { try { return JSON.parse(r.StepsJson as string) as JsonValue[]; } catch { return []; } })(),
        triggerType: (r.TriggerType as string) || "manual",
        triggerConfig: (() => { try { return JSON.parse((r.TriggerConfigJson as string) || "{}") as JsonValue; } catch { return {}; } })(),
        enabled: !!(r.Enabled as number),
        createdAt: r.CreatedAt as string,
        updatedAt: r.UpdatedAt as string,
    };
}

/* ------------------------------------------------------------------ */
/*  GET_AUTOMATION_CHAINS                                              */
/* ------------------------------------------------------------------ */

export async function handleGetAutomationChains(msg?: MessageRequest): Promise<{ isOk: true; chains: ChainOutput[] }> {
    const project = resolveProject((msg ?? {}) as ChainMessage);
    const db = await getProjectChainDb(project);
    const stmt = db.prepare("SELECT * FROM AutomationChains ORDER BY Id");
    const chains: ChainOutput[] = [];
    while (stmt.step()) {
        chains.push(rowToChain(stmt.getAsObject() as SqlRow));
    }
    stmt.free();
    return { isOk: true, chains };
}

/* ------------------------------------------------------------------ */
/*  SAVE_AUTOMATION_CHAIN (create or update)                           */
/* ------------------------------------------------------------------ */

export async function handleSaveAutomationChain(msg: MessageRequest): Promise<{ isOk: boolean; errorMessage?: string }> {
    const raw = msg as ChainMessage;
    const project = resolveProject(raw);
    const chain = raw.chain;
    if (!chain || !chain.name || !chain.slug) {
        return { isOk: false, errorMessage: "Chain name and slug are required" };
    }

    const db = await getProjectChainDb(project);
    const stepsJson = JSON.stringify(chain.steps ?? []);
    const triggerConfigJson = JSON.stringify(chain.triggerConfig ?? {});
    const triggerType = chain.triggerType || "manual";
    const enabled = chain.enabled !== false ? 1 : 0;
    const projectId = chain.projectId || "default";

    if (chain.id) {
        // Update
        db.run(
            `UPDATE AutomationChains
             SET Name = ?, Slug = ?, StepsJson = ?, TriggerType = ?,
                 TriggerConfigJson = ?, Enabled = ?, ProjectId = ?,
                 UpdatedAt = datetime('now')
             WHERE Id = ?`,
            [chain.name, chain.slug, stepsJson, triggerType, triggerConfigJson, enabled, projectId, Number(chain.id)],
        );
    } else {
        // Insert
        db.run(
            `INSERT INTO AutomationChains (ProjectId, Name, Slug, StepsJson, TriggerType, TriggerConfigJson, Enabled)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [projectId, chain.name, chain.slug, stepsJson, triggerType, triggerConfigJson, enabled],
        );
    }

    await flushProjectDb(project);
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  DELETE_AUTOMATION_CHAIN                                            */
/* ------------------------------------------------------------------ */

export async function handleDeleteAutomationChain(msg: MessageRequest): Promise<{ isOk: boolean; errorMessage?: string }> {
    const raw = msg as ChainMessage;
    const project = resolveProject(raw);
    const chainId = raw.chainId;
    if (!chainId) {
        return { isOk: false, errorMessage: "Missing chainId" };
    }

    const db = await getProjectChainDb(project);
    db.run("DELETE FROM AutomationChains WHERE Id = ?", [Number(chainId)]);
    await flushProjectDb(project);
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  TOGGLE_AUTOMATION_CHAIN                                            */
/* ------------------------------------------------------------------ */

export async function handleToggleAutomationChain(msg: MessageRequest): Promise<{ isOk: boolean; errorMessage?: string }> {
    const raw = msg as ChainMessage;
    const project = resolveProject(raw);
    const chainId = raw.chainId;
    if (!chainId) {
        return { isOk: false, errorMessage: "Missing chainId" };
    }

    const db = await getProjectChainDb(project);
    db.run(
        "UPDATE AutomationChains SET Enabled = CASE WHEN Enabled = 1 THEN 0 ELSE 1 END, UpdatedAt = datetime('now') WHERE Id = ?",
        [Number(chainId)],
    );
    await flushProjectDb(project);
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  IMPORT_AUTOMATION_CHAINS (bulk insert)                             */
/* ------------------------------------------------------------------ */

export async function handleImportAutomationChains(msg: MessageRequest): Promise<{ isOk: boolean; imported?: number; errorMessage?: string }> {
    const raw = msg as ChainMessage;
    const project = resolveProject(raw);
    const chains = raw.chains;
    if (!Array.isArray(chains)) {
        return { isOk: false, errorMessage: "Expected chains array" };
    }

    const db = await getProjectChainDb(project);
    let imported = 0;

    for (const c of chains) {
        const name = c.name || "Imported";
        const slug = c.slug || `chain-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const stepsJson = JSON.stringify(c.steps ?? []);
        const triggerType = c.triggerType || "manual";
        const triggerConfigJson = JSON.stringify(c.triggerConfig ?? {});
        const enabled = c.enabled !== false ? 1 : 0;
        const projectId = c.projectId || "default";

        db.run(
            `INSERT INTO AutomationChains (ProjectId, Name, Slug, StepsJson, TriggerType, TriggerConfigJson, Enabled)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [projectId, name, slug, stepsJson, triggerType, triggerConfigJson, enabled],
        );
        imported++;
    }

    await flushProjectDb(project);
    return { isOk: true, imported };
}
