/**
 * Unit tests — Script & Config Handler CRUD
 *
 * Tests handleGetAllScripts, handleSaveScript, handleDeleteScript,
 * handleGetAllConfigs, handleSaveConfig, handleDeleteConfig,
 * handleGetScriptConfig against a mocked chrome.storage.local.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage } from "../mocks/chrome-storage";
import { MessageType } from "../../src/shared/messages";

installChromeMock();

const {
    handleGetAllScripts,
    handleSaveScript,
    handleDeleteScript,
    handleGetAllConfigs,
    handleSaveConfig,
    handleDeleteConfig,
    handleGetScriptConfig,
} = await import("../../src/background/handlers/script-config-handler");

/** Builds a minimal test script. */
function testScript(overrides: Record<string, unknown> = {}) {
    return {
        name: "Test Script",
        code: "console.log('hello')",
        order: 0,
        ...overrides,
    };
}

/** Builds a minimal test config. */
function testConfig(overrides: Record<string, unknown> = {}) {
    return {
        name: "Test Config",
        json: '{"key": "value"}',
        ...overrides,
    };
}

describe("Script Handler", () => {
    beforeEach(() => {
        resetMockStorage();
    });

    it("returns empty array when no scripts exist", async () => {
        const result = await handleGetAllScripts();
        expect(result.scripts).toEqual([]);
    });

    it("creates a script with auto-generated id", async () => {
        const result = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript(),
        } as any);

        expect(result.isOk).toBe(true);
        expect(result.script.id).toBeTruthy();
        expect(result.script.createdAt).toBeTruthy();
        expect(result.script.name).toBe("Test Script");
    });

    it("persists and retrieves scripts", async () => {
        await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript(),
        } as any);

        const result = await handleGetAllScripts();
        expect(result.scripts).toHaveLength(1);
    });

    it("updates existing script by id", async () => {
        const created = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript(),
        } as any);

        const updated = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript({ id: created.script.id, name: "Updated Script" }),
        } as any);

        expect(updated.script.name).toBe("Updated Script");
        const all = await handleGetAllScripts();
        expect(all.scripts).toHaveLength(1);
    });

    it("deletes a script by id", async () => {
        const created = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript(),
        } as any);

        await handleDeleteScript({
            type: MessageType.DELETE_SCRIPT,
            id: created.script.id,
        } as any);

        const all = await handleGetAllScripts();
        expect(all.scripts).toHaveLength(0);
    });
});

describe("Config Handler", () => {
    beforeEach(() => {
        resetMockStorage();
    });

    it("returns empty array when no configs exist", async () => {
        const result = await handleGetAllConfigs();
        expect(result.configs).toEqual([]);
    });

    it("creates a config with auto-generated id", async () => {
        const result = await handleSaveConfig({
            type: MessageType.SAVE_CONFIG,
            config: testConfig(),
        } as any);

        expect(result.isOk).toBe(true);
        expect(result.config.id).toBeTruthy();
        expect(result.config.name).toBe("Test Config");
    });

    it("updates existing config by id", async () => {
        const created = await handleSaveConfig({
            type: MessageType.SAVE_CONFIG,
            config: testConfig(),
        } as any);

        const updated = await handleSaveConfig({
            type: MessageType.SAVE_CONFIG,
            config: testConfig({ id: created.config.id, name: "Updated Config" }),
        } as any);

        expect(updated.config.name).toBe("Updated Config");
        const all = await handleGetAllConfigs();
        expect(all.configs).toHaveLength(1);
    });

    it("deletes a config by id", async () => {
        const created = await handleSaveConfig({
            type: MessageType.SAVE_CONFIG,
            config: testConfig(),
        } as any);

        await handleDeleteConfig({
            type: MessageType.DELETE_CONFIG,
            id: created.config.id,
        } as any);

        const all = await handleGetAllConfigs();
        expect(all.configs).toHaveLength(0);
    });
});

describe("Script-Config Binding", () => {
    beforeEach(() => {
        resetMockStorage();
    });

    it("returns null when script has no config binding", async () => {
        const created = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript(),
        } as any);

        const result = await handleGetScriptConfig({
            type: MessageType.GET_SCRIPT_CONFIG,
            scriptId: created.script.id,
        } as any);

        expect(result.config).toBeNull();
    });

    it("resolves bound config for a script", async () => {
        const config = await handleSaveConfig({
            type: MessageType.SAVE_CONFIG,
            config: testConfig(),
        } as any);

        const script = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript({ configBinding: config.config.id }),
        } as any);

        const result = await handleGetScriptConfig({
            type: MessageType.GET_SCRIPT_CONFIG,
            scriptId: script.script.id,
        } as any);

        expect(result.config).not.toBeNull();
        expect(result.config!.name).toBe("Test Config");
    });

    it("returns null when bound config id does not exist", async () => {
        const script = await handleSaveScript({
            type: MessageType.SAVE_SCRIPT,
            script: testScript({ configBinding: "nonexistent-id" }),
        } as any);

        const result = await handleGetScriptConfig({
            type: MessageType.GET_SCRIPT_CONFIG,
            scriptId: script.script.id,
        } as any);

        expect(result.config).toBeNull();
    });
});
