/**
 * Marco Extension — Project Import/Export Handlers
 *
 * Handles IMPORT_PROJECT, EXPORT_PROJECT, DUPLICATE_PROJECT messages.
 * Extracted from project-handler.ts to stay under 200-line file limit.
 */

import type { MessageRequest, OkResponse } from "../../shared/messages";
import type { StoredProject } from "../../shared/project-types";
import { readAllProjects, writeAllProjects, generateId, nowTimestamp } from "./project-helpers";

/* ------------------------------------------------------------------ */
/*  DUPLICATE_PROJECT                                                  */
/* ------------------------------------------------------------------ */

/** Duplicates a project with a new ID. */
export async function handleDuplicateProject(
    message: MessageRequest,
): Promise<OkResponse & { project: StoredProject | null }> {
    const { projectId } = message as { projectId: string };
    const projects = await readAllProjects();
    const source = projects.find((p) => p.id === projectId);
    const isMissing = source === undefined;

    if (isMissing) {
        return { isOk: true, project: null };
    }

    const duplicate = buildDuplicate(source);
    projects.push(duplicate);
    await writeAllProjects(projects);

    return { isOk: true, project: duplicate };
}

/** Builds a duplicate project record from a source. */
function buildDuplicate(source: StoredProject): StoredProject {
    const now = nowTimestamp();

    return {
        ...source,
        id: generateId(),
        name: `${source.name} (Copy)`,
        createdAt: now,
        updatedAt: now,
    };
}

/* ------------------------------------------------------------------ */
/*  IMPORT_PROJECT                                                     */
/* ------------------------------------------------------------------ */

/** Imports a project from JSON string. */
export async function handleImportProject(
    message: MessageRequest,
): Promise<OkResponse & { project: StoredProject }> {
    const { json } = message as { json: string };
    const parsed = JSON.parse(json) as StoredProject;
    const now = nowTimestamp();

    const imported: StoredProject = {
        ...parsed,
        id: generateId(),
        createdAt: now,
        updatedAt: now,
    };

    const projects = await readAllProjects();
    projects.push(imported);
    await writeAllProjects(projects);

    return { isOk: true, project: imported };
}

/* ------------------------------------------------------------------ */
/*  EXPORT_PROJECT                                                     */
/* ------------------------------------------------------------------ */

/** Exports a project as JSON string. */
export async function handleExportProject(
    message: MessageRequest,
): Promise<{ json: string; filename: string }> {
    const { projectId } = message as { projectId: string };
    const projects = await readAllProjects();
    const project = projects.find((p) => p.id === projectId);

    return buildExportResult(project);
}

/** Builds the export response for a project. */
function buildExportResult(
    project: StoredProject | undefined,
): { json: string; filename: string } {
    const isFound = project !== undefined;

    if (isFound) {
        const slug = project.name.toLowerCase().replace(/\s+/g, "-");
        return {
            json: JSON.stringify(project, null, 2),
            filename: `marco-${slug}.json`,
        };
    }

    return {
        json: "{}",
        filename: "marco-project-export.json",
    };
}
