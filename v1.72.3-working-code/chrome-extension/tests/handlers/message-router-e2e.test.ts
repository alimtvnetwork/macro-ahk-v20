/**
 * Integration test — Message Router End-to-End
 *
 * Tests the full message routing from handleMessage() through the
 * registry to actual handler functions, verifying real responses.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, setMockCookie } from "../mocks/chrome-storage";

installChromeMock();

// Must import after mock installation
const { handleMessage } = await import("../../src/background/message-router");
const { MessageType } = await import("../../src/shared/messages");
const { _resetAuthCacheForTest } = await import("../../src/background/handlers/config-auth-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Sends a message through the router and captures the response. */
async function routeMessage(message: unknown): Promise<unknown> {
    return new Promise((resolve) => {
        void handleMessage(
            message,
            { tab: { id: 1 } } as chrome.runtime.MessageSender,
            resolve,
        );
    });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Message Router — End-to-End Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        _resetAuthCacheForTest();
    });

    it("routes GET_STATUS and returns valid status object", async () => {
        const response = (await routeMessage({ type: MessageType.GET_STATUS })) as any;

        expect(response.version).toBeTruthy();
        expect(response.connection).toBeDefined();
        expect(response.token).toBeDefined();
        expect(response.config).toBeDefined();
        expect(response.loggingMode).toBeDefined();
    });

    it("routes GET_CONFIG and returns defaults", async () => {
        const response = (await routeMessage({ type: MessageType.GET_CONFIG })) as any;

        expect(response.config).toBeDefined();
        expect(response.config.logLevel).toBe("info");
        expect(response.source).toBe("hardcoded");
    });

    it("routes GET_TOKEN and returns null without cookie", async () => {
        const response = (await routeMessage({ type: MessageType.GET_TOKEN })) as any;

        expect(response.token).toBeNull();
    });

    it("routes GET_TOKEN with cookie and returns value", async () => {
        setMockCookie("lovable-session-id.id", "my-token-value");

        const response = (await routeMessage({ type: MessageType.GET_TOKEN })) as any;

        expect(response.token).toBe("my-token-value");
    });

    it("routes SAVE_PROJECT and creates project", async () => {
        const response = (await routeMessage({
            type: MessageType.SAVE_PROJECT,
            project: {
                name: "Test Project",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                scripts: [{ path: "test.js", order: 1 }],
            },
        })) as any;

        expect(response.isOk).toBe(true);
        expect(response.project.id).toBeTruthy();
        expect(response.project.name).toBe("Test Project");
    });

    it("routes GET_ALL_PROJECTS after save", async () => {
        await routeMessage({
            type: MessageType.SAVE_PROJECT,
            project: {
                name: "Project A",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [],
                scripts: [],
            },
        });

        const response = (await routeMessage({
            type: MessageType.GET_ALL_PROJECTS,
        })) as any;

        expect(response.projects.length).toBe(1);
    });

    it("routes SAVE_SCRIPT and creates script", async () => {
        const response = (await routeMessage({
            type: MessageType.SAVE_SCRIPT,
            script: {
                name: "my-script",
                code: "console.log('hello')",
                order: 1,
                isEnabled: true,
            },
        })) as any;

        expect(response.isOk).toBe(true);
        expect(response.script.name).toBe("my-script");
    });

    it("routes GET_ALL_SCRIPTS returns saved scripts", async () => {
        await routeMessage({
            type: MessageType.SAVE_SCRIPT,
            script: { name: "s1", code: "//1", order: 1, isEnabled: true },
        });
        await routeMessage({
            type: MessageType.SAVE_SCRIPT,
            script: { name: "s2", code: "//2", order: 2, isEnabled: true },
        });

        const response = (await routeMessage({
            type: MessageType.GET_ALL_SCRIPTS,
        })) as any;

        expect(response.scripts.length).toBe(2);
    });

    it("routes TOGGLE_SCRIPT disables a script", async () => {
        const saved = (await routeMessage({
            type: MessageType.SAVE_SCRIPT,
            script: { name: "toggleable", code: "//", order: 1, isEnabled: true },
        })) as any;

        const toggled = (await routeMessage({
            type: MessageType.TOGGLE_SCRIPT,
            id: saved.script.id,
        })) as any;

        expect(toggled.isOk).toBe(true);

        // Verify via GET_ALL_SCRIPTS
        const all = (await routeMessage({ type: MessageType.GET_ALL_SCRIPTS })) as any;
        expect(all.scripts[0].isEnabled).toBe(false);
    });

    it("routes SAVE_CONFIG and creates config", async () => {
        const response = (await routeMessage({
            type: MessageType.SAVE_CONFIG,
            config: { name: "my-config", json: '{"key":"val"}' },
        })) as any;

        expect(response.isOk).toBe(true);
        expect(response.config.json).toBe('{"key":"val"}');
    });

    it("routes unknown message type with error", async () => {
        const response = (await routeMessage({
            type: "COMPLETELY_UNKNOWN_TYPE",
        })) as any;

        expect(response.isOk).toBe(false);
        expect(response.errorMessage).toContain("Unknown message type");
    });

    it("routes broadcast types with isOk: true", async () => {
        const response = (await routeMessage({
            type: MessageType.INJECTION_RESULT,
        })) as any;

        expect(response.isOk).toBe(true);
    });

    it("routes DELETE_PROJECT removes project", async () => {
        const saved = (await routeMessage({
            type: MessageType.SAVE_PROJECT,
            project: {
                name: "Delete Me",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [],
                scripts: [],
            },
        })) as any;

        await routeMessage({
            type: MessageType.DELETE_PROJECT,
            projectId: saved.project.id,
        });

        const all = (await routeMessage({
            type: MessageType.GET_ALL_PROJECTS,
        })) as any;

        expect(all.projects.length).toBe(0);
    });

    it("full flow: create project + script + config → query all → delete all", async () => {
        // Create
        const proj = (await routeMessage({
            type: MessageType.SAVE_PROJECT,
            project: {
                name: "Full Flow",
                version: "1.0.0",
                schemaVersion: 1,
                targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
                scripts: [{ path: "main.js", order: 1 }],
            },
        })) as any;

        const script = (await routeMessage({
            type: MessageType.SAVE_SCRIPT,
            script: { name: "main.js", code: "alert(1)", order: 1, isEnabled: true },
        })) as any;

        const config = (await routeMessage({
            type: MessageType.SAVE_CONFIG,
            config: { name: "settings", json: '{}' },
        })) as any;

        // Query
        const projects = (await routeMessage({ type: MessageType.GET_ALL_PROJECTS })) as any;
        const scripts = (await routeMessage({ type: MessageType.GET_ALL_SCRIPTS })) as any;
        const configs = (await routeMessage({ type: MessageType.GET_ALL_CONFIGS })) as any;

        expect(projects.projects.length).toBe(1);
        expect(scripts.scripts.length).toBe(1);
        expect(configs.configs.length).toBe(1);

        // Delete all
        await routeMessage({ type: MessageType.DELETE_PROJECT, projectId: proj.project.id });
        await routeMessage({ type: MessageType.DELETE_SCRIPT, id: script.script.id });
        await routeMessage({ type: MessageType.DELETE_CONFIG, id: config.config.id });

        const emptyProjects = (await routeMessage({ type: MessageType.GET_ALL_PROJECTS })) as any;
        const emptyScripts = (await routeMessage({ type: MessageType.GET_ALL_SCRIPTS })) as any;
        const emptyConfigs = (await routeMessage({ type: MessageType.GET_ALL_CONFIGS })) as any;

        expect(emptyProjects.projects.length).toBe(0);
        expect(emptyScripts.scripts.length).toBe(0);
        expect(emptyConfigs.configs.length).toBe(0);
    });
});
