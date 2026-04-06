/**
 * Marco Extension — Project Storage Helpers
 *
 * Shared read/write operations for project-handler and project-export-handler.
 */

import type { StoredProject } from "../../shared/project-types";
import {
    STORAGE_KEY_ALL_PROJECTS,
    STORAGE_KEY_ACTIVE_PROJECT,
} from "../../shared/constants";

/** Reads all projects from chrome.storage.local. */
export async function readAllProjects(): Promise<StoredProject[]> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ALL_PROJECTS);
    const projects = result[STORAGE_KEY_ALL_PROJECTS];
    const hasProjects = Array.isArray(projects);

    return hasProjects ? projects : [];
}

/** Persists the full project list to chrome.storage.local. */
export async function writeAllProjects(
    projects: StoredProject[],
): Promise<void> {
    await chrome.storage.local.set({
        [STORAGE_KEY_ALL_PROJECTS]: projects,
    });
}

/** Reads the active project ID from storage. */
export async function readActiveProjectId(): Promise<string | null> {
    const result = await chrome.storage.local.get(STORAGE_KEY_ACTIVE_PROJECT);
    const activeId = result[STORAGE_KEY_ACTIVE_PROJECT];
    const hasActiveId = typeof activeId === "string";

    return hasActiveId ? activeId : null;
}

/** Generates a UUID v4 string. */
export function generateId(): string {
    return crypto.randomUUID();
}

/** Returns an ISO timestamp string. */
export function nowTimestamp(): string {
    return new Date().toISOString();
}
