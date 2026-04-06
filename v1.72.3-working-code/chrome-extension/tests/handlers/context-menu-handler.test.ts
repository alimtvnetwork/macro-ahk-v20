/**
 * Unit tests — Context Menu Handler
 *
 * Tests menu registration, click dispatch, and project submenu logic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock message-router before importing
vi.mock("../../src/background/message-router", () => ({
    handleMessage: vi.fn((_msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
        sendResponse(null);
    }),
}));

// Mock chrome APIs
let contextMenuItems: Map<string, any>;
let clickListeners: Array<(info: any, tab?: any) => void>;
let messageListeners: Array<(msg: any) => void>;
let removeAllCallback: (() => void) | null;

beforeEach(() => {
    vi.clearAllMocks();
    contextMenuItems = new Map();
    clickListeners = [];
    messageListeners = [];
    removeAllCallback = null;

    (globalThis as any).chrome = {
        contextMenus: {
            create: (props: any) => {
                contextMenuItems.set(props.id, props);
            },
            remove: (id: string) => {
                contextMenuItems.delete(id);
            },
            removeAll: (cb?: () => void) => {
                contextMenuItems.clear();
                if (cb) cb();
            },
            onClicked: {
                addListener: (listener: any) => {
                    clickListeners.push(listener);
                },
            },
        },
        runtime: {
            onMessage: {
                addListener: (listener: any) => {
                    messageListeners.push(listener);
                },
            },
        },
        scripting: {
            executeScript: vi.fn().mockResolvedValue([{ result: null }]),
        },
        tabs: {
            query: vi.fn().mockResolvedValue([{ id: 1 }]),
        },
    };
});

describe("Context Menu — Registration", () => {
    it("registers click listener and message listener", async () => {
        const { registerContextMenu } = await import("../../src/background/context-menu-handler");

        registerContextMenu();

        expect(clickListeners.length).toBeGreaterThanOrEqual(1);
        expect(messageListeners.length).toBeGreaterThanOrEqual(1);
    });

    it("creates static menu items after removeAll", async () => {
        vi.resetModules();

        // Re-setup mocks after resetModules
        contextMenuItems = new Map();
        clickListeners = [];
        messageListeners = [];

        (globalThis as any).chrome = {
            contextMenus: {
                create: (props: any) => { contextMenuItems.set(props.id, props); },
                remove: vi.fn(),
                removeAll: (cb?: () => void) => {
                    contextMenuItems.clear();
                    if (cb) cb();
                },
                onClicked: { addListener: (l: any) => { clickListeners.push(l); } },
            },
            runtime: {
                onMessage: { addListener: (l: any) => { messageListeners.push(l); } },
            },
            scripting: { executeScript: vi.fn().mockResolvedValue([{ result: null }]) },
            tabs: { query: vi.fn().mockResolvedValue([]) },
        };

        // Re-mock message-router for the new module instance
        vi.doMock("../../src/background/message-router", () => ({
            handleMessage: vi.fn((_msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
                sendResponse({ activeProject: null, allProjects: [] });
            }),
        }));

        const { registerContextMenu } = await import("../../src/background/context-menu-handler");
        registerContextMenu();

        // Should have root, project parent, separators, run, reinject, copy, export, status
        expect(contextMenuItems.size).toBeGreaterThanOrEqual(8);
        expect(contextMenuItems.has("marco-root")).toBe(true);
        expect(contextMenuItems.has("marco-run")).toBe(true);
        expect(contextMenuItems.has("marco-reinject")).toBe(true);
        expect(contextMenuItems.has("marco-copy-logs")).toBe(true);
        expect(contextMenuItems.has("marco-export-logs")).toBe(true);
        expect(contextMenuItems.has("marco-status")).toBe(true);
    });
});

describe("Context Menu — Menu IDs", () => {
    it("uses marco- prefix for all menu IDs", async () => {
        vi.resetModules();
        contextMenuItems = new Map();
        clickListeners = [];
        messageListeners = [];

        (globalThis as any).chrome = {
            contextMenus: {
                create: (props: any) => { contextMenuItems.set(props.id, props); },
                remove: vi.fn(),
                removeAll: (cb?: () => void) => { if (cb) cb(); },
                onClicked: { addListener: () => {} },
            },
            runtime: { onMessage: { addListener: () => {} } },
            scripting: { executeScript: vi.fn().mockResolvedValue([{ result: null }]) },
            tabs: { query: vi.fn().mockResolvedValue([]) },
        };

        vi.doMock("../../src/background/message-router", () => ({
            handleMessage: vi.fn((_msg: unknown, _sender: unknown, sendResponse: (r: unknown) => void) => {
                sendResponse({ activeProject: null, allProjects: [] });
            }),
        }));

        const { registerContextMenu } = await import("../../src/background/context-menu-handler");
        registerContextMenu();

        for (const [id] of contextMenuItems) {
            expect(id).toMatch(/^marco-/);
        }
    });
});
