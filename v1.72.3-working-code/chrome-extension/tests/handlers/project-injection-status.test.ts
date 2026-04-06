/**
 * Unit tests — Project Injection Status
 *
 * Tests per-script status building for popup rendering.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock state-manager
vi.mock("../../../src/background/state-manager", () => {
    let injections: Record<number, { scriptIds: string[] }> = {};
    return {
        getTabInjections: () => injections,
        __setTabInjections: (data: typeof injections) => { injections = data; },
    };
});

let mockStorageData: Record<string, unknown>;
let mockActiveTabs: Array<{ id: number; url?: string }>;

beforeEach(() => {
    vi.clearAllMocks();
    mockStorageData = {};
    mockActiveTabs = [];

    (globalThis as any).chrome = {
        storage: {
            local: {
                get: vi.fn(async (keys: string | string[]) => {
                    const keyList = Array.isArray(keys) ? keys : [keys];
                    const result: Record<string, unknown> = {};
                    for (const key of keyList) {
                        if (key in mockStorageData) {
                            result[key] = mockStorageData[key];
                        }
                    }
                    return result;
                }),
            },
        },
        tabs: {
            query: vi.fn(async () => mockActiveTabs),
        },
    };
});

describe("Project Injection Status — No Project", () => {
    it("returns empty status when project is null", async () => {
        const { buildInjectedScriptStatus } = await import(
            "../../src/background/handlers/project-injection-status"
        );

        const status = await buildInjectedScriptStatus(null);
        expect(status).toEqual({});
    });
});

describe("Project Injection Status — No Active Tab", () => {
    it("returns not loaded for all scripts when no active tab", async () => {
        mockActiveTabs = []; // No active tab

        const { buildInjectedScriptStatus } = await import(
            "../../src/background/handlers/project-injection-status"
        );

        const project = {
            id: "proj-1",
            schemaVersion: 1,
            name: "Test",
            version: "1.0",
            urlRules: [],
            scripts: [
                { path: "scripts/main.js", order: 1 },
                { path: "scripts/helper.js", order: 2 },
            ],
            configs: [],
            settings: {},
        };

        const status = await buildInjectedScriptStatus(project as any);
        expect(status["scripts/main.js"]).toEqual({ status: "not loaded" });
        expect(status["scripts/helper.js"]).toEqual({ status: "not loaded" });
    });
});

describe("Project Injection Status — With Active Tab", () => {
    it("marks scripts as injected when tab has injection records", async () => {
        mockActiveTabs = [{ id: 10 }];
        mockStorageData = {
            marco_scripts: [
                { id: "sid-1", name: "scripts/main.js" },
                { id: "sid-2", name: "scripts/helper.js" },
            ],
        };

        // Set up injection state
        const stateManager = await import("../../src/background/state-manager");
        (stateManager as any).__setTabInjections({
            10: { scriptIds: ["sid-1"] },
        });

        const { buildInjectedScriptStatus } = await import(
            "../../src/background/handlers/project-injection-status"
        );

        const project = {
            id: "proj-1",
            schemaVersion: 1,
            name: "Test",
            version: "1.0",
            urlRules: [],
            scripts: [
                { path: "scripts/main.js", order: 1 },
                { path: "scripts/helper.js", order: 2 },
            ],
            configs: [],
            settings: {},
        };

        const status = await buildInjectedScriptStatus(project as any);
        expect(status["scripts/main.js"]).toEqual({ status: "injected" });
        expect(status["scripts/helper.js"]).toEqual({ status: "not loaded" });
    });

    it("returns not loaded when tab has no injection record", async () => {
        mockActiveTabs = [{ id: 99 }];

        const stateManager = await import("../../src/background/state-manager");
        (stateManager as any).__setTabInjections({}); // No record for tab 99

        const { buildInjectedScriptStatus } = await import(
            "../../src/background/handlers/project-injection-status"
        );

        const project = {
            id: "proj-1",
            schemaVersion: 1,
            name: "Test",
            version: "1.0",
            urlRules: [],
            scripts: [{ path: "scripts/main.js", order: 1 }],
            configs: [],
            settings: {},
        };

        const status = await buildInjectedScriptStatus(project as any);
        expect(status["scripts/main.js"]).toEqual({ status: "not loaded" });
    });
});

describe("Project Injection Status — Script Alias Resolution", () => {
    it("matches scripts by stored name alias", async () => {
        mockActiveTabs = [{ id: 5 }];
        mockStorageData = {
            marco_scripts: [
                { id: "uuid-abc", name: "main.js" },
            ],
        };

        const stateManager = await import("../../src/background/state-manager");
        (stateManager as any).__setTabInjections({
            5: { scriptIds: ["uuid-abc"] },
        });

        const { buildInjectedScriptStatus } = await import(
            "../../src/background/handlers/project-injection-status"
        );

        const project = {
            id: "proj-1",
            schemaVersion: 1,
            name: "Test",
            version: "1.0",
            urlRules: [],
            scripts: [{ path: "main.js", order: 1 }],
            configs: [],
            settings: {},
        };

        const status = await buildInjectedScriptStatus(project as any);
        expect(status["main.js"]).toEqual({ status: "injected" });
    });
});
