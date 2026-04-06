/**
 * Regression tests — Sessions logging path
 *
 * Verifies that the "no such table: Sessions" cross-database bug
 * cannot return. The root cause was code querying the Errors DB
 * with a `SELECT Id FROM Sessions...` subquery, but the Sessions
 * table only exists in the Logs DB.
 *
 * Fix: all paths now use `getCurrentSessionId()` from logging-handler
 * and pass the session ID as a parameter, never as a cross-DB subquery.
 *
 * @see spec/02-app-issues/91-injection-false-positive-and-sessions-db-root-cause.md
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

/* ------------------------------------------------------------------ */
/*  Source files that interact with Errors DB and must NOT reference    */
/*  the Sessions table directly.                                       */
/* ------------------------------------------------------------------ */

const ERROR_DB_CONSUMERS = [
    "src/background/handlers/error-handler.ts",
    "src/background/handlers/user-script-log-handler.ts",
    "src/background/health-handler.ts",
];

const FORBIDDEN_PATTERN = /SELECT\s+.*\bFROM\s+Sessions\b/i;
const CROSS_DB_SUBQUERY = /\(\s*SELECT\s+Id\s+FROM\s+Sessions/i;

describe("Sessions table cross-database guard", () => {
    for (const filePath of ERROR_DB_CONSUMERS) {
        it(`${filePath} must not query Sessions table directly`, () => {
            const fullPath = path.resolve(process.cwd(), filePath);
            const content = fs.readFileSync(fullPath, "utf-8");

            expect(content).not.toMatch(FORBIDDEN_PATTERN);
            expect(content).not.toMatch(CROSS_DB_SUBQUERY);
        });
    }

    it("error-handler uses getCurrentSessionId() not a subquery", () => {
        const filePath = path.resolve(process.cwd(), "src/background/handlers/error-handler.ts");
        const content = fs.readFileSync(filePath, "utf-8");

        expect(content).toContain("getCurrentSessionId");
        expect(content).toContain("SessionId = ?");
        expect(content).not.toMatch(CROSS_DB_SUBQUERY);
    });

    it("user-script-log-handler uses getCurrentSessionId() for both DBs", () => {
        const filePath = path.resolve(process.cwd(), "src/background/handlers/user-script-log-handler.ts");
        const content = fs.readFileSync(filePath, "utf-8");

        expect(content).toContain("getCurrentSessionId");
        // Should NOT reference Sessions table at all — only use the session ID value
        expect(content).not.toMatch(/FROM\s+Sessions/i);
    });

    it("health-handler uses getCurrentSessionId() not a subquery", () => {
        const filePath = path.resolve(process.cwd(), "src/background/health-handler.ts");
        const content = fs.readFileSync(filePath, "utf-8");

        expect(content).toContain("getCurrentSessionId");
        expect(content).not.toMatch(CROSS_DB_SUBQUERY);
    });
});
