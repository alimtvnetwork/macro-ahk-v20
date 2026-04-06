/**
 * Unit tests — Project Handler CRUD
 *
 * Tests handleGetAllProjects, handleSaveProject, handleDeleteProject,
 * handleDuplicateProject, handleImportProject, handleExportProject
 * against a mocked chrome.storage.local.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getMockStoreSnapshot,
} from "../mocks/chrome-storage";
import { MessageType } from "../../src/shared/messages";

installChromeMock();

const {
    handleGetAllProjects,
    handleSaveProject,
    handleDeleteProject,
    handleDuplicateProject,
    handleImportProject,
    handleExportProject,
    handleSetActiveProject,
    handleGetActiveProject,
} = await import("../../src/background/handlers/project-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function saveMsg(project: Record<string, unknown>) {
    return { type: MessageType.SAVE_PROJECT, project } as any;
}

function testProject(overrides: Record<string, unknown> = {}) {
    return {
        name: "Test Project",
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: [],
        scripts: [],
        ...overrides,
    };
}

function projectWithRulesAndScripts(overrides: Record<string, unknown> = {}) {
    return testProject({
        targetUrls: [
            { pattern: "https://example.com/*", matchType: "glob" },
            { pattern: "https://api.example.com/v2", matchType: "exact" },
        ],
        scripts: [
            { path: "init.js", order: 1, runAt: "document_start" },
            { path: "main.js", order: 2, runAt: "document_idle", configBinding: "cfg1" },
        ],
        configs: [{ path: "settings.json", description: "App settings" }],
        settings: { isolateScripts: true, logLevel: "debug", retryOnNavigate: false },
        description: "Full project with all fields",
        ...overrides,
    });
}

const sender = { tab: { id: 1 } } as any;

/* ------------------------------------------------------------------ */
/*  CRUD Basics                                                        */
/* ------------------------------------------------------------------ */

describe("Project Handler — CRUD Basics", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns empty array when no projects exist", async () => {
        const result = await handleGetAllProjects();
        expect(result.projects).toEqual([]);
    });

    it("creates a project with auto-generated id and timestamps", async () => {
        const result = await handleSaveProject(saveMsg(testProject()));

        expect(result.isOk).toBe(true);
        expect(result.project.id).toBeTruthy();
        expect(result.project.createdAt).toBeTruthy();
        expect(result.project.updatedAt).toBeTruthy();
        expect(result.project.name).toBe("Test Project");
    });

    it("persists project to storage and retrieves it", async () => {
        await handleSaveProject(saveMsg(testProject()));
        const result = await handleGetAllProjects();

        expect(result.projects).toHaveLength(1);
        expect(result.projects[0].name).toBe("Test Project");
    });

    it("updates existing project by id", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));
        const projectId = created.project.id;

        const updated = await handleSaveProject(
            saveMsg(testProject({ id: projectId, name: "Updated" })),
        );

        expect(updated.project.id).toBe(projectId);
        expect(updated.project.name).toBe("Updated");

        const all = await handleGetAllProjects();
        expect(all.projects).toHaveLength(1);
    });

    it("deletes a project by id", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        const result = await handleDeleteProject({
            type: MessageType.DELETE_PROJECT,
            projectId: created.project.id,
        } as any);

        expect(result.isOk).toBe(true);
        const all = await handleGetAllProjects();
        expect(all.projects).toHaveLength(0);
    });

    it("delete is idempotent for nonexistent id", async () => {
        const result = await handleDeleteProject({
            type: MessageType.DELETE_PROJECT,
            projectId: "does-not-exist",
        } as any);

        expect(result.isOk).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Multiple Projects                                                  */
/* ------------------------------------------------------------------ */

describe("Project Handler — Multiple Projects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("stores multiple projects independently", async () => {
        await handleSaveProject(saveMsg(testProject({ name: "Alpha" })));
        await handleSaveProject(saveMsg(testProject({ name: "Beta" })));
        await handleSaveProject(saveMsg(testProject({ name: "Gamma" })));

        const all = await handleGetAllProjects();

        expect(all.projects).toHaveLength(3);
        const names = all.projects.map((p) => p.name);
        expect(names).toContain("Alpha");
        expect(names).toContain("Beta");
        expect(names).toContain("Gamma");
    });

    it("deletes only the targeted project", async () => {
        const a = await handleSaveProject(saveMsg(testProject({ name: "Keep" })));
        const b = await handleSaveProject(saveMsg(testProject({ name: "Delete Me" })));

        await handleDeleteProject({
            type: MessageType.DELETE_PROJECT,
            projectId: b.project.id,
        } as any);

        const all = await handleGetAllProjects();
        expect(all.projects).toHaveLength(1);
        expect(all.projects[0].name).toBe("Keep");
    });

    it("updates correct project among multiple", async () => {
        const a = await handleSaveProject(saveMsg(testProject({ name: "First" })));
        await handleSaveProject(saveMsg(testProject({ name: "Second" })));

        await handleSaveProject(
            saveMsg(testProject({ id: a.project.id, name: "First Updated" })),
        );

        const all = await handleGetAllProjects();
        expect(all.projects).toHaveLength(2);

        const first = all.projects.find((p) => p.id === a.project.id);
        expect(first!.name).toBe("First Updated");
    });
});

/* ------------------------------------------------------------------ */
/*  Data Integrity                                                     */
/* ------------------------------------------------------------------ */

describe("Project Handler — Data Integrity", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("preserves URL rules through save and retrieve", async () => {
        const result = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts()),
        );

        const all = await handleGetAllProjects();
        const saved = all.projects.find((p) => p.id === result.project.id)!;

        expect(saved.targetUrls).toHaveLength(2);
        expect(saved.targetUrls[0].pattern).toBe("https://example.com/*");
        expect(saved.targetUrls[0].matchType).toBe("glob");
        expect(saved.targetUrls[1].matchType).toBe("exact");
    });

    it("preserves scripts with order and configBinding", async () => {
        const result = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts()),
        );

        const all = await handleGetAllProjects();
        const saved = all.projects.find((p) => p.id === result.project.id)!;

        expect(saved.scripts).toHaveLength(2);
        expect(saved.scripts[0].path).toBe("init.js");
        expect(saved.scripts[0].order).toBe(1);
        expect(saved.scripts[1].configBinding).toBe("cfg1");
    });

    it("preserves settings through save cycle", async () => {
        const result = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts()),
        );

        const all = await handleGetAllProjects();
        const saved = all.projects.find((p) => p.id === result.project.id)!;

        expect(saved.settings?.isolateScripts).toBe(true);
        expect(saved.settings?.logLevel).toBe("debug");
        expect(saved.settings?.retryOnNavigate).toBe(false);
    });

    it("preserves description through save cycle", async () => {
        const result = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts()),
        );

        const all = await handleGetAllProjects();
        const saved = all.projects.find((p) => p.id === result.project.id)!;

        expect(saved.description).toBe("Full project with all fields");
    });

    it("update changes updatedAt but preserves createdAt", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));
        const originalCreatedAt = created.project.createdAt;

        // Small delay to ensure timestamp differs
        await new Promise((r) => setTimeout(r, 10));

        const updated = await handleSaveProject(
            saveMsg(testProject({ id: created.project.id, name: "Changed" })),
        );

        expect(updated.project.updatedAt).not.toBe(originalCreatedAt);
    });

    it("each created project gets a unique id", async () => {
        const ids = new Set<string>();

        for (let i = 0; i < 20; i++) {
            const result = await handleSaveProject(
                saveMsg(testProject({ name: `Project ${i}` })),
            );
            ids.add(result.project.id);
        }

        expect(ids.size).toBe(20);
    });
});

/* ------------------------------------------------------------------ */
/*  Duplication                                                        */
/* ------------------------------------------------------------------ */

describe("Project Handler — Duplication", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("duplicates with new id and (Copy) suffix", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        const result = await handleDuplicateProject({
            type: MessageType.DUPLICATE_PROJECT,
            projectId: created.project.id,
        } as any);

        expect(result.project).not.toBeNull();
        expect(result.project!.id).not.toBe(created.project.id);
        expect(result.project!.name).toBe("Test Project (Copy)");
    });

    it("duplicate preserves URL rules and scripts", async () => {
        const created = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts()),
        );

        const result = await handleDuplicateProject({
            type: MessageType.DUPLICATE_PROJECT,
            projectId: created.project.id,
        } as any);

        expect(result.project!.targetUrls).toHaveLength(2);
        expect(result.project!.scripts).toHaveLength(2);
        expect(result.project!.scripts[1].configBinding).toBe("cfg1");
    });

    it("duplicate preserves settings", async () => {
        const created = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts()),
        );

        const result = await handleDuplicateProject({
            type: MessageType.DUPLICATE_PROJECT,
            projectId: created.project.id,
        } as any);

        expect(result.project!.settings?.isolateScripts).toBe(true);
        expect(result.project!.settings?.logLevel).toBe("debug");
    });

    it("adds duplicate to storage alongside original", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        await handleDuplicateProject({
            type: MessageType.DUPLICATE_PROJECT,
            projectId: created.project.id,
        } as any);

        const all = await handleGetAllProjects();
        expect(all.projects).toHaveLength(2);
    });

    it("returns null for nonexistent source project", async () => {
        const result = await handleDuplicateProject({
            type: MessageType.DUPLICATE_PROJECT,
            projectId: "ghost",
        } as any);

        expect(result.project).toBeNull();
    });

    it("duplicate gets fresh timestamps", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        await new Promise((r) => setTimeout(r, 10));

        const result = await handleDuplicateProject({
            type: MessageType.DUPLICATE_PROJECT,
            projectId: created.project.id,
        } as any);

        expect(result.project!.createdAt).not.toBe(created.project.createdAt);
    });
});

/* ------------------------------------------------------------------ */
/*  Import / Export                                                    */
/* ------------------------------------------------------------------ */

describe("Project Handler — Import / Export", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("imports a project from JSON with new id", async () => {
        const original = projectWithRulesAndScripts({ id: "old-id", name: "Imported" });
        const json = JSON.stringify(original);

        const result = await handleImportProject({
            type: MessageType.IMPORT_PROJECT,
            json,
        } as any);

        expect(result.project.id).not.toBe("old-id");
        expect(result.project.name).toBe("Imported");
    });

    it("imported project preserves all nested data", async () => {
        const original = projectWithRulesAndScripts({ id: "old" });
        const json = JSON.stringify(original);

        const result = await handleImportProject({
            type: MessageType.IMPORT_PROJECT,
            json,
        } as any);

        expect(result.project.targetUrls).toHaveLength(2);
        expect(result.project.scripts).toHaveLength(2);
        expect(result.project.settings?.logLevel).toBe("debug");
    });

    it("imported project is persisted to storage", async () => {
        const json = JSON.stringify(testProject({ name: "Persisted Import" }));

        await handleImportProject({
            type: MessageType.IMPORT_PROJECT,
            json,
        } as any);

        const all = await handleGetAllProjects();
        expect(all.projects).toHaveLength(1);
        expect(all.projects[0].name).toBe("Persisted Import");
    });

    it("exports project as valid JSON with slug filename", async () => {
        const created = await handleSaveProject(
            saveMsg(testProject({ name: "My Cool Project" })),
        );

        const result = await handleExportProject({
            type: MessageType.EXPORT_PROJECT,
            projectId: created.project.id,
        } as any);

        const parsed = JSON.parse(result.json);
        expect(parsed.name).toBe("My Cool Project");
        expect(result.filename).toBe("marco-my-cool-project.json");
    });

    it("export returns empty JSON for missing project", async () => {
        const result = await handleExportProject({
            type: MessageType.EXPORT_PROJECT,
            projectId: "nonexistent",
        } as any);

        expect(result.json).toBe("{}");
    });

    it("round-trip: export then import produces equivalent project", async () => {
        const created = await handleSaveProject(
            saveMsg(projectWithRulesAndScripts({ name: "Roundtrip" })),
        );

        const exported = await handleExportProject({
            type: MessageType.EXPORT_PROJECT,
            projectId: created.project.id,
        } as any);

        const imported = await handleImportProject({
            type: MessageType.IMPORT_PROJECT,
            json: exported.json,
        } as any);

        expect(imported.project.name).toBe("Roundtrip");
        expect(imported.project.targetUrls).toHaveLength(2);
        expect(imported.project.scripts).toHaveLength(2);
        expect(imported.project.id).not.toBe(created.project.id);
    });
});

/* ------------------------------------------------------------------ */
/*  Active Project                                                     */
/* ------------------------------------------------------------------ */

describe("Project Handler — Active Project", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("sets and gets active project", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        await handleSetActiveProject(
            { type: MessageType.SET_ACTIVE_PROJECT, projectId: created.project.id } as any,
            sender,
        );

        const result = await handleGetActiveProject(sender);
        expect((result as any).activeProject).not.toBeNull();
        expect((result as any).activeProject.id).toBe(created.project.id);
    });

    it("returns null activeProject when none set", async () => {
        const result = await handleGetActiveProject(sender);
        expect((result as any).activeProject).toBeNull();
    });

    it("returns allProjects in getActiveProject response", async () => {
        await handleSaveProject(saveMsg(testProject({ name: "A" })));
        await handleSaveProject(saveMsg(testProject({ name: "B" })));

        const result = await handleGetActiveProject(sender);
        expect((result as any).allProjects).toHaveLength(2);
    });

    it("clears active project when deleted", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        await handleSetActiveProject(
            { type: MessageType.SET_ACTIVE_PROJECT, projectId: created.project.id } as any,
            sender,
        );

        await handleDeleteProject({
            type: MessageType.DELETE_PROJECT,
            projectId: created.project.id,
        } as any);

        const result = await handleGetActiveProject(sender);
        expect((result as any).activeProject).toBeNull();
    });

    it("active project survives unrelated project deletion", async () => {
        const keep = await handleSaveProject(saveMsg(testProject({ name: "Keep" })));
        const remove = await handleSaveProject(saveMsg(testProject({ name: "Remove" })));

        await handleSetActiveProject(
            { type: MessageType.SET_ACTIVE_PROJECT, projectId: keep.project.id } as any,
            sender,
        );

        await handleDeleteProject({
            type: MessageType.DELETE_PROJECT,
            projectId: remove.project.id,
        } as any);

        const result = await handleGetActiveProject(sender);
        expect((result as any).activeProject).not.toBeNull();
        expect((result as any).activeProject.id).toBe(keep.project.id);
    });

    it("switching active project works correctly", async () => {
        const a = await handleSaveProject(saveMsg(testProject({ name: "A" })));
        const b = await handleSaveProject(saveMsg(testProject({ name: "B" })));

        await handleSetActiveProject(
            { type: MessageType.SET_ACTIVE_PROJECT, projectId: a.project.id } as any,
            sender,
        );

        let result = await handleGetActiveProject(sender);
        expect((result as any).activeProject.name).toBe("A");

        await handleSetActiveProject(
            { type: MessageType.SET_ACTIVE_PROJECT, projectId: b.project.id } as any,
            sender,
        );

        result = await handleGetActiveProject(sender);
        expect((result as any).activeProject.name).toBe("B");
    });
});

/* ------------------------------------------------------------------ */
/*  Storage Verification                                               */
/* ------------------------------------------------------------------ */

describe("Project Handler — Storage Verification", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("save writes to marco_projects key", async () => {
        await handleSaveProject(saveMsg(testProject()));

        const snapshot = getMockStoreSnapshot();
        const hasKey = "marco_projects" in snapshot;

        expect(hasKey).toBe(true);
    });

    it("storage contains correct project count after multiple operations", async () => {
        await handleSaveProject(saveMsg(testProject({ name: "1" })));
        const b = await handleSaveProject(saveMsg(testProject({ name: "2" })));
        await handleSaveProject(saveMsg(testProject({ name: "3" })));

        await handleDeleteProject({
            type: MessageType.DELETE_PROJECT,
            projectId: b.project.id,
        } as any);

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as unknown[];

        expect(projects).toHaveLength(2);
    });

    it("setActiveProject writes to marco_active_project key", async () => {
        const created = await handleSaveProject(saveMsg(testProject()));

        await handleSetActiveProject(
            { type: MessageType.SET_ACTIVE_PROJECT, projectId: created.project.id } as any,
            sender,
        );

        const snapshot = getMockStoreSnapshot();

        expect(snapshot["marco_active_project"]).toBe(created.project.id);
    });
});
