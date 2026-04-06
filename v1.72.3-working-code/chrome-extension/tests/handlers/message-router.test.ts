/**
 * Unit tests — Message Router
 *
 * Tests message dispatch, broadcast handling, unknown types,
 * and error handling in the router.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

const { handleMessage } = await import("../../src/background/message-router");

describe("Message Router", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("routes GET_STATUS to the status handler", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = { tab: { id: 1 } } as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "GET_STATUS" },
            sender,
            sendResponse,
        );

        const typed = response as Record<string, unknown>;

        expect(typed).toBeDefined();
        expect(typed.version).toBeDefined();
        expect(typed.connection).toBeDefined();
    });

    it("routes GET_HEALTH_STATUS to the health handler", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = {} as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "GET_HEALTH_STATUS" },
            sender,
            sendResponse,
        );

        const typed = response as Record<string, unknown>;

        expect(typed.state).toBeDefined();
        expect(typed.details).toBeDefined();
    });

    it("returns isOk: true for broadcast types", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = {} as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "INJECTION_RESULT" },
            sender,
            sendResponse,
        );

        expect(response).toEqual({ isOk: true });
    });

    it("returns error for unknown message type", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = {} as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "TOTALLY_UNKNOWN_TYPE" },
            sender,
            sendResponse,
        );

        const typed = response as { isOk: boolean; errorMessage: string };

        expect(typed.isOk).toBe(false);
        expect(typed.errorMessage).toContain("Unknown message type");
    });

    it("routes GET_ALL_PROJECTS and returns project list", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = {} as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "GET_ALL_PROJECTS" },
            sender,
            sendResponse,
        );

        const typed = response as { projects: unknown[] };

        expect(typed.projects).toBeDefined();
        expect(Array.isArray(typed.projects)).toBe(true);
    });

    it("routes GET_ALL_SCRIPTS and returns scripts list", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = {} as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "GET_ALL_SCRIPTS" },
            sender,
            sendResponse,
        );

        const typed = response as { scripts: unknown[] };

        expect(typed.scripts).toBeDefined();
        expect(Array.isArray(typed.scripts)).toBe(true);
    });

    it("routes NETWORK_STATUS correctly", async () => {
        let response: unknown = null;
        const sendResponse = (r: unknown) => { response = r; };
        const sender = {} as chrome.runtime.MessageSender;

        await handleMessage(
            { type: "NETWORK_STATUS", isOnline: true },
            sender,
            sendResponse,
        );

        const typed = response as { isOk: boolean };

        expect(typed.isOk).toBe(true);
    });
});
