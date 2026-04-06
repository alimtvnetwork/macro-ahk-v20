/**
 * Unit tests — XPath Handler
 *
 * Tests TOGGLE_XPATH_RECORDER, GET_RECORDED_XPATHS,
 * CLEAR_RECORDED_XPATHS, and TEST_XPATH against mock chrome APIs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockTabs,
    getScriptingCalls,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    handleToggleXPathRecorder,
    handleGetRecordedXPaths,
    handleClearRecordedXPaths,
    handleTestXPath,
    addRecordedXPath,
    resetXPathState,
} = await import("../../src/background/handlers/xpath-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const EMPTY_MSG = { type: "TOGGLE_XPATH_RECORDER" } as any;

/** Builds a mock sender with a tab ID. */
function buildSender(tabId: number) {
    return { tab: { id: tabId } } as any;
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("XPath Handler — TOGGLE_XPATH_RECORDER", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        resetXPathState();
    });

    it("returns isRecording false when no tab ID", async () => {
        const result = await handleToggleXPathRecorder(EMPTY_MSG, {} as any);

        expect(result.isRecording).toBe(false);
    });

    it("starts recording on first toggle", async () => {
        const result = await handleToggleXPathRecorder(EMPTY_MSG, buildSender(100));

        expect(result.isRecording).toBe(true);
    });

    it("stops recording on second toggle", async () => {
        await handleToggleXPathRecorder(EMPTY_MSG, buildSender(100));
        const result = await handleToggleXPathRecorder(EMPTY_MSG, buildSender(100));

        expect(result.isRecording).toBe(false);
    });
});

describe("XPath Handler — GET_RECORDED_XPATHS", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        resetXPathState();
    });

    it("returns empty array initially", async () => {
        const result = await handleGetRecordedXPaths(EMPTY_MSG, {} as any);

        expect(result.recorded).toEqual([]);
    });

    it("returns recorded entries after adding", async () => {
        addRecordedXPath({
            xpath: "//*[@id='test']",
            tagName: "div",
            text: "Hello",
            timestamp: new Date().toISOString(),
            strategy: "id",
        });

        const result = await handleGetRecordedXPaths(EMPTY_MSG, {} as any);

        expect(result.recorded).toHaveLength(1);
        expect(result.recorded[0].xpath).toBe("//*[@id='test']");
    });
});

describe("XPath Handler — CLEAR_RECORDED_XPATHS", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        resetXPathState();
    });

    it("clears all recorded entries", async () => {
        addRecordedXPath({
            xpath: "//*[@id='a']",
            tagName: "div",
            text: "A",
            timestamp: new Date().toISOString(),
            strategy: "id",
        });

        const clearResult = await handleClearRecordedXPaths(EMPTY_MSG, {} as any);

        expect(clearResult.isOk).toBe(true);

        const getResult = await handleGetRecordedXPaths(EMPTY_MSG, {} as any);

        expect(getResult.recorded).toHaveLength(0);
    });
});

describe("XPath Handler — TEST_XPATH", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        resetXPathState();
        setMockTabs([{ id: 300 }]);
    });

    it("returns error when no active tab", async () => {
        setMockTabs([]);

        const result = await handleTestXPath({
            type: "TEST_XPATH",
            xpath: "//div",
        } as any);

        expect(result.found).toBe(0);
        expect(result.error).toBeDefined();
    });
});
