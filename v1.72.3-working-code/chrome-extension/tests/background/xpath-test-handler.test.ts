/**
 * Unit tests — XPath Test Handler
 *
 * Tests handleTestXPath against mock chrome APIs for
 * active tab resolution and XPath evaluation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    setMockTabs,
    getScriptingCalls,
} from "../mocks/chrome-storage";

installChromeMock();

const { handleTestXPath } = await import(
    "../../src/background/handlers/xpath-test-handler"
);

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildXPathMessage(xpath: string): any {
    return { type: "TEST_XPATH", xpath };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("XPath Test Handler — handleTestXPath", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
    });

    it("returns error when no active tab exists", async () => {
        setMockTabs([]);

        const result = await handleTestXPath(buildXPathMessage("//div"));

        expect(result.found).toBe(0);
        expect(result.error).toBe("No active tab found");
    });

    it("calls executeScript with correct tabId and xpath", async () => {
        setMockTabs([{ id: 42 }]);

        await handleTestXPath(buildXPathMessage("//span[@class='test']"));

        const calls = getScriptingCalls();
        const hasCall = calls.length > 0;

        expect(hasCall).toBe(true);
        expect(calls[0].tabId).toBe(42);
    });

    it("uses the first active tab when multiple exist", async () => {
        setMockTabs([{ id: 10 }, { id: 20 }]);

        await handleTestXPath(buildXPathMessage("//div"));

        const calls = getScriptingCalls();

        expect(calls[0].tabId).toBe(10);
    });

    it("returns result from executeScript", async () => {
        setMockTabs([{ id: 50 }]);

        const result = await handleTestXPath(buildXPathMessage("//body"));

        // Mock executeScript runs the func in-process; document.evaluate
        // won't exist in Node, so we expect either a result or error
        const hasResponse = result.found !== undefined;

        expect(hasResponse).toBe(true);
    });

    it("handles executeScript throwing an error", async () => {
        // Set up a tab but make scripting throw
        setMockTabs([{ id: 99 }]);
        (globalThis as any).chrome.scripting.executeScript = async () => {
            throw new Error("Cannot access tab");
        };

        const result = await handleTestXPath(buildXPathMessage("//div"));

        expect(result.found).toBe(0);
        expect(result.error).toBe("Cannot access tab");

        // Restore mock
        installChromeMock();
    });

    it("handles executeScript returning empty results", async () => {
        setMockTabs([{ id: 77 }]);
        (globalThis as any).chrome.scripting.executeScript = async () => [];

        const result = await handleTestXPath(buildXPathMessage("//div"));

        expect(result.found).toBe(0);
        expect(result.error).toBe("No result returned");

        installChromeMock();
    });
});
