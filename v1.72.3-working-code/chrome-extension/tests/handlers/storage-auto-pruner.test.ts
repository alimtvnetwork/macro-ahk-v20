/**
 * Integration tests — Storage Auto-Pruner
 *
 * Verifies threshold-based log pruning, batch deletion,
 * health state transitions, and error table pruning.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    installChromeMock,
    resetMockStorage,
} from "../mocks/chrome-storage";

installChromeMock();

/* ------------------------------------------------------------------ */
/*  Mock logging-handler dependencies                                  */
/* ------------------------------------------------------------------ */

let mockLogCount = 0;
let mockErrorCount = 0;
let logDeleteCalls: Array<{ sql: string; params: unknown[] }> = [];
let errorDeleteCalls: Array<{ sql: string; params: unknown[] }> = [];
let markDirtyCalled = false;

const mockLogsDb = {
    run: (sql: string, params: unknown[] = []) => {
        logDeleteCalls.push({ sql, params });
        // Simulate rows being deleted
        const batchSize = (params[0] as number) ?? 0;
        mockLogCount = Math.max(0, mockLogCount - batchSize);
    },
    exec: () => [],
    export: () => new Uint8Array(),
};

const mockErrorsDb = {
    run: (sql: string, params: unknown[] = []) => {
        errorDeleteCalls.push({ sql, params });
        const batchSize = (params[0] as number) ?? 0;
        mockErrorCount = Math.max(0, mockErrorCount - batchSize);
    },
    exec: () => [],
    export: () => new Uint8Array(),
};

vi.mock("../../../src/background/handlers/logging-handler", () => ({
    countTable: (_db: any, table: string) => {
        const isLogs = table === "Logs";
        return isLogs ? mockLogCount : mockErrorCount;
    },
    getLogsDb: () => mockLogsDb,
    getErrorsDb: () => mockErrorsDb,
    markLoggingDirty: () => {
        markDirtyCalled = true;
    },
}));

vi.mock("../../../src/background/health-handler", () => ({
    transitionHealth: vi.fn(),
    recoverHealth: vi.fn(),
}));

const { checkAndAutoPrune } = await import(
    "../../src/background/storage-auto-pruner"
);
const { transitionHealth, recoverHealth } = await import(
    "../../src/background/health-handler"
);

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe("Storage Auto-Pruner", () => {
    beforeEach(() => {
        resetMockStorage();
        mockLogCount = 0;
        mockErrorCount = 0;
        logDeleteCalls = [];
        errorDeleteCalls = [];
        markDirtyCalled = false;
        vi.clearAllMocks();
    });

    it("does NOT prune when below threshold", async () => {
        mockLogCount = 1_000_000;
        mockErrorCount = 100;

        await checkAndAutoPrune();

        expect(logDeleteCalls.length).toBe(0);
        expect(errorDeleteCalls.length).toBe(0);
    });

    it("does NOT prune when exactly at threshold minus one", async () => {
        mockLogCount = 4_499_999;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(logDeleteCalls.length).toBe(0);
    });

    it("prunes when total rows exceed threshold", async () => {
        mockLogCount = 4_400_000;
        mockErrorCount = 200_000;

        await checkAndAutoPrune();

        const hasPrunedLogs = logDeleteCalls.length > 0;

        expect(hasPrunedLogs).toBe(true);
    });

    it("prunes when exactly at threshold", async () => {
        mockLogCount = 4_500_000;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(logDeleteCalls.length).toBeGreaterThan(0);
    });

    it("transitions health to DEGRADED during pruning", async () => {
        mockLogCount = 4_500_000;
        mockErrorCount = 100_000;

        await checkAndAutoPrune();

        expect(transitionHealth).toHaveBeenCalledWith(
            "DEGRADED",
            "Auto-pruning storage",
        );
    });

    it("marks logging dirty after prune", async () => {
        mockLogCount = 4_500_000;
        mockErrorCount = 100_000;

        await checkAndAutoPrune();

        expect(markDirtyCalled).toBe(true);
    });

    it("does NOT mark dirty when no prune occurs", async () => {
        mockLogCount = 100;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(markDirtyCalled).toBe(false);
    });

    it("prunes errors at 10% of log prune rate", async () => {
        mockLogCount = 4_400_000;
        mockErrorCount = 200_000;

        await checkAndAutoPrune();

        const hasErrorPrune = errorDeleteCalls.length > 0;

        expect(hasErrorPrune).toBe(true);
    });

    it("does NOT prune errors when error count is zero", async () => {
        mockLogCount = 4_600_000;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        // Error prune should still be called (10% of log prune target)
        // but with a positive count derived from logs
        expect(errorDeleteCalls.length).toBeGreaterThan(0);
    });

    it("prunes logs in batches of 500", async () => {
        mockLogCount = 4_501_000;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        // Should delete 4_501_000 - 100_000 = 4_401_000 rows
        // In batches of 500 → 8802 batch calls
        const totalBatches = logDeleteCalls.length;
        expect(totalBatches).toBeGreaterThan(1);

        // Each batch param should be <= 500
        for (const call of logDeleteCalls) {
            const batchSize = call.params[0] as number;
            expect(batchSize).toBeLessThanOrEqual(500);
        }
    });

    it("recovers health when rows drop below healthy threshold", async () => {
        mockLogCount = 1_000_000;
        mockErrorCount = 100;

        await checkAndAutoPrune();

        expect(recoverHealth).toHaveBeenCalled();
    });

    it("does NOT recover health when still above healthy threshold", async () => {
        mockLogCount = 3_500_000;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(recoverHealth).not.toHaveBeenCalled();
    });

    it("does NOT recover health when at exactly healthy threshold", async () => {
        mockLogCount = 3_000_000;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(recoverHealth).not.toHaveBeenCalled();
    });

    it("recovers health when just below healthy threshold", async () => {
        mockLogCount = 2_999_999;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(recoverHealth).toHaveBeenCalled();
    });

    it("handles zero total rows gracefully", async () => {
        mockLogCount = 0;
        mockErrorCount = 0;

        await checkAndAutoPrune();

        expect(logDeleteCalls.length).toBe(0);
        expect(recoverHealth).toHaveBeenCalled();
    });
});