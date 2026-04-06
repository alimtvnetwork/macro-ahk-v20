/**
 * Integration test — Project Lifecycle (CRUD)
 *
 * Tests the full create → read → update → duplicate → export → delete lifecycle
 * through handler functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";

installChromeMock();

const { handleSaveProject, handleGetAllProjects, handleDeleteProject } = await import(
    "../../src/background/handlers/project-handler"
);
const { handleDuplicateProject, handleExportProject, handleImportProject } = await import(
    "../../src/background/handlers/project-export-handler"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildTestProject(name: string) {
    return {
        type: "SAVE_PROJECT",
        project: {
            name,
            version: "1.0.0",
            description: "Test project",
            schemaVersion: 1,
            targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
            scripts: [{ path: "test.js", order: 1 }],
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Project Lifecycle — CRUD Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates a new project with generated ID and timestamps", async () => {
        const result = await handleSaveProject(buildTestProject("Alpha") as any);

        expect(result.isOk).toBe(true);
        expect(result.project).toBeDefined();
        expect(result.project!.id).toBeTruthy();
        expect(result.project!.name).toBe("Alpha");
        expect(result.project!.createdAt).toBeTruthy();
        expect(result.project!.updatedAt).toBeTruthy();
    });

    it("reads all projects after creating multiple", async () => {
        await handleSaveProject(buildTestProject("Alpha") as any);
        await handleSaveProject(buildTestProject("Beta") as any);
        await handleSaveProject(buildTestProject("Gamma") as any);

        const result = await handleGetAllProjects();

        expect(result.projects.length).toBe(3);
    });

    it("updates an existing project by ID", async () => {
        const created = await handleSaveProject(buildTestProject("Alpha") as any);
        const projectId = created.project!.id;

        const updateResult = await handleSaveProject({
            type: "SAVE_PROJECT",
            project: {
                ...created.project!,
                name: "Alpha Updated",
            },
        } as any);

        expect(updateResult.project!.id).toBe(projectId);
        expect(updateResult.project!.name).toBe("Alpha Updated");

        const all = await handleGetAllProjects();
        expect(all.projects.length).toBe(1);
    });

    it("duplicates a project with new ID and '(Copy)' suffix", async () => {
        const created = await handleSaveProject(buildTestProject("Alpha") as any);
        const originalId = created.project!.id;

        const duped = await handleDuplicateProject({
            projectId: originalId,
        } as any);

        expect(duped.project).not.toBeNull();
        expect(duped.project!.id).not.toBe(originalId);
        expect(duped.project!.name).toBe("Alpha (Copy)");

        const all = await handleGetAllProjects();
        expect(all.projects.length).toBe(2);
    });

    it("exports a project as JSON", async () => {
        const created = await handleSaveProject(buildTestProject("Alpha") as any);

        const exported = await handleExportProject({
            projectId: created.project!.id,
        } as any);

        expect(exported.json).toBeTruthy();
        expect(exported.filename).toContain("alpha");
        const parsed = JSON.parse(exported.json);
        expect(parsed.name).toBe("Alpha");
    });

    it("imports a project from JSON with new ID", async () => {
        const created = await handleSaveProject(buildTestProject("Alpha") as any);
        const exported = await handleExportProject({ projectId: created.project!.id } as any);

        const imported = await handleImportProject({ json: exported.json } as any);

        expect(imported.project.id).not.toBe(created.project!.id);
        expect(imported.project.name).toBe("Alpha");

        const all = await handleGetAllProjects();
        expect(all.projects.length).toBe(2);
    });

    it("deletes a project and cleans up storage", async () => {
        const created = await handleSaveProject(buildTestProject("Alpha") as any);
        await handleSaveProject(buildTestProject("Beta") as any);

        const result = await handleDeleteProject({
            projectId: created.project!.id,
        } as any);

        expect(result.isOk).toBe(true);

        const all = await handleGetAllProjects();
        expect(all.projects.length).toBe(1);
        expect(all.projects[0].name).toBe("Beta");
    });

    it("deleting a non-existent project returns OK", async () => {
        const result = await handleDeleteProject({
            projectId: "non-existent-id",
        } as any);

        expect(result.isOk).toBe(true);
    });

    it("full lifecycle: create → update → duplicate → export → delete → import", async () => {
        // Create
        const created = await handleSaveProject(buildTestProject("Lifecycle") as any);
        const projectId = created.project!.id;

        // Update
        await handleSaveProject({
            type: "SAVE_PROJECT",
            project: { ...created.project!, name: "Lifecycle v2" },
        } as any);

        // Duplicate
        const duped = await handleDuplicateProject({ projectId } as any);
        expect(duped.project!.name).toBe("Lifecycle v2 (Copy)");

        // Export
        const exported = await handleExportProject({ projectId } as any);
        expect(JSON.parse(exported.json).name).toBe("Lifecycle v2");

        // Delete both
        await handleDeleteProject({ projectId } as any);
        await handleDeleteProject({ projectId: duped.project!.id } as any);
        const empty = await handleGetAllProjects();
        expect(empty.projects.length).toBe(0);

        // Import from export
        const imported = await handleImportProject({ json: exported.json } as any);
        expect(imported.project.name).toBe("Lifecycle v2");

        const final = await handleGetAllProjects();
        expect(final.projects.length).toBe(1);
    });
});
