/**
 * Unit tests — Injection Handler
 *
 * Tests INJECT_SCRIPTS and GET_TAB_INJECTIONS against
 * mock chrome.scripting and state-manager.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
    getScriptingCalls,
    getCssCalls,
    setMockTabs,
} from "../mocks/chrome-storage";

installChromeMock();

const {
    handleInjectScripts,
    handleGetTabInjections,
} = await import("../../src/background/handlers/injection-handler");

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Builds a minimal inject message. */
function buildInjectMsg(tabId: number, scripts: unknown[]) {
    return {
        type: "INJECT_SCRIPTS",
        tabId,
        scripts,
    } as any;
}

/** Builds a minimal script entry. */
function buildScript(id: string, code: string, order: number) {
    return {
        id,
        code,
        order,
    };
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Injection Handler — INJECT_SCRIPTS", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        setMockTabs([{ id: 100 }]);
    });

    it("returns results for each injected script", async () => {
        const scripts = [
            buildScript("s1", "console.log('hello')", 1),
            buildScript("s2", "console.log('world')", 2),
        ];

        const result = await handleInjectScripts(buildInjectMsg(100, scripts));

        expect(result.results).toHaveLength(2);
        expect(result.results[0].scriptId).toBe("s1");
        expect(result.results[1].scriptId).toBe("s2");
    });

    it("injects scripts in order", async () => {
        const scripts = [
            buildScript("s-third", "c", 3),
            buildScript("s-first", "a", 1),
            buildScript("s-second", "b", 2),
        ];

        const result = await handleInjectScripts(buildInjectMsg(100, scripts));

        expect(result.results[0].scriptId).toBe("s-first");
        expect(result.results[1].scriptId).toBe("s-second");
        expect(result.results[2].scriptId).toBe("s-third");
    });

    it("records injection duration", async () => {
        const scripts = [buildScript("s1", "1+1", 1)];

        const result = await handleInjectScripts(buildInjectMsg(100, scripts));

        expect(result.results[0].durationMs).toBeGreaterThanOrEqual(0);
    });

    it("injects CSS before JS when script has assets.css", async () => {
        const scripts = [{
            id: "css-script",
            code: "console.log('with-css')",
            order: 1,
            assets: { css: "macro-looping.css" },
        }];

        await handleInjectScripts(buildInjectMsg(100, scripts));

        const css = getCssCalls();
        expect(css.length).toBeGreaterThanOrEqual(1);
        expect(css[0].tabId).toBe(100);
        expect(css[0].files).toContain("projects/scripts/macro-looping.css");
    });

    it("skips CSS injection when no assets.css", async () => {
        const scripts = [buildScript("no-css", "1+1", 1)];

        await handleInjectScripts(buildInjectMsg(100, scripts));

        const css = getCssCalls();
        expect(css).toHaveLength(0);
    });
});

describe("Injection Handler — GET_TAB_INJECTIONS", () => {
    beforeEach(() => {
        resetMockStorage();
        installChromeMock();
        setMockTabs([{ id: 200 }]);
    });

    it("returns empty when no injections recorded", async () => {
        const result = await handleGetTabInjections({
            type: "GET_TAB_INJECTIONS",
            tabId: 999,
        } as any);

        expect(result.injections[999]).toBeNull();
    });

    it("returns injection record after injecting scripts", async () => {
        const scripts = [buildScript("s1", "a", 1)];
        await handleInjectScripts(buildInjectMsg(200, scripts));

        const result = await handleGetTabInjections({
            type: "GET_TAB_INJECTIONS",
            tabId: 200,
        } as any);

        const record = result.injections[200] as any;

        expect(record).toBeDefined();
        expect(record.scriptIds).toContain("s1");
    });
});
