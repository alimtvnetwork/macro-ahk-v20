/**
 * Unit tests — Logging Queries
 *
 * Tests collectRows, countTable, queryWithSource, and queryAll helpers.
 */

import { describe, it, expect } from "vitest";
import { collectRows, countTable, queryWithSource, queryAll } from "../../src/background/handlers/logging-queries";

describe("collectRows", () => {
    it("collects all rows from a statement", () => {
        const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
        let index = 0;
        const mockStmt = {
            step: () => index < rows.length,
            getAsObject: () => rows[index++],
            free: () => {},
        };

        const result = collectRows(mockStmt);
        expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    });

    it("returns empty array for empty result set", () => {
        const mockStmt = {
            step: () => false,
            getAsObject: () => ({}),
            free: () => {},
        };

        const result = collectRows(mockStmt);
        expect(result).toEqual([]);
    });

    it("calls free() after collection", () => {
        let freed = false;
        const mockStmt = {
            step: () => false,
            getAsObject: () => ({}),
            free: () => { freed = true; },
        };

        collectRows(mockStmt);
        expect(freed).toBe(true);
    });
});

describe("countTable", () => {
    it("returns count from exec result", () => {
        const mockDb = {
            exec: () => [{ columns: ["cnt"], values: [[42]] }],
        };

        const count = countTable(mockDb, "Logs");
        expect(count).toBe(42);
    });

    it("returns 0 for empty exec result", () => {
        const mockDb = { exec: () => [] };

        const count = countTable(mockDb, "Logs");
        expect(count).toBe(0);
    });

    it("returns 0 for empty values array", () => {
        const mockDb = {
            exec: () => [{ columns: ["cnt"], values: [] }],
        };

        const count = countTable(mockDb, "Errors");
        expect(count).toBe(0);
    });
});

describe("queryWithSource", () => {
    it("binds source and limit, returns rows", () => {
        const rows = [{ id: 1, source: "test" }];
        let index = 0;
        let boundParams: unknown[] = [];

        const mockDb = {
            prepare: () => ({
                bind: (params: unknown[]) => { boundParams = params; },
                step: () => {
                    if (index < rows.length) { return true; }
                    return false;
                },
                getAsObject: () => rows[index++],
                free: () => {},
            }),
        };

        const result = queryWithSource(mockDb, "user-script", 10);
        expect(boundParams).toEqual(["user-script", 10]);
        expect(result).toEqual([{ id: 1, source: "test" }]);
    });
});

describe("queryAll", () => {
    it("binds limit and returns rows", () => {
        let boundParams: unknown[] = [];
        const mockDb = {
            prepare: () => ({
                bind: (params: unknown[]) => { boundParams = params; },
                step: () => false,
                getAsObject: () => ({}),
                free: () => {},
            }),
        };

        const result = queryAll(mockDb, 50);
        expect(boundParams).toEqual([50]);
        expect(result).toEqual([]);
    });
});
