/**
 * Marco Extension — XPath Test Handler
 *
 * Handles TEST_XPATH messages by evaluating expressions
 * in the active tab. Extracted from xpath-handler.ts
 * to stay under the 200-line file limit.
 *
 * @see spec/05-chrome-extension/07-advanced-features.md §XPath Recorder
 */

import type { MessageRequest } from "../../shared/messages";

/* ------------------------------------------------------------------ */
/*  TEST_XPATH                                                         */
/* ------------------------------------------------------------------ */

/** Tests an XPath expression against the active tab. */
export async function handleTestXPath(
    message: MessageRequest,
): Promise<{ found: number; error?: string }> {
    const msg = message as MessageRequest & { xpath: string };
    const tabId = await getActiveTabId();
    const isMissingTab = tabId === null;

    if (isMissingTab) {
        return { found: 0, error: "No active tab found" };
    }

    return evaluateXPathInTab(tabId, msg.xpath);
}

/** Gets the active tab ID. */
async function getActiveTabId(): Promise<number | null> {
    const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });

    const hasActiveTab = tabs.length > 0 && tabs[0].id !== undefined;

    return hasActiveTab ? tabs[0].id! : null;
}

/** Evaluates an XPath expression in the specified tab. */
async function evaluateXPathInTab(
    tabId: number,
    xpath: string,
): Promise<{ found: number; error?: string }> {
    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: evaluateXPathInPage,
            args: [xpath],
        });

        const hasResult = results.length > 0;

        return hasResult
            ? (results[0].result as { found: number; error?: string })
            : { found: 0, error: "No result returned" };
    } catch (evalError) {
        return buildXPathError(evalError);
    }
}

/** Builds an error response from an XPath evaluation failure. */
function buildXPathError(error: Error | string): { found: number; error: string } {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    return { found: 0, error: errorMessage };
}

/** Runs in page context to evaluate an XPath. */
function evaluateXPathInPage(
    xpath: string,
): { found: number; error?: string } {
    try {
        const result = document.evaluate(
            xpath,
            document,
            null,
            XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
            null,
        );

        return { found: result.snapshotLength };
    } catch (xpathError) {
        const errorMessage = xpathError instanceof Error
            ? xpathError.message
            : String(xpathError);

        return { found: 0, error: errorMessage };
    }
}
