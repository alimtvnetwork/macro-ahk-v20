/**
 * Unit tests — Project Export Handler
 *
 * Tests duplicate, import, and export operations.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getMockStoreSnapshot,
} from "../mocks/chrome-storage";

installChromeMock();

const { handleDuplicateProject, handleImportProject, handleExportProject } =
    await import("../../src/background/handlers/project-export-handler");

/** Seeds a project into mock storage. */
async function seedProject(project: Record<string, unknown>): Promise<void> {
    await (globalThis as any).chrome.storage.local.set({
        marco_projects: [project],
    });
}

const baseProject = {
    id: "p1",
    schemaVersion: 1,
    name: "Test Project",
    version: "1.0.0",
    description: "A test project",
    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
    scripts: [],
    configs: [],
    settings: { logLevel: "info" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("Project Export — handleDuplicateProject", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("duplicates a project with a new ID", async () => {
        await seedProject(baseProject);

        const result = await handleDuplicateProject({ type: "DUPLICATE_PROJECT", projectId: "p1" } as any);

        expect(result.isOk).toBe(true);
        expect(result.project).not.toBeNull();
        expect(result.project!.id).not.toBe("p1");
        expect(result.project!.name).toBe("Test Project (Copy)");
    });

    it("preserves URL rules in duplicate", async () => {
        await seedProject(baseProject);

        const result = await handleDuplicateProject({ type: "DUPLICATE_PROJECT", projectId: "p1" } as any);

        expect(result.project!.targetUrls).toHaveLength(1);
        expect(result.project!.targetUrls[0].pattern).toBe("https://example.com/*");
    });

    it("returns null project when source not found", async () => {
        const result = await handleDuplicateProject({ type: "DUPLICATE_PROJECT", projectId: "nonexistent" } as any);

        expect(result.isOk).toBe(true);
        expect(result.project).toBeNull();
    });

    it("adds duplicate to the projects list", async () => {
        await seedProject(baseProject);

        await handleDuplicateProject({ type: "DUPLICATE_PROJECT", projectId: "p1" } as any);

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as unknown[];

        expect(projects).toHaveLength(2);
    });
});

describe("Project Export — handleImportProject", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("imports a project from JSON with new ID", async () => {
        const json = JSON.stringify(baseProject);

        const result = await handleImportProject({ type: "IMPORT_PROJECT", json } as any);

        expect(result.isOk).toBe(true);
        expect(result.project.name).toBe("Test Project");
        expect(result.project.id).not.toBe("p1");
    });

    it("persists imported project to storage", async () => {
        const json = JSON.stringify(baseProject);

        await handleImportProject({ type: "IMPORT_PROJECT", json } as any);

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as unknown[];

        expect(projects).toHaveLength(1);
    });
});

describe("Project Export — handleExportProject", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("exports a project as JSON with filename", async () => {
        await seedProject(baseProject);

        const result = await handleExportProject({ type: "EXPORT_PROJECT", projectId: "p1" } as any);

        expect(result.json).toContain("Test Project");
        expect(result.filename).toBe("marco-test-project.json");
    });

    it("returns empty JSON when project not found", async () => {
        const result = await handleExportProject({ type: "EXPORT_PROJECT", projectId: "nope" } as any);

        expect(result.json).toBe("{}");
    });

    it("exported JSON is valid and parseable", async () => {
        await seedProject(baseProject);

        const result = await handleExportProject({ type: "EXPORT_PROJECT", projectId: "p1" } as any);
        const parsed = JSON.parse(result.json);

        expect(parsed.id).toBe("p1");
        expect(parsed.name).toBe("Test Project");
    });
});
