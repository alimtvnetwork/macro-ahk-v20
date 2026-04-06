/**
 * Stress Tests — Storage Performance & Data Integrity
 *
 * Seeds 100+ projects, scripts, and configs into chrome.storage.local,
 * then verifies CRUD correctness, data integrity, and injection
 * behaviour under load.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getScriptingCalls,
    getInjectedCode,
} from "../mocks/chrome-storage";

installChromeMock();

const { handleSaveProject, handleGetAllProjects, handleDeleteProject } =
    await import("../../src/background/handlers/project-handler");

const {
    handleSaveScript,
    handleGetAllScripts,
    handleDeleteScript,
    handleSaveConfig,
    handleGetAllConfigs,
    handleDeleteConfig,
} = await import("../../src/background/handlers/script-config-handler");

const { registerAutoInjector, handleNavigationCompleted } = await import(
    "../../src/background/auto-injector"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeProject(index: number) {
    return {
        id: `proj-${index}`,
        name: `Project ${index}`,
        version: "1.0.0",
        schemaVersion: 1,
        targetUrls: [
            { pattern: `https://site-${index}.test/*`, matchType: "glob" },
        ],
        scripts: [{ path: `script-${index}.js`, order: 1, runAt: "document_idle" }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeScript(index: number) {
    return {
        id: `script-${index}`,
        name: `script-${index}.js`,
        code: `console.log('script-${index}')`,
        order: index,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

function makeConfig(index: number) {
    return {
        id: `config-${index}`,
        name: `config-${index}.json`,
        json: JSON.stringify({ index, key: `value-${index}` }),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

async function flush(): Promise<void> {
    await new Promise((r) => setTimeout(r, 15));
}

/* ------------------------------------------------------------------ */
/*  Bulk Project CRUD                                                  */
/* ------------------------------------------------------------------ */

describe("Stress — Bulk Project Operations", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates 150 projects and retrieves all", async () => {
        const count = 150;

        for (let i = 0; i < count; i++) {
            await handleSaveProject({ type: "SAVE_PROJECT", project: makeProject(i) } as any);
        }

        const { projects } = await handleGetAllProjects();

        expect(projects.length).toBe(count);
    });

    it("each project retains correct ID after bulk insert", async () => {
        const count = 100;

        for (let i = 0; i < count; i++) {
            await handleSaveProject({ type: "SAVE_PROJECT", project: makeProject(i) } as any);
        }

        const { projects } = await handleGetAllProjects();

        for (let i = 0; i < count; i++) {
            const hasProject = projects.some((p) => p.id === `proj-${i}`);
            expect(hasProject).toBe(true);
        }
    });

    it("deletes 50 projects from 100 and verifies remainder", async () => {
        const total = 100;
        const deleteCount = 50;

        for (let i = 0; i < total; i++) {
            await handleSaveProject({ type: "SAVE_PROJECT", project: makeProject(i) } as any);
        }

        for (let i = 0; i < deleteCount; i++) {
            await handleDeleteProject({ type: "DELETE_PROJECT", projectId: `proj-${i}` } as any);
        }

        const { projects } = await handleGetAllProjects();

        expect(projects.length).toBe(total - deleteCount);

        const hasDeletedProject = projects.some((p) => p.id === "proj-0");
        expect(hasDeletedProject).toBe(false);

        const hasRemainingProject = projects.some((p) => p.id === `proj-${deleteCount}`);
        expect(hasRemainingProject).toBe(true);
    });

    it("updates all 100 projects without data loss", async () => {
        const count = 100;

        for (let i = 0; i < count; i++) {
            await handleSaveProject({ type: "SAVE_PROJECT", project: makeProject(i) } as any);
        }

        for (let i = 0; i < count; i++) {
            const updated = { ...makeProject(i), name: `Updated-${i}` };
            await handleSaveProject({ type: "SAVE_PROJECT", project: updated } as any);
        }

        const { projects } = await handleGetAllProjects();

        expect(projects.length).toBe(count);

        for (let i = 0; i < count; i++) {
            const proj = projects.find((p) => p.id === `proj-${i}`);
            expect(proj?.name).toBe(`Updated-${i}`);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Bulk Script CRUD                                                   */
/* ------------------------------------------------------------------ */

describe("Stress — Bulk Script Operations", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates 200 scripts and retrieves all", async () => {
        const count = 200;

        for (let i = 0; i < count; i++) {
            await handleSaveScript({ type: "SAVE_SCRIPT", script: makeScript(i) } as any);
        }

        const { scripts } = await handleGetAllScripts();

        expect(scripts.length).toBe(count);
    });

    it("each script retains unique code after bulk insert", async () => {
        const count = 120;

        for (let i = 0; i < count; i++) {
            await handleSaveScript({ type: "SAVE_SCRIPT", script: makeScript(i) } as any);
        }

        const { scripts } = await handleGetAllScripts();
        const codes = new Set(scripts.map((s) => s.code));

        expect(codes.size).toBe(count);
    });

    it("deletes scripts by ID without affecting others", async () => {
        const count = 100;

        for (let i = 0; i < count; i++) {
            await handleSaveScript({ type: "SAVE_SCRIPT", script: makeScript(i) } as any);
        }

        await handleDeleteScript({ type: "DELETE_SCRIPT", id: "script-50" } as any);
        await handleDeleteScript({ type: "DELETE_SCRIPT", id: "script-99" } as any);

        const { scripts } = await handleGetAllScripts();

        expect(scripts.length).toBe(count - 2);

        const hasDeleted = scripts.some((s) => s.id === "script-50");
        expect(hasDeleted).toBe(false);

        const hasRetained = scripts.some((s) => s.id === "script-0");
        expect(hasRetained).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Bulk Config CRUD                                                   */
/* ------------------------------------------------------------------ */

describe("Stress — Bulk Config Operations", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates 150 configs and retrieves all", async () => {
        const count = 150;

        for (let i = 0; i < count; i++) {
            await handleSaveConfig({ type: "SAVE_CONFIG", config: makeConfig(i) } as any);
        }

        const { configs } = await handleGetAllConfigs();

        expect(configs.length).toBe(count);
    });

    it("each config preserves valid JSON after bulk insert", async () => {
        const count = 100;

        for (let i = 0; i < count; i++) {
            await handleSaveConfig({ type: "SAVE_CONFIG", config: makeConfig(i) } as any);
        }

        const { configs } = await handleGetAllConfigs();

        for (const cfg of configs) {
            const parsed = JSON.parse(cfg.json);
            const hasIndex = typeof parsed.index === "number";
            expect(hasIndex).toBe(true);
        }
    });

    it("deletes configs without corrupting remaining entries", async () => {
        const count = 100;

        for (let i = 0; i < count; i++) {
            await handleSaveConfig({ type: "SAVE_CONFIG", config: makeConfig(i) } as any);
        }

        for (let i = 0; i < 30; i++) {
            await handleDeleteConfig({ type: "DELETE_CONFIG", id: `config-${i}` } as any);
        }

        const { configs } = await handleGetAllConfigs();

        expect(configs.length).toBe(70);

        for (const cfg of configs) {
            const parsed = JSON.parse(cfg.json);
            const isValid = parsed.key.startsWith("value-");
            expect(isValid).toBe(true);
        }
    });
});

/* ------------------------------------------------------------------ */
/*  Injection Under Load                                               */
/* ------------------------------------------------------------------ */

describe("Stress — Injection With Many Projects", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        registerAutoInjector();
    });

    it("injects correct script when 100 projects exist", async () => {
        const projects = [];
        const scripts = [];

        for (let i = 0; i < 100; i++) {
            projects.push({
                id: `proj-${i}`,
                name: `Project ${i}`,
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [
                    { pattern: `https://site-${i}.test/*`, matchType: "glob" },
                ],
                scripts: [
                    { path: `script-${i}.js`, order: 1, runAt: "document_idle" },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            scripts.push({
                id: `script-${i}.js`,
                name: `script-${i}.js`,
                code: `run_${i}()`,
                order: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: scripts,
            marco_configs: [],
        });

        handleNavigationCompleted({ tabId: 700, url: "https://site-42.test/page", frameId: 0 });
        await flush();

        const calls = getScriptingCalls().filter((c) => c.tabId === 700);

        expect(calls.length).toBe(1);

        const funcBody = getInjectedCode(calls[0]);
        const hasCorrectCode = funcBody.includes("run_42()");
        expect(hasCorrectCode).toBe(true);
    });

    it("does not inject non-matching projects from a large set", async () => {
        const projects = [];
        const scripts = [];

        for (let i = 0; i < 50; i++) {
            projects.push({
                id: `proj-${i}`,
                name: `Project ${i}`,
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [
                    { pattern: `https://site-${i}.test/*`, matchType: "glob" },
                ],
                scripts: [
                    { path: `script-${i}.js`, order: 1, runAt: "document_idle" },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });

            scripts.push({
                id: `script-${i}.js`,
                name: `script-${i}.js`,
                code: `run_${i}()`,
                order: 1,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: scripts,
            marco_configs: [],
        });

        const callsBefore = getScriptingCalls().length;
        handleNavigationCompleted({ tabId: 701, url: "https://nomatch.test/page", frameId: 0 });
        await flush();

        const callsAfter = getScriptingCalls().length;

        expect(callsAfter).toBe(callsBefore);
    });

    it("injects multiple scripts from one project among 100", async () => {
        const projects = [];
        const scripts = [];

        for (let i = 0; i < 100; i++) {
            const scriptEntries = i === 77
                ? [
                    { path: `s77-a.js`, order: 1, runAt: "document_idle" },
                    { path: `s77-b.js`, order: 2, runAt: "document_idle" },
                    { path: `s77-c.js`, order: 3, runAt: "document_idle" },
                  ]
                : [{ path: `script-${i}.js`, order: 1, runAt: "document_idle" }];

            projects.push({
                id: `proj-${i}`,
                name: `Project ${i}`,
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [
                    { pattern: `https://site-${i}.test/*`, matchType: "glob" },
                ],
                scripts: scriptEntries,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        scripts.push(
            { id: "s77-a.js", name: "s77-a.js", code: "stepA()", order: 1, createdAt: "", updatedAt: "" },
            { id: "s77-b.js", name: "s77-b.js", code: "stepB()", order: 2, createdAt: "", updatedAt: "" },
            { id: "s77-c.js", name: "s77-c.js", code: "stepC()", order: 3, createdAt: "", updatedAt: "" },
        );

        for (let i = 0; i < 100; i++) {
            if (i === 77) continue;
            scripts.push({
                id: `script-${i}.js`,
                name: `script-${i}.js`,
                code: `run_${i}()`,
                order: 1,
                createdAt: "",
                updatedAt: "",
            });
        }

        await chrome.storage.local.set({
            marco_projects: projects,
            marco_scripts: scripts,
            marco_configs: [],
        });

        handleNavigationCompleted({ tabId: 702, url: "https://site-77.test/dashboard", frameId: 0 });
        await flush();

        const calls = getScriptingCalls().filter((c) => c.tabId === 702);

        expect(calls.length).toBe(3);

        const bodies = calls.map((c) => getInjectedCode(c));
        expect(bodies[0].includes("stepA()")).toBe(true);
        expect(bodies[1].includes("stepB()")).toBe(true);
        expect(bodies[2].includes("stepC()")).toBe(true);
    });
});
