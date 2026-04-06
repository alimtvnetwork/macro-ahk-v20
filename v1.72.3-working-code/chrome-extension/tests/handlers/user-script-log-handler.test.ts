/**
 * Marco Extension — User Script Log Handler Tests
 *
 * Tests for USER_SCRIPT_LOG message handling (Spec 42).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MessageRequest } from "@/shared/messages";

/* ── Mock chrome API ── */
(globalThis as any).chrome = {
    runtime: {
        getManifest: () => ({ version: "1.2.0" }),
    },
};

const mockLogsDb = {
    run: vi.fn(),
};

const mockErrorsDb = {
    run: vi.fn(),
};

// Mock the canonical logging-handler (not the shim) since the source uses relative imports
vi.mock("../../../src/background/handlers/logging-handler", () => ({
    getLogsDb: () => mockLogsDb,
    getErrorsDb: () => mockErrorsDb,
    markLoggingDirty: vi.fn(),
}));

import { handleUserScriptLog } from "@/background/handlers/user-script-log-handler";

/* ── Helpers ── */

function buildLogMessage(overrides?: Record<string, unknown>): MessageRequest {
    return {
        type: "USER_SCRIPT_LOG",
        payload: {
            level: "INFO",
            source: "user-script",
            category: "USER",
            action: "log",
            detail: "Test message",
            metadata: null,
            projectId: "proj-1",
            scriptId: "script-1",
            configId: "config-1",
            urlRuleId: "rule-1",
            pageUrl: "https://example.com",
            timestamp: "2026-03-14T10:00:00.000Z",
            ...overrides,
        },
    } as unknown as MessageRequest;
}

describe("handleUserScriptLog", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("inserts INFO log into logs.db only", async () => {
        const result = await handleUserScriptLog(buildLogMessage());

        expect(result).toEqual({ isOk: true });
        expect(mockLogsDb.run).toHaveBeenCalledTimes(1);
        expect(mockErrorsDb.run).not.toHaveBeenCalled();
    });

    it("inserts ERROR log into both logs.db and errors.db", async () => {
        const result = await handleUserScriptLog(buildLogMessage({ level: "ERROR" }));

        expect(result).toEqual({ isOk: true });
        expect(mockLogsDb.run).toHaveBeenCalledTimes(1);
        expect(mockErrorsDb.run).toHaveBeenCalledTimes(1);
    });

    it("inserts WARN log only into logs.db", async () => {
        await handleUserScriptLog(buildLogMessage({ level: "WARN" }));

        expect(mockLogsDb.run).toHaveBeenCalledTimes(1);
        expect(mockErrorsDb.run).not.toHaveBeenCalled();
    });

    it("inserts DEBUG log only into logs.db", async () => {
        await handleUserScriptLog(buildLogMessage({ level: "DEBUG" }));

        expect(mockLogsDb.run).toHaveBeenCalledTimes(1);
        expect(mockErrorsDb.run).not.toHaveBeenCalled();
    });

    it("redacts sensitive metadata keys", async () => {
        const metadata = JSON.stringify({ token: "supersecretvalue123", count: 5 });
        await handleUserScriptLog(buildLogMessage({ metadata }));

        const insertArgs = mockLogsDb.run.mock.calls[0];
        const storedMetadata = JSON.parse(insertArgs[1][6]);

        expect(storedMetadata.token).toBe("supersec...REDACTED");
        expect(storedMetadata.count).toBe(5);
    });

    it("redacts auth and password keys", async () => {
        const metadata = JSON.stringify({
            authHeader: "Bearer abc123xyz",
            password: "mypassword123",
            username: "admin",
        });
        await handleUserScriptLog(buildLogMessage({ metadata }));

        const insertArgs = mockLogsDb.run.mock.calls[0];
        const storedMetadata = JSON.parse(insertArgs[1][6]);

        expect(storedMetadata.authHeader).toContain("...REDACTED");
        expect(storedMetadata.password).toContain("...REDACTED");
        expect(storedMetadata.username).toBe("admin");
    });

    it("passes null metadata through as null", async () => {
        await handleUserScriptLog(buildLogMessage({ metadata: null }));

        const insertArgs = mockLogsDb.run.mock.calls[0];
        expect(insertArgs[1][6]).toBeNull();
    });

    it("handles non-JSON metadata gracefully", async () => {
        await handleUserScriptLog(buildLogMessage({ metadata: "not-json{{{" }));

        expect(mockLogsDb.run).toHaveBeenCalledTimes(1);
        const insertArgs = mockLogsDb.run.mock.calls[0];
        expect(insertArgs[1][6]).toBe("not-json{{{");
    });

    it("uses user-script as source in SQL insert", async () => {
        await handleUserScriptLog(buildLogMessage());

        const insertArgs = mockLogsDb.run.mock.calls[0];
        const sql = insertArgs[0] as string;
        const params = insertArgs[1] as unknown[];

        expect(sql).toContain("INSERT INTO Logs");
        expect(params[2]).toBe("user-script");
    });

    it("passes project context to SQL insert", async () => {
        await handleUserScriptLog(buildLogMessage());

        const params = mockLogsDb.run.mock.calls[0][1] as unknown[];

        // Check projectId, urlRuleId, scriptId, configId are present
        expect(params).toContain("proj-1");
        expect(params).toContain("script-1");
        expect(params).toContain("config-1");
        expect(params).toContain("rule-1");
    });

    it("includes extension version from manifest", async () => {
        await handleUserScriptLog(buildLogMessage());

        const params = mockLogsDb.run.mock.calls[0][1] as unknown[];
        expect(params).toContain("1.2.0");
    });
});
