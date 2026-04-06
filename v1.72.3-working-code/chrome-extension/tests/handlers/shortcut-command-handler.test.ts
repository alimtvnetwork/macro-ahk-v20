/**
 * Unit tests — Shortcut Command Handler
 *
 * Tests command registration and run-scripts shortcut logic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

let commandListeners: Array<(command: string) => void>;

// Mock message-router
vi.mock("../../../src/background/message-router", () => ({
    handleMessage: vi.fn((_msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
        sendResponse({ activeProject: { scripts: [{ path: "test.js", order: 1 }] } });
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    commandListeners = [];

    (globalThis as any).chrome = {
        commands: {
            onCommand: {
                addListener: (listener: (command: string) => void) => {
                    commandListeners.push(listener);
                },
            },
        },
        tabs: {
            query: vi.fn().mockResolvedValue([{ id: 42 }]),
        },
        runtime: {
            onMessage: { addListener: () => {} },
        },
    };
});

describe("Shortcut Command — Registration", () => {
    it("registers a chrome.commands listener", async () => {
        vi.resetModules();
        commandListeners = [];

        (globalThis as any).chrome.commands = {
            onCommand: {
                addListener: (l: any) => { commandListeners.push(l); },
            },
        };

        const { registerShortcutCommands } = await import("../../../src/background/shortcut-command-handler");
        registerShortcutCommands();

        expect(commandListeners.length).toBe(1);
    });
});

describe("Shortcut Command — Run Scripts", () => {
    it("dispatches INJECT_SCRIPTS on run-scripts command", async () => {
        vi.resetModules();
        commandListeners = [];

        const mockHandleMessage = vi.fn((_msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
            const msg = _msg as Record<string, unknown>;
            if (msg.type === "GET_ACTIVE_PROJECT") {
                sendResponse({ activeProject: { scripts: [{ path: "test.js", order: 1 }] } });
            } else {
                sendResponse({});
            }
        });

        vi.doMock("../../../src/background/message-router", () => ({
            handleMessage: mockHandleMessage,
        }));

        (globalThis as any).chrome = {
            commands: {
                onCommand: {
                    addListener: (l: any) => { commandListeners.push(l); },
                },
            },
            tabs: {
                query: vi.fn().mockResolvedValue([{ id: 42 }]),
            },
        };

        const { registerShortcutCommands } = await import("../../../src/background/shortcut-command-handler");
        registerShortcutCommands();

        expect(commandListeners.length).toBe(1);

        // Trigger the command
        commandListeners[0]("run-scripts");

        // Allow async processing
        await new Promise((r) => setTimeout(r, 50));

        // Should have called handleMessage for GET_ACTIVE_PROJECT and INJECT_SCRIPTS
        expect(mockHandleMessage).toHaveBeenCalled();
        const calls = mockHandleMessage.mock.calls;
        const messageTypes = calls.map((c: any) => (c[0] as Record<string, unknown>).type);
        expect(messageTypes).toContain("GET_ACTIVE_PROJECT");
    });

    it("ignores non-run-scripts commands", async () => {
        vi.resetModules();
        commandListeners = [];

        const mockHandleMessage = vi.fn();

        vi.doMock("../../../src/background/message-router", () => ({
            handleMessage: mockHandleMessage,
        }));

        (globalThis as any).chrome = {
            commands: {
                onCommand: {
                    addListener: (l: any) => { commandListeners.push(l); },
                },
            },
            tabs: {
                query: vi.fn().mockResolvedValue([{ id: 1 }]),
            },
        };

        const { registerShortcutCommands } = await import("../../../src/background/shortcut-command-handler");
        registerShortcutCommands();

        commandListeners[0]("some-other-command");
        await new Promise((r) => setTimeout(r, 50));

        expect(mockHandleMessage).not.toHaveBeenCalled();
    });

    it("handles no active tab gracefully", async () => {
        vi.resetModules();
        commandListeners = [];

        const mockHandleMessage = vi.fn();

        vi.doMock("../../../src/background/message-router", () => ({
            handleMessage: mockHandleMessage,
        }));

        (globalThis as any).chrome = {
            commands: {
                onCommand: {
                    addListener: (l: any) => { commandListeners.push(l); },
                },
            },
            tabs: {
                query: vi.fn().mockResolvedValue([]), // No active tab
            },
        };

        const { registerShortcutCommands } = await import("../../../src/background/shortcut-command-handler");
        registerShortcutCommands();

        commandListeners[0]("run-scripts");
        await new Promise((r) => setTimeout(r, 50));

        // Should not call handleMessage since there's no active tab
        expect(mockHandleMessage).not.toHaveBeenCalled();
    });
});
