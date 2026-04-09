/**
 * Integration tests — Default Project Seeder
 *
 * Verifies first-install seeding of the Marco Automation project,
 * idempotency on re-install, and first-run marker persistence.
 * Updated for manifest-driven seeding (no legacy seed chunks).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getMockStoreSnapshot,
} from "../mocks/chrome-storage";

// Mock heavy dependencies — root src/ paths since the chrome-extension shim re-exports from there
vi.mock("../../../src/background/manifest-seeder", () => ({
    seedFromManifest: vi.fn().mockResolvedValue({ scripts: 3, configs: 2, projects: 3 }),
}));

vi.mock("../../../src/background/boot", () => ({
    bootReady: Promise.resolve(),
}));

vi.mock("../../../src/background/bg-logger", () => ({
    logCaughtError: vi.fn(),
    BgLogTag: { DefaultProjectSeeder: "DefaultProjectSeeder" },
}));

vi.mock("../../../src/background/handlers/updater-handler", () => ({
    handleListUpdaters: vi.fn().mockResolvedValue([]),
    handleCreateUpdater: vi.fn().mockResolvedValue(undefined),
    linkUpdaterToCategory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/background/db-manager", () => ({
    initDatabases: vi.fn().mockResolvedValue({}),
}));

vi.mock("../../../src/background/injection-cache", () => ({
    invalidateCacheOnDeploy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/background/cache-warmer", () => ({
    warmScriptCache: vi.fn().mockResolvedValue({ hit: 0, miss: 0 }),
}));

installChromeMock();

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

let installedListeners: Array<(details: any) => void> = [];

function installSeederMock(): void {
    installedListeners = [];

    (globalThis as any).chrome.runtime.onInstalled = {
        addListener: (listener: (details: any) => void) => {
            installedListeners.push(listener);
        },
    };
}

async function simulateInstall(reason: string = "install"): Promise<void> {
    for (const listener of installedListeners) {
        await listener({ reason });
    }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Default Project Seeder", () => {
    beforeEach(async () => {
        resetMockStorage();
        installChromeMock();
        installSeederMock();

        // Dynamic import to pick up fresh mock
        const mod = await import("../../src/background/default-project-seeder");
        mod.registerInstallListener();
    });

    it("seeds default project on first install", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const hasProjects = Array.isArray(projects) && projects.length > 0;

        expect(hasProjects).toBe(true);

        const defaultProject = projects.find((p: any) => p.id === "default-lovable");
        const hasDefault = defaultProject !== undefined;

        expect(hasDefault).toBe(true);
        expect(defaultProject.name).toBe("Macro Controller");
    });

    it("sets first-run marker on install", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const firstRun = snapshot["marco_first_run"];

        expect(firstRun).toBe(true);
    });

    it("does NOT skip on update — normalizes project on update too", async () => {
        await simulateInstall("update");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const hasProjects = Array.isArray(projects) && projects.length > 0;

        expect(hasProjects).toBe(true);
    });

    it("is idempotent — does not duplicate on repeated installs", async () => {
        await simulateInstall("install");
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const defaultProjects = projects.filter((p: any) => p.id === "default-lovable");

        expect(defaultProjects.length).toBe(1);
    });

    it("default project has correct URL rules", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const defaultProject = projects.find((p: any) => p.id === "default-lovable");

        const urls = defaultProject.targetUrls;
        const hasLovableDev = urls.some((u: any) => u.pattern.includes("lovable.dev"));
        const hasLovableApp = urls.some((u: any) => u.pattern.includes("lovable.app"));
        const hasLovableProject = urls.some((u: any) => u.pattern.includes("lovableproject.com"));

        expect(hasLovableDev).toBe(true);
        expect(hasLovableApp).toBe(true);
        expect(hasLovableProject).toBe(true);
    });

    it("default project has correct settings", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const defaultProject = projects.find((p: any) => p.id === "default-lovable");

        expect(defaultProject.settings.isolateScripts).toBe(true);
        expect(defaultProject.settings.logLevel).toBe("info");
        expect(defaultProject.settings.retryOnNavigate).toBe(true);
    });

    it("default project uses single-script architecture (macro-looping.js only)", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const defaultProject = projects.find((p: any) => p.id === "default-lovable");

        const scripts = defaultProject.scripts;
        const isScriptsPopulated = Array.isArray(scripts) && scripts.length === 1;
        expect(isScriptsPopulated).toBe(true);

        const looping = scripts.find((s: any) => s.path === "macro-looping.js");
        const hasLooping = looping !== undefined;
        expect(hasLooping).toBe(true);
        expect(looping.configBinding).toBe("macro-looping-config.json");

        // Legacy scripts should NOT be present
        const hasController = scripts.some((s: any) => s.path === "macro-controller.js");
        const hasCombo = scripts.some((s: any) => s.path === "combo-switch.js");
        expect(hasController).toBe(false);
        expect(hasCombo).toBe(false);
    });

    it("default project has single config for macro-looping", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const defaultProject = projects.find((p: any) => p.id === "default-lovable");

        const configs = defaultProject.configs;
        const isConfigsPopulated = Array.isArray(configs) && configs.length === 1;
        expect(isConfigsPopulated).toBe(true);

        const hasLoopingConfig = configs.some((c: any) => c.path === "macro-looping-config.json");
        expect(hasLoopingConfig).toBe(true);

        // Legacy configs should NOT be present
        const hasControllerConfig = configs.some((c: any) => c.path === "macro-controller-config.json");
        const hasComboConfig = configs.some((c: any) => c.path === "combo-config.json");
        expect(hasControllerConfig).toBe(false);
        expect(hasComboConfig).toBe(false);
    });

    it("default project has cookie bindings for session and refresh tokens", async () => {
        await simulateInstall("install");

        const snapshot = getMockStoreSnapshot();
        const projects = snapshot["marco_projects"] as any[];
        const defaultProject = projects.find((p: any) => p.id === "default-lovable");

        const cookies = defaultProject.cookies;
        const hasCookies = Array.isArray(cookies) && cookies.length === 2;
        expect(hasCookies).toBe(true);

        const sessionCookie = cookies.find((c: any) => c.role === "session");
        const refreshCookie = cookies.find((c: any) => c.role === "refresh");
        expect(sessionCookie.cookieName).toBe("lovable-session-id.id");
        expect(refreshCookie.cookieName).toBe("lovable-session-id.refresh");
        expect(sessionCookie.url).toBe("https://lovable.dev");
    });
});
