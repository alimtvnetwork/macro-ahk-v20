/**
 * Marco Extension — Content Script: XPath Recorder
 *
 * Injected programmatically when the user toggles recording.
 * Listens for clicks, generates XPaths using a priority strategy
 * (ID > testid > role+text > positional), highlights elements,
 * and reports back to the background service worker.
 *
 * Exclusions: iframes, Shadow DOM, SVG elements.
 *
 * Canonical source — chrome-extension/src/content-scripts/ re-exports from here.
 */

import {
    tryIdStrategy,
    tryTestIdStrategy,
    tryRoleTextStrategy,
    buildPositionalXPath,
} from "./xpath-strategies";

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let isActive = true;

/* ------------------------------------------------------------------ */
/*  XPath Generation — Priority Strategy                               */
/* ------------------------------------------------------------------ */

/** Generates an XPath for the given element using priority strategy. */
function generateXPath(element: Element): {
    xpath: string;
    strategy: "id" | "testid" | "role-text" | "positional";
} {
    const byId = tryIdStrategy(element);
    const hasId = byId !== null;

    if (hasId) {
        return byId!;
    }

    const byTestId = tryTestIdStrategy(element);
    const hasTestId = byTestId !== null;

    if (hasTestId) {
        return byTestId!;
    }

    const byRole = tryRoleTextStrategy(element);
    const hasRole = byRole !== null;

    if (hasRole) {
        return byRole!;
    }

    return buildPositionalXPath(element);
}

/* ------------------------------------------------------------------ */
/*  Element Filtering                                                  */
/* ------------------------------------------------------------------ */

/** Returns true if the element should be excluded from recording. */
function isExcludedElement(element: Element): boolean {
    const isIframe = element.tagName === "IFRAME";
    const isSvg = element instanceof SVGElement;
    const isInShadowDom = element.getRootNode() instanceof ShadowRoot;

    return isIframe || isSvg || isInShadowDom;
}

/* ------------------------------------------------------------------ */
/*  Click Handler                                                      */
/* ------------------------------------------------------------------ */

/** Handles click events to record XPaths. */
function onElementClick(event: MouseEvent): void {
    const isInactive = isActive === false;

    if (isInactive) {
        return;
    }

    const target = event.target as Element;
    const isExcluded = isExcludedElement(target);

    if (isExcluded) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();

    const generated = generateXPath(target);

    void chrome.runtime.sendMessage({
        type: "XPATH_RECORDED",
        xpath: generated.xpath,
        tagName: target.tagName.toLowerCase(),
        text: target.textContent?.trim().slice(0, 100) ?? "",
        strategy: generated.strategy,
        timestamp: new Date().toISOString(),
    });

    highlightElement(target);
}

/* ------------------------------------------------------------------ */
/*  Visual Highlight                                                   */
/* ------------------------------------------------------------------ */

/** Briefly highlights the clicked element. */
function highlightElement(element: Element): void {
    const htmlElement = element as HTMLElement;
    const originalOutline = htmlElement.style.outline;

    htmlElement.style.outline = "2px solid #ff6b35";

    setTimeout(() => {
        htmlElement.style.outline = originalOutline;
    }, 1500);
}

/* ------------------------------------------------------------------ */
/*  Lifecycle                                                          */
/* ------------------------------------------------------------------ */

/** Starts the XPath recorder. */
function startRecorder(): void {
    document.addEventListener("click", onElementClick, true);
    console.log("[Marco] XPath recorder started");
}

/** Stops the XPath recorder. */
function stopRecorder(): void {
    isActive = false;
    document.removeEventListener("click", onElementClick, true);
    console.log("[Marco] XPath recorder stopped");
}

/** Listens for the stop event from the background handler. */
window.addEventListener("marco-xpath-stop", () => {
    stopRecorder();
});

startRecorder();
