/**
 * Unit tests — Project Helpers
 *
 * Tests readAllProjects, writeAllProjects, readActiveProjectId,
 * generateId, and nowTimestamp from the helpers module.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getMockStoreSnapshot,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    readAllProjects,
    writeAllProjects,
    readActiveProjectId,
    generateId,
    nowTimestamp,
} = await import("../../src/background/handlers/project-helpers");

describe("Project Helpers — readAllProjects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns empty array when no projects exist", async () => {
        const projects = await readAllProjects();

        expect(projects).toEqual([]);
    });

    it("returns stored projects", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_projects: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }],
        });

        const projects = await readAllProjects();

        expect(projects).toHaveLength(2);
        expect(projects[0].id).toBe("p1");
    });

    it("handles non-array storage value gracefully", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_projects: "corrupted",
        });

        const projects = await readAllProjects();

        expect(projects).toEqual([]);
    });
});

describe("Project Helpers — writeAllProjects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("persists projects to storage", async () => {
        const testProjects = [
            { id: "p1", name: "Test" } as any,
        ];

        await writeAllProjects(testProjects);

        const snapshot = getMockStoreSnapshot();
        const stored = snapshot["marco_projects"] as unknown[];

        expect(stored).toHaveLength(1);
        expect((stored[0] as any).id).toBe("p1");
    });

    it("overwrites existing projects", async () => {
        await writeAllProjects([{ id: "p1", name: "Old" } as any]);
        await writeAllProjects([{ id: "p2", name: "New" } as any]);

        const snapshot = getMockStoreSnapshot();
        const stored = snapshot["marco_projects"] as unknown[];

        expect(stored).toHaveLength(1);
        expect((stored[0] as any).id).toBe("p2");
    });
});

describe("Project Helpers — readActiveProjectId", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns null when no active project set", async () => {
        const id = await readActiveProjectId();

        expect(id).toBeNull();
    });

    it("returns the active project ID", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_active_project: "p1",
        });

        const id = await readActiveProjectId();

        expect(id).toBe("p1");
    });

    it("returns null for non-string value", async () => {
        await (globalThis as any).chrome.storage.local.set({
            marco_active_project: 123,
        });

        const id = await readActiveProjectId();

        expect(id).toBeNull();
    });
});

describe("Project Helpers — generateId", () => {
    it("returns a UUID string", () => {
        const id = generateId();

        expect(typeof id).toBe("string");
        expect(id.length).toBeGreaterThan(0);
    });

    it("generates unique values", () => {
        const ids = new Set(Array.from({ length: 100 }, () => generateId()));

        expect(ids.size).toBe(100);
    });
});

describe("Project Helpers — nowTimestamp", () => {
    it("returns parseable ISO timestamp", () => {
        const ts = nowTimestamp();
        const parsed = new Date(ts);

        expect(parsed.toISOString()).toBe(ts);
    });
});
