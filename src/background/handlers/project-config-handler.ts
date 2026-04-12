/**
 * Marco Extension — Project Config Handler
 *
 * Handles PROJECT_CONFIG_READ, PROJECT_CONFIG_UPDATE, and
 * PROJECT_CONFIG_RECONSTRUCT messages for reading/writing config
 * from/to the project-scoped SQLite database.
 *
 * @see spec/17-app-issues/85-sdk-notifier-config-seeding-database-overhaul.md — Config seeding overhaul
 * @see .lovable/memory/features/projects/configuration-seeding.md — Configuration seeding
 */

import type { MessageRequest } from "../../shared/messages";
import { initProjectDb } from "../project-db-manager";
import {
    readConfigFromDb,
    updateConfigValue,
    reconstructConfigFromDb,
    CONFIG_TABLES_SCHEMA,
} from "../config-seeder";

interface ConfigMsg extends MessageRequest {
    project: string;
    section?: string;
    key?: string;
    value?: string;
    valueType?: string;
}

export async function handleProjectConfigRead(msg: MessageRequest): Promise<{ isOk: boolean; rows?: ReturnType<typeof readConfigFromDb>; errorMessage?: string }> {
    const m = msg as ConfigMsg;
    if (!m.project) return { isOk: false, errorMessage: "Missing project slug" };

    const mgr = await initProjectDb(m.project, CONFIG_TABLES_SCHEMA);
    const rows = readConfigFromDb(mgr);
    return { isOk: true, rows };
}

export async function handleProjectConfigUpdate(msg: MessageRequest): Promise<{ isOk: boolean; errorMessage?: string }> {
    const m = msg as ConfigMsg;
    if (!m.project || !m.section || !m.key)
        return { isOk: false, errorMessage: "Missing project, section, or key" };

    const mgr = await initProjectDb(m.project, CONFIG_TABLES_SCHEMA);
    const ok = updateConfigValue(mgr, m.section, m.key, m.value ?? "", m.valueType);
    return { isOk: ok };
}

export async function handleProjectConfigReconstruct(msg: MessageRequest): Promise<{ isOk: boolean; config?: ReturnType<typeof reconstructConfigFromDb>; errorMessage?: string }> {
    const m = msg as ConfigMsg;
    if (!m.project) return { isOk: false, errorMessage: "Missing project slug" };

    const mgr = await initProjectDb(m.project, CONFIG_TABLES_SCHEMA);
    const config = reconstructConfigFromDb(mgr);
    return { isOk: true, config };
}
