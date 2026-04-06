/**
 * Integration test — XPath Handler Lifecycle
 *
 * Tests the full XPath recorder toggle, record, retrieve,
 * clear, and test lifecycle through handler functions.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock, resetMockStorage, getScriptingCalls } from "../mocks/chrome-storage";

installChromeMock();

const {
    handleToggleXPathRecorder,
    handleGetRecordedXPaths,
    handleClearRecordedXPaths,
    addRecordedXPath,
    resetXPathState,
} = await import("../../src/background/handlers/xpath-handler");

const { handleTestXPath } = await import("../../src/background/handlers/xpath-test-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function makeSender(tabId: number = 1): chrome.runtime.MessageSender {
    return { tab: { id: tabId } } as chrome.runtime.MessageSender;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("XPath Handler — Lifecycle Integration", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        resetXPathState();
    });

    it("toggles recording on → injects content script", async () => {
        const result = await handleToggleXPathRecorder(
            { type: "TOGGLE_XPATH_RECORDER" } as any,
            makeSender(42),
        );

        expect(result.isRecording).toBe(true);

        const calls = getScriptingCalls();
        const hasRecorderInjection = calls.some(
            (c) => c.files?.includes("content-scripts/xpath-recorder.js"),
        );
        expect(hasRecorderInjection).toBe(true);
    });

    it("toggles recording off → dispatches stop event", async () => {
        // Start recording
        await handleToggleXPathRecorder(
            { type: "TOGGLE_XPATH_RECORDER" } as any,
            makeSender(42),
        );

        // Stop recording
        const result = await handleToggleXPathRecorder(
            { type: "TOGGLE_XPATH_RECORDER" } as any,
            makeSender(42),
        );

        expect(result.isRecording).toBe(false);
    });

    it("records XPaths and retrieves them", async () => {
        addRecordedXPath({
            xpath: "//*[@id='main']",
            tagName: "div",
            text: "Main content",
            strategy: "id",
            timestamp: "2026-02-28T00:00:00Z",
        });

        addRecordedXPath({
            xpath: "//button[text()='Submit']",
            tagName: "button",
            text: "Submit",
            strategy: "role-text",
            timestamp: "2026-02-28T00:00:01Z",
        });

        const result = await handleGetRecordedXPaths(
            { type: "GET_RECORDED_XPATHS" } as any,
            makeSender(),
        );

        expect(result.recorded.length).toBe(2);
        expect(result.recorded[0].xpath).toBe("//*[@id='main']");
        expect(result.recorded[1].strategy).toBe("role-text");
    });

    it("clears all recorded XPaths", async () => {
        addRecordedXPath({
            xpath: "//*[@id='test']",
            tagName: "div",
            text: "Test",
            strategy: "id",
            timestamp: "2026-02-28T00:00:00Z",
        });

        await handleClearRecordedXPaths(
            { type: "CLEAR_RECORDED_XPATHS" } as any,
            makeSender(),
        );

        const result = await handleGetRecordedXPaths(
            { type: "GET_RECORDED_XPATHS" } as any,
            makeSender(),
        );

        expect(result.recorded.length).toBe(0);
    });

    it("returns empty list when no XPaths recorded", async () => {
        const result = await handleGetRecordedXPaths(
            { type: "GET_RECORDED_XPATHS" } as any,
            makeSender(),
        );

        expect(result.recorded).toEqual([]);
        expect(result.isRecording).toBe(false);
    });

    it("returns not recording when tab is missing", async () => {
        const senderWithoutTab = {} as chrome.runtime.MessageSender;

        const result = await handleToggleXPathRecorder(
            { type: "TOGGLE_XPATH_RECORDER" } as any,
            senderWithoutTab,
        );

        expect(result.isRecording).toBe(false);
    });

    it("full lifecycle: start → record → get → clear → stop", async () => {
        // Start
        await handleToggleXPathRecorder(
            { type: "TOGGLE_XPATH_RECORDER" } as any,
            makeSender(42),
        );

        // Record some XPaths
        addRecordedXPath({
            xpath: "/html/body/div[1]",
            tagName: "div",
            text: "Container",
            strategy: "positional",
            timestamp: "2026-02-28T00:00:00Z",
        });

        // Get
        const recorded = await handleGetRecordedXPaths(
            { type: "GET_RECORDED_XPATHS" } as any,
            makeSender(),
        );
        expect(recorded.recorded.length).toBe(1);
        expect(recorded.isRecording).toBe(true);

        // Clear
        await handleClearRecordedXPaths(
            { type: "CLEAR_RECORDED_XPATHS" } as any,
            makeSender(),
        );

        const cleared = await handleGetRecordedXPaths(
            { type: "GET_RECORDED_XPATHS" } as any,
            makeSender(),
        );
        expect(cleared.recorded.length).toBe(0);

        // Stop
        const stopped = await handleToggleXPathRecorder(
            { type: "TOGGLE_XPATH_RECORDER" } as any,
            makeSender(42),
        );
        expect(stopped.isRecording).toBe(false);
    });
});
