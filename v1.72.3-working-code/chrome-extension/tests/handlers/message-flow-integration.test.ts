/**
 * Integration tests — Full Message Flow
 *
 * Sends messages through handleMessage (the router entry point)
 * and verifies the complete round-trip response for every handler
 * domain that does NOT require a DbManager (SQLite) binding.
 *
 * Domains covered:
 *   - Config & Auth (GET_CONFIG, GET_TOKEN, REFRESH_TOKEN)
 *   - Projects (CRUD, duplicate, import, export, active project)
 *   - Scripts & Configs (CRUD, configBinding resolution)
 *   - Network status
 *   - Status & Health
 *   - XPath recorder
 *   - Injection
 *   - Broadcast types
 *   - Unknown types & error handling
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockCookie,
    setMockTabs,
    getScriptingCalls,
    getMockStoreSnapshot,
    getMockSessionSnapshot,
} from "../mocks/chrome-storage";

installChromeMock();

const { handleMessage } = await import("../../src/background/message-router");
const { _resetAuthCacheForTest } = await import("../../src/background/handlers/config-auth-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Sends a message through the router and returns the response. */
async function send(
    message: Record<string, unknown>,
    sender: Partial<chrome.runtime.MessageSender> = {},
): Promise<any> {
    let response: unknown = null;
    await handleMessage(
        message,
        sender as chrome.runtime.MessageSender,
        (r: unknown) => { response = r; },
    );
    return response;
}

const tabSender = { tab: { id: 42 } } as chrome.runtime.MessageSender;
const emptySender = {} as chrome.runtime.MessageSender;

/* ------------------------------------------------------------------ */
/*  Config & Auth — full flow                                          */
/* ------------------------------------------------------------------ */

describe("Integration: Config & Auth flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();
    });

    it("GET_CONFIG returns default config with hardcoded source", async () => {
        const res = await send({ type: "GET_CONFIG" });

        expect(res.config).toBeDefined();
        expect(res.source).toBe("hardcoded");
        expect(res.config.logLevel).toBe("info");
        expect(res.config.maxRetries).toBe(3);
    });

    it("GET_CONFIG returns local source when overrides exist", async () => {
        await chrome.storage.local.set({
            marco_config_overrides: { logLevel: "debug" },
        });

        const res = await send({ type: "GET_CONFIG" });

        expect(res.source).toBe("local");
        expect(res.config.logLevel).toBe("debug");
        // defaults still present
        expect(res.config.maxRetries).toBe(3);
    });

    it("GET_TOKEN returns null when no cookie exists", async () => {
        const res = await send({ type: "GET_TOKEN" });
        expect(res.token).toBeNull();
    });

    it("GET_TOKEN returns token from cookie", async () => {
        setMockCookie("lovable-session-id.id", "my-jwt-token");

        const res = await send({ type: "GET_TOKEN" });
        expect(res.token).toBe("my-jwt-token");
    });

    it("REFRESH_TOKEN forces re-read of cookie", async () => {
        // First call caches null
        await send({ type: "GET_TOKEN" });

        // Set cookie after initial read
        setMockCookie("lovable-session-id.id", "fresh-token");

        // GET_TOKEN would return cached null, REFRESH_TOKEN re-reads
        const res = await send({ type: "REFRESH_TOKEN" });
        expect(res.sessionId).toBe("fresh-token");
    });
});

/* ------------------------------------------------------------------ */
/*  Projects — full CRUD flow                                          */
/* ------------------------------------------------------------------ */

describe("Integration: Project CRUD flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("full project lifecycle: create → read → update → delete", async () => {
        // Create
        const createRes = await send({
            type: "SAVE_PROJECT",
            project: { name: "Integration Test", version: "1.0.0", schemaVersion: 1, targetUrls: [], scripts: [] },
        });
        expect(createRes.isOk).toBe(true);
        const projectId = createRes.project.id;
        expect(projectId).toBeTruthy();

        // Read all
        const listRes = await send({ type: "GET_ALL_PROJECTS" });
        expect(listRes.projects).toHaveLength(1);
        expect(listRes.projects[0].name).toBe("Integration Test");

        // Update
        const updateRes = await send({
            type: "SAVE_PROJECT",
            project: { ...createRes.project, name: "Updated Name" },
        });
        expect(updateRes.project.name).toBe("Updated Name");

        // Verify only one project
        const listRes2 = await send({ type: "GET_ALL_PROJECTS" });
        expect(listRes2.projects).toHaveLength(1);

        // Delete
        const deleteRes = await send({ type: "DELETE_PROJECT", projectId });
        expect(deleteRes.isOk).toBe(true);

        // Verify empty
        const listRes3 = await send({ type: "GET_ALL_PROJECTS" });
        expect(listRes3.projects).toHaveLength(0);
    });

    it("active project lifecycle: set → get → delete clears", async () => {
        const createRes = await send({
            type: "SAVE_PROJECT",
            project: { name: "Active Test", version: "1.0.0", schemaVersion: 1, targetUrls: [], scripts: [] },
        });

        // Set active
        await send(
            { type: "SET_ACTIVE_PROJECT", projectId: createRes.project.id },
            tabSender,
        );

        // Get active
        const activeRes = await send({ type: "GET_ACTIVE_PROJECT" }, tabSender);
        expect(activeRes.activeProject).not.toBeNull();
        expect(activeRes.activeProject.id).toBe(createRes.project.id);
        expect(activeRes.allProjects).toHaveLength(1);

        // Delete active project clears it
        await send({ type: "DELETE_PROJECT", projectId: createRes.project.id });

        const activeRes2 = await send({ type: "GET_ACTIVE_PROJECT" }, tabSender);
        expect(activeRes2.activeProject).toBeNull();
    });

    it("duplicate project flow", async () => {
        const createRes = await send({
            type: "SAVE_PROJECT",
            project: {
                name: "Original",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                scripts: [{ path: "main.js", order: 1, runAt: "document_idle" }],
            },
        });

        const dupRes = await send({
            type: "DUPLICATE_PROJECT",
            projectId: createRes.project.id,
        });

        expect(dupRes.project).not.toBeNull();
        expect(dupRes.project.id).not.toBe(createRes.project.id);
        expect(dupRes.project.name).toBe("Original (Copy)");
        expect(dupRes.project.targetUrls).toHaveLength(1);
        expect(dupRes.project.scripts).toHaveLength(1);

        const listRes = await send({ type: "GET_ALL_PROJECTS" });
        expect(listRes.projects).toHaveLength(2);
    });

    it("export → import round-trip through router", async () => {
        const createRes = await send({
            type: "SAVE_PROJECT",
            project: {
                name: "Exportable",
                version: "2.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://test.com", matchType: "exact" }],
                scripts: [],
            },
        });

        // Export
        const exportRes = await send({
            type: "EXPORT_PROJECT",
            projectId: createRes.project.id,
        });
        expect(exportRes.filename).toBe("marco-exportable.json");
        const parsed = JSON.parse(exportRes.json);
        expect(parsed.name).toBe("Exportable");

        // Clear storage
        resetMockStorage();
        installChromeMock();

        // Import
        const importRes = await send({
            type: "IMPORT_PROJECT",
            json: exportRes.json,
        });
        expect(importRes.project.name).toBe("Exportable");
        expect(importRes.project.id).not.toBe(createRes.project.id);

        const listRes = await send({ type: "GET_ALL_PROJECTS" });
        expect(listRes.projects).toHaveLength(1);
    });
});

/* ------------------------------------------------------------------ */
/*  Scripts & Configs — full CRUD flow                                 */
/* ------------------------------------------------------------------ */

describe("Integration: Script & Config CRUD flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("script lifecycle: create → list → update → delete", async () => {
        // Create
        const saveRes = await send({
            type: "SAVE_SCRIPT",
            script: { name: "init.js", code: "console.log('hi')", order: 1 },
        });
        expect(saveRes.isOk).toBe(true);
        const scriptId = saveRes.script.id;

        // List
        const listRes = await send({ type: "GET_ALL_SCRIPTS" });
        expect(listRes.scripts).toHaveLength(1);

        // Update
        const updateRes = await send({
            type: "SAVE_SCRIPT",
            script: { ...saveRes.script, name: "init-v2.js" },
        });
        expect(updateRes.script.name).toBe("init-v2.js");

        const listRes2 = await send({ type: "GET_ALL_SCRIPTS" });
        expect(listRes2.scripts).toHaveLength(1);

        // Delete
        const delRes = await send({ type: "DELETE_SCRIPT", id: scriptId });
        expect(delRes.isOk).toBe(true);

        const listRes3 = await send({ type: "GET_ALL_SCRIPTS" });
        expect(listRes3.scripts).toHaveLength(0);
    });

    it("config lifecycle: create → list → update → delete", async () => {
        const saveRes = await send({
            type: "SAVE_CONFIG",
            config: { name: "settings.json", json: '{"key":"value"}' },
        });
        expect(saveRes.isOk).toBe(true);
        const configId = saveRes.config.id;

        const listRes = await send({ type: "GET_ALL_CONFIGS" });
        expect(listRes.configs).toHaveLength(1);

        const delRes = await send({ type: "DELETE_CONFIG", id: configId });
        expect(delRes.isOk).toBe(true);

        const listRes2 = await send({ type: "GET_ALL_CONFIGS" });
        expect(listRes2.configs).toHaveLength(0);
    });

    it("GET_SCRIPT_CONFIG resolves bound config", async () => {
        // Create config
        const cfgRes = await send({
            type: "SAVE_CONFIG",
            config: { name: "app-config.json", json: '{"env":"prod"}' },
        });

        // Create script with configBinding
        const scriptRes = await send({
            type: "SAVE_SCRIPT",
            script: { name: "main.js", code: "run()", order: 1, configBinding: cfgRes.config.id },
        });

        // Resolve binding
        const resolveRes = await send({
            type: "GET_SCRIPT_CONFIG",
            scriptId: scriptRes.script.id,
        });

        expect(resolveRes.config).not.toBeNull();
        expect(resolveRes.config.name).toBe("app-config.json");
    });

    it("GET_SCRIPT_CONFIG returns null for unbound script", async () => {
        const scriptRes = await send({
            type: "SAVE_SCRIPT",
            script: { name: "standalone.js", code: "solo()", order: 1 },
        });

        const resolveRes = await send({
            type: "GET_SCRIPT_CONFIG",
            scriptId: scriptRes.script.id,
        });

        expect(resolveRes.config).toBeNull();
    });

    it("GET_SCRIPT_CONFIG returns null for nonexistent script", async () => {
        const resolveRes = await send({
            type: "GET_SCRIPT_CONFIG",
            scriptId: "ghost-script",
        });

        expect(resolveRes.config).toBeNull();
    });
});

/* ------------------------------------------------------------------ */
/*  Network Status                                                     */
/* ------------------------------------------------------------------ */

describe("Integration: Network status flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("NETWORK_STATUS online persists to session storage", async () => {
        const res = await send({ type: "NETWORK_STATUS", isOnline: true });

        expect(res.isOk).toBe(true);
        const session = getMockSessionSnapshot();
        expect(session["marco_network_online"]).toBe(true);
    });

    it("NETWORK_STATUS offline persists to session storage", async () => {
        const res = await send({ type: "NETWORK_STATUS", isOnline: false });

        expect(res.isOk).toBe(true);
        const session = getMockSessionSnapshot();
        expect(session["marco_network_online"]).toBe(false);
    });

    it("NETWORK_STATUS toggles correctly", async () => {
        await send({ type: "NETWORK_STATUS", isOnline: true });
        await send({ type: "NETWORK_STATUS", isOnline: false });

        const session = getMockSessionSnapshot();
        expect(session["marco_network_online"]).toBe(false);

        await send({ type: "NETWORK_STATUS", isOnline: true });

        const session2 = getMockSessionSnapshot();
        expect(session2["marco_network_online"]).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Status & Health                                                    */
/* ------------------------------------------------------------------ */

describe("Integration: Status & Health flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();
    });

    it("GET_STATUS returns complete status response shape", async () => {
        const res = await send({ type: "GET_STATUS" });

        expect(res.version).toBeDefined();
        expect(res.connection).toBeDefined();
        expect(res.token).toBeDefined();
        expect(res.token.status).toBeDefined();
        expect(res.config).toBeDefined();
        expect(res.config.status).toBeDefined();
        expect(res.loggingMode).toBeDefined();
    });

    it("GET_STATUS reflects token from cookie", async () => {
        setMockCookie("lovable-session-id.id", "test-jwt", Date.now() / 1000 + 3600);

        const res = await send({ type: "GET_STATUS" });
        expect(res.token.status).toBe("valid");
    });

    it("GET_STATUS reports missing token when no cookie", async () => {
        const res = await send({ type: "GET_STATUS" });
        expect(res.token.status).toBe("missing");
    });

    it("GET_HEALTH_STATUS returns healthy with working storage", async () => {
        const res = await send({ type: "GET_HEALTH_STATUS" });

        expect(res.state).toBe("HEALTHY");
        expect(Array.isArray(res.details)).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  XPath Recorder                                                     */
/* ------------------------------------------------------------------ */

describe("Integration: XPath recorder flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        setMockTabs([{ id: 42, url: "https://example.com" }]);
    });

    it("GET_RECORDED_XPATHS returns empty initially", async () => {
        const res = await send({ type: "GET_RECORDED_XPATHS" }, tabSender);

        expect(res.recorded).toEqual([]);
        expect(res.isRecording).toBe(false);
    });

    it("CLEAR_RECORDED_XPATHS returns isOk", async () => {
        const res = await send({ type: "CLEAR_RECORDED_XPATHS" }, tabSender);
        expect(res.isOk).toBe(true);
    });

    it("TOGGLE_XPATH_RECORDER returns recording state", async () => {
        const res = await send({ type: "TOGGLE_XPATH_RECORDER" }, tabSender);

        expect(typeof res.isRecording).toBe("boolean");
    });

    it("TEST_XPATH returns found count", async () => {
        const res = await send({ type: "TEST_XPATH", xpath: "//div" });

        expect(typeof res.found).toBe("number");
    });
});

/* ------------------------------------------------------------------ */
/*  Injection                                                          */
/* ------------------------------------------------------------------ */

describe("Integration: Injection flow", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("INJECT_SCRIPTS returns results array", async () => {
        const res = await send({
            type: "INJECT_SCRIPTS",
            tabId: 1,
            scripts: [
                { id: "s1", code: "console.log(1)", order: 1, name: "test.js" },
            ],
        });

        expect(res.results).toBeDefined();
        expect(Array.isArray(res.results)).toBe(true);
    });

    it("GET_TAB_INJECTIONS returns injections map", async () => {
        const res = await send({ type: "GET_TAB_INJECTIONS", tabId: 99 });

        expect(res.injections).toBeDefined();
        expect(typeof res.injections).toBe("object");
    });

    it("injection then query shows recorded state", async () => {
        await send({
            type: "INJECT_SCRIPTS",
            tabId: 7,
            scripts: [
                { id: "script-a", code: "void 0", order: 1, name: "a.js" },
                { id: "script-b", code: "void 0", order: 2, name: "b.js" },
            ],
        });

        const res = await send({ type: "GET_TAB_INJECTIONS", tabId: 7 });
        const tabInjection = res.injections[7];

        expect(tabInjection).not.toBeNull();
        expect(tabInjection.scriptIds).toContain("script-a");
        expect(tabInjection.scriptIds).toContain("script-b");
    });
});

/* ------------------------------------------------------------------ */
/*  Broadcast Types                                                    */
/* ------------------------------------------------------------------ */

describe("Integration: Broadcast types", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    const broadcastTypes = [
        "INJECTION_RESULT",
        "LOGGING_DEGRADED",
        "STORAGE_FULL",
        "CONFIG_UPDATED",
        "TOKEN_EXPIRED",
        "TOKEN_UPDATED",
    ];

    for (const type of broadcastTypes) {
        it(`${type} returns { isOk: true }`, async () => {
            const res = await send({ type });
            expect(res).toEqual({ isOk: true });
        });
    }
});

/* ------------------------------------------------------------------ */
/*  Error Handling & Unknown Types                                     */
/* ------------------------------------------------------------------ */

describe("Integration: Error handling", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("unknown type returns isOk: false with error message", async () => {
        const res = await send({ type: "TOTALLY_FAKE_MESSAGE" });

        expect(res.isOk).toBe(false);
        expect(res.errorMessage).toContain("Unknown message type");
    });

    it("empty type returns error", async () => {
        const res = await send({ type: "" });

        expect(res.isOk).toBe(false);
        expect(res.errorMessage).toContain("Unknown message type");
    });

    it("multiple sequential messages don't interfere", async () => {
        const [statusRes, healthRes, projectsRes, scriptsRes, configsRes] = await Promise.all([
            send({ type: "GET_STATUS" }),
            send({ type: "GET_HEALTH_STATUS" }),
            send({ type: "GET_ALL_PROJECTS" }),
            send({ type: "GET_ALL_SCRIPTS" }),
            send({ type: "GET_ALL_CONFIGS" }),
        ]);

        expect(statusRes.version).toBeDefined();
        expect(healthRes.state).toBeDefined();
        expect(Array.isArray(projectsRes.projects)).toBe(true);
        expect(Array.isArray(scriptsRes.scripts)).toBe(true);
        expect(Array.isArray(configsRes.configs)).toBe(true);
    });
});

/* ------------------------------------------------------------------ */
/*  Cross-Domain Integration                                           */
/* ------------------------------------------------------------------ */

describe("Integration: Cross-domain workflows", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("project + script + config end-to-end", async () => {
        // Create a config
        const cfgRes = await send({
            type: "SAVE_CONFIG",
            config: { name: "env.json", json: '{"api":"https://api.example.com"}' },
        });

        // Create a script bound to that config
        const scriptRes = await send({
            type: "SAVE_SCRIPT",
            script: {
                name: "api-client.js",
                code: "fetch(config.api)",
                order: 1,
                configBinding: cfgRes.config.id,
            },
        });

        // Create a project referencing both
        const projectRes = await send({
            type: "SAVE_PROJECT",
            project: {
                name: "API Project",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://app.example.com/*", matchType: "glob" }],
                scripts: [{ path: scriptRes.script.name, order: 1, configBinding: cfgRes.config.id }],
            },
        });

        // Set as active
        await send(
            { type: "SET_ACTIVE_PROJECT", projectId: projectRes.project.id },
            tabSender,
        );

        // Verify the config resolves for the script
        const resolvedCfg = await send({
            type: "GET_SCRIPT_CONFIG",
            scriptId: scriptRes.script.id,
        });
        expect(resolvedCfg.config.json).toBe('{"api":"https://api.example.com"}');

        // Verify active project is set
        const activeRes = await send({ type: "GET_ACTIVE_PROJECT" }, tabSender);
        expect(activeRes.activeProject.name).toBe("API Project");

        // Verify status is still healthy
        const healthRes = await send({ type: "GET_HEALTH_STATUS" });
        expect(healthRes.state).toBe("HEALTHY");
    });

    it("concurrent operations on different domains", async () => {
        // Fire multiple domain operations in parallel
        const results = await Promise.all([
            send({ type: "SAVE_PROJECT", project: { name: "P1", version: "1.0.0", schemaVersion: 1, targetUrls: [], scripts: [] } }),
            send({ type: "SAVE_SCRIPT", script: { name: "s1.js", code: "1", order: 1 } }),
            send({ type: "SAVE_CONFIG", config: { name: "c1.json", json: "{}" } }),
            send({ type: "NETWORK_STATUS", isOnline: true }),
            send({ type: "GET_STATUS" }),
        ]);

        expect(results[0].isOk).toBe(true); // project
        expect(results[1].isOk).toBe(true); // script
        expect(results[2].isOk).toBe(true); // config
        expect(results[3].isOk).toBe(true); // network
        expect(results[4].version).toBeDefined(); // status

        // All data persisted
        const projects = await send({ type: "GET_ALL_PROJECTS" });
        const scripts = await send({ type: "GET_ALL_SCRIPTS" });
        const configs = await send({ type: "GET_ALL_CONFIGS" });

        expect(projects.projects).toHaveLength(1);
        expect(scripts.scripts).toHaveLength(1);
        expect(configs.configs).toHaveLength(1);
    });
});
