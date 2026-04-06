/**
 * Integration test — Script & Config Lifecycle
 *
 * Tests the full CRUD lifecycle for scripts and configs,
 * including enable/disable toggle and config binding.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";

installChromeMock();

const {
    handleSaveScript,
    handleGetAllScripts,
    handleDeleteScript,
    handleToggleScript,
    handleSaveConfig,
    handleGetAllConfigs,
    handleDeleteConfig,
    handleGetScriptConfig,
} = await import("../../src/background/handlers/script-config-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildTestScript(name: string, code: string = "console.log('hello')") {
    return {
        type: "SAVE_SCRIPT",
        script: {
            name,
            code,
            order: 1,
            isEnabled: true,
            runAt: "document_idle",
        },
    };
}

function buildTestConfig(name: string, json: string = '{"key":"value"}') {
    return {
        type: "SAVE_CONFIG",
        config: { name, json },
    };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Script & Config Lifecycle — Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("creates a script with generated ID", async () => {
        const result = await handleSaveScript(buildTestScript("test-script") as any);

        expect(result.isOk).toBe(true);
        expect(result.script.id).toBeTruthy();
        expect(result.script.name).toBe("test-script");
        expect(result.script.isEnabled).toBe(true);
    });

    it("reads all scripts after creating multiple", async () => {
        await handleSaveScript(buildTestScript("script-1") as any);
        await handleSaveScript(buildTestScript("script-2") as any);

        const result = await handleGetAllScripts();

        expect(result.scripts.length).toBe(2);
    });

    it("toggles script enabled state", async () => {
        const created = await handleSaveScript(buildTestScript("toggle-me") as any);
        expect(created.script.isEnabled).toBe(true);

        await handleToggleScript({ id: created.script.id } as any);
        const afterToggle = await handleGetAllScripts();
        expect(afterToggle.scripts[0].isEnabled).toBe(false);

        await handleToggleScript({ id: created.script.id } as any);
        const afterToggleBack = await handleGetAllScripts();
        expect(afterToggleBack.scripts[0].isEnabled).toBe(true);
    });

    it("deletes a script", async () => {
        const created = await handleSaveScript(buildTestScript("delete-me") as any);
        await handleDeleteScript({ id: created.script.id } as any);

        const all = await handleGetAllScripts();
        expect(all.scripts.length).toBe(0);
    });

    it("creates a config with generated ID", async () => {
        const result = await handleSaveConfig(buildTestConfig("my-config") as any);

        expect(result.isOk).toBe(true);
        expect(result.config.id).toBeTruthy();
        expect(result.config.json).toBe('{"key":"value"}');
    });

    it("reads all configs", async () => {
        await handleSaveConfig(buildTestConfig("config-1") as any);
        await handleSaveConfig(buildTestConfig("config-2") as any);

        const result = await handleGetAllConfigs();
        expect(result.configs.length).toBe(2);
    });

    it("deletes a config", async () => {
        const created = await handleSaveConfig(buildTestConfig("delete-config") as any);
        await handleDeleteConfig({ id: created.config.id } as any);

        const all = await handleGetAllConfigs();
        expect(all.configs.length).toBe(0);
    });

    it("resolves script config binding", async () => {
        const config = await handleSaveConfig(buildTestConfig("bound-config") as any);

        const script = await handleSaveScript({
            type: "SAVE_SCRIPT",
            script: {
                name: "bound-script",
                code: "console.log('bound')",
                order: 1,
                isEnabled: true,
                configBinding: config.config.id,
            },
        } as any);

        const result = await handleGetScriptConfig({
            scriptId: script.script.id,
        } as any);

        expect(result.config).not.toBeNull();
        expect(result.config!.json).toBe('{"key":"value"}');
    });

    it("full lifecycle: create script + config → bind → toggle → delete", async () => {
        const script = await handleSaveScript(buildTestScript("lifecycle-script") as any);
        const config = await handleSaveConfig(buildTestConfig("lifecycle-config") as any);

        // Bind config to script
        await handleSaveScript({
            type: "SAVE_SCRIPT",
            script: { ...script.script, configBinding: config.config.id },
        } as any);

        // Toggle disable
        await handleToggleScript({ id: script.script.id } as any);
        const afterToggle = await handleGetAllScripts();
        expect(afterToggle.scripts[0].isEnabled).toBe(false);

        // Delete both
        await handleDeleteScript({ id: script.script.id } as any);
        await handleDeleteConfig({ id: config.config.id } as any);

        const scripts = await handleGetAllScripts();
        const configs = await handleGetAllConfigs();
        expect(scripts.scripts.length).toBe(0);
        expect(configs.configs.length).toBe(0);
    });
});
