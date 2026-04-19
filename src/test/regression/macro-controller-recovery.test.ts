/**
 * Regression tests — Macro Controller recovery path
 *
 * Verifies that the MacroController singleton is properly registered
 * into the RiseupAsiaMacroExt namespace so UI recovery can find it,
 * and that the startup hooks (persistence observer, error handlers,
 * diagnostic dump) are wired into the bootstrap path.
 *
 * Root cause: recovery expects the singleton at
 *   RiseupAsiaMacroExt.Projects.MacroController.api.mc
 * but the code stopped registering it, causing silent recovery failures.
 *
 * @see spec/17-app-issues/91-injection-false-positive-and-sessions-db-root-cause.md
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/* ------------------------------------------------------------------ */
/*  Source files                                                        */
/* ------------------------------------------------------------------ */

const STARTUP_FILE = "standalone-scripts/macro-controller/src/startup.ts";
const MACRO_LOOPING_FILE = "standalone-scripts/macro-controller/src/macro-looping.ts";
const MACROCONTROLLER_FILE = "standalone-scripts/macro-controller/src/core/MacroController.ts";

function readFile(relPath: string): string {
    return fs.readFileSync(path.resolve(process.cwd(), relPath), "utf-8");
}

describe("MacroController namespace registration", () => {
    it("installWindowFacade exposes MacroController on window", () => {
        const content = readFile(MACROCONTROLLER_FILE);
        // Must assign MacroController to window for recovery
        expect(content).toMatch(/window\s*(as\s*any)?\s*\.\s*MacroController\s*=/);
    });

    it("installWindowFacade calls markInitialized()", () => {
        const content = readFile(MACROCONTROLLER_FILE);
        expect(content).toContain("markInitialized()");
    });
});

// eslint-disable-next-line max-lines-per-function
describe("Startup recovery hooks are wired", () => {
    it("startup.ts imports setupPersistenceObserver", () => {
        const content = readFile(STARTUP_FILE);
        expect(content).toContain("setupPersistenceObserver");
    });

    it("startup.ts imports setupGlobalErrorHandlers", () => {
        const content = readFile(STARTUP_FILE);
        expect(content).toContain("setupGlobalErrorHandlers");
    });

    it("startup.ts imports setupDiagnosticDump", () => {
        const content = readFile(STARTUP_FILE);
        expect(content).toContain("setupDiagnosticDump");
    });

    it("bootstrap() calls setupPersistenceObserver", () => {
        const content = readFile(STARTUP_FILE);
        // Must be invoked, not just imported
        expect(content).toMatch(/setupPersistenceObserver\s*\(/);
    });

    it("bootstrap() calls setupGlobalErrorHandlers", () => {
        const content = readFile(STARTUP_FILE);
        expect(content).toMatch(/setupGlobalErrorHandlers\s*\(/);
    });

    it("bootstrap() calls setupDiagnosticDump", () => {
        const content = readFile(STARTUP_FILE);
        expect(content).toMatch(/setupDiagnosticDump\s*\(/);
    });
});

describe("Post-injection verification exists", () => {
    it("injection-handler has verifyPostInjectionGlobals", () => {
        const content = readFile("src/background/handlers/injection-handler.ts");
        expect(content).toContain("verifyPostInjectionGlobals");
    });

    it("verification checks for marco SDK, MacroController, and UI container", () => {
        const content = readFile("src/background/handlers/injection-handler.ts");
        expect(content).toContain("window.marco");
        expect(content).toContain("RiseupAsiaMacroExt");
        expect(content).toContain("MacroController");
        expect(content).toContain("macro-loop-container");
    });
});


describe("MacroController runtime namespace healing", () => {
    it("api-namespace.ts heals frozen sub-branches and writes a structured diagnostic", () => {
        const content = readFile("standalone-scripts/macro-controller/src/api-namespace.ts");
        // Deep healing pass replaces frozen sub-branches (api, _internal, meta).
        expect(content).toContain("ensureMutableBranch");
        expect(content).toContain("Object.isExtensible(child)");
        // Per-branch defensive checks — were previously only typeof checks.
        expect(content).toContain("!Object.isExtensible(api.loop)");
        expect(content).toContain("!Object.isExtensible(mc._internal)");
        // Structured diagnostic contract: version, lookup, missing, calledBy, reason, stack.
        expect(content).toContain("buildNamespaceDiagnostic");
        expect(content).toContain("MacroController v");
        expect(content).toContain("Lookup:");
        expect(content).toContain("Missing:");
        expect(content).toContain("CalledBy:");
        expect(content).toContain("Reason:");
        // Toast must NOT use the old generic message — must include version + the location hint.
        expect(content).not.toContain("'❌ Failed to access MacroController namespace'");
        expect(content).toContain("Namespace blocked at Projects.MacroController");
    });

    it("shared global types live in standalone-scripts/types/riseup-namespace.d.ts", () => {
        const content = readFile("standalone-scripts/types/riseup-namespace.d.ts");
        expect(content).toContain("RiseupAsiaMacroExtNamespace");
        expect(content).toContain("RiseupAsiaProjectBase");
        // No `any` and no bare `unknown` index signatures in the public surface.
        expect(content).not.toMatch(/:\s*any\b/);
        expect(content).not.toMatch(/\[key:\s*string\]:\s*unknown/);
    });
});

describe("Version alignment", () => {
    it("manifest.json and constants.ts have the same version", () => {
        const manifest = JSON.parse(readFile("chrome-extension/manifest.json"));
        const constants = readFile("src/shared/constants.ts");
        const match = constants.match(/EXTENSION_VERSION\s*=\s*"([^"]+)"/);
        expect(match).not.toBeNull();
        expect(manifest.version).toBe(match![1]);
    });

    it("macro-controller shared-state VERSION matches extension version", () => {
        const constants = readFile("src/shared/constants.ts");
        const extMatch = constants.match(/EXTENSION_VERSION\s*=\s*"([^"]+)"/);
        const sharedState = readFile("standalone-scripts/macro-controller/src/shared-state.ts");
        const mcMatch = sharedState.match(/VERSION\s*=\s*["']([^"']+)["']/);
        expect(extMatch).not.toBeNull();
        expect(mcMatch).not.toBeNull();
        expect(mcMatch![1]).toBe(extMatch![1]);
    });
});
