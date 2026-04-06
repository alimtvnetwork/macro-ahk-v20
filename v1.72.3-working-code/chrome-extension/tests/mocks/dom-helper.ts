/**
 * DOM helper for options page tests.
 *
 * Provides a minimal JSDOM-backed document for testing
 * options modules that render HTML into containers.
 */

import { JSDOM } from "jsdom";

let currentDom: JSDOM | null = null;

/** Sets up a global document for DOM-dependent tests. */
export function installDomMock(): void {
    currentDom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
        url: "chrome-extension://mock/options.html",
    });

    (globalThis as any).document = currentDom.window.document;
    (globalThis as any).HTMLElement = currentDom.window.HTMLElement;
    (globalThis as any).HTMLInputElement = currentDom.window.HTMLInputElement;
    (globalThis as any).HTMLSelectElement = currentDom.window.HTMLSelectElement;
    (globalThis as any).confirm = () => true;
}

/** Creates a fresh container div for rendering using a fresh JSDOM. */
export function createContainer(): HTMLElement {
    const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
        url: "chrome-extension://mock/options.html",
    });

    // Update globalThis.document to point to the fresh DOM
    (globalThis as any).document = dom.window.document;

    const container = dom.window.document.createElement("div");
    dom.window.document.body.appendChild(container);
    return container;
}
