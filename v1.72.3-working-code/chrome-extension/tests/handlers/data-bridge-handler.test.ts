/**
 * Marco Extension — Data Bridge Handler Tests
 *
 * Tests for USER_SCRIPT_DATA_* message handling (Spec 42).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    handleDataSet,
    handleDataGet,
    handleDataDelete,
    handleDataKeys,
    handleDataGetAll,
    handleDataClear,
} from "@/background/handlers/data-bridge-handler";
import type { MessageRequest } from "@/shared/messages";

/* ── Mock chrome.storage.local ── */

let storageData: Record<string, unknown> = {};

(globalThis as any).chrome = {
    storage: {
        local: {
            get: vi.fn(async (keys: string | string[]) => {
                const result: Record<string, unknown> = {};
                const keyList = Array.isArray(keys) ? keys : [keys];
                for (const k of keyList) {
                    if (storageData[k] !== undefined) {
                        result[k] = storageData[k];
                    }
                }
                return result;
            }),
            set: vi.fn(async (items: Record<string, unknown>) => {
                Object.assign(storageData, items);
            }),
        },
    },
};

/* ── Helpers ── */

function setMsg(key: string, value: unknown, projectId = "proj-1"): MessageRequest {
    return { type: "USER_SCRIPT_DATA_SET", key, value, projectId, scriptId: "s-1" } as unknown as MessageRequest;
}

function getMsg(key: string): MessageRequest {
    return { type: "USER_SCRIPT_DATA_GET", key } as unknown as MessageRequest;
}

function deleteMsg(key: string): MessageRequest {
    return { type: "USER_SCRIPT_DATA_DELETE", key } as unknown as MessageRequest;
}

function keysMsg(prefix: string): MessageRequest {
    return { type: "USER_SCRIPT_DATA_KEYS", prefix } as unknown as MessageRequest;
}

function getAllMsg(prefix: string): MessageRequest {
    return { type: "USER_SCRIPT_DATA_GET_ALL", prefix } as unknown as MessageRequest;
}

function clearMsg(prefix: string): MessageRequest {
    return { type: "USER_SCRIPT_DATA_CLEAR", prefix } as unknown as MessageRequest;
}

describe("Data Bridge Handler", () => {
    beforeEach(() => {
        storageData = {};
        vi.clearAllMocks();
    });

    describe("SET + GET", () => {
        it("stores and retrieves a value", async () => {
            await handleDataSet(setMsg("proj-1::myKey", "hello"));
            const result = await handleDataGet(getMsg("proj-1::myKey"));

            expect(result.value).toBe("hello");
        });

        it("stores complex objects", async () => {
            const value = { count: 5, items: [1, 2, 3] };
            await handleDataSet(setMsg("proj-1::obj", value));
            const result = await handleDataGet(getMsg("proj-1::obj"));

            expect(result.value).toEqual(value);
        });

        it("overwrites existing key", async () => {
            await handleDataSet(setMsg("proj-1::k", "first"));
            await handleDataSet(setMsg("proj-1::k", "second"));
            const result = await handleDataGet(getMsg("proj-1::k"));

            expect(result.value).toBe("second");
        });

        it("returns undefined for missing key", async () => {
            const result = await handleDataGet(getMsg("proj-1::missing"));

            expect(result.value).toBeUndefined();
        });
    });

    describe("DELETE", () => {
        it("removes an existing key", async () => {
            await handleDataSet(setMsg("proj-1::x", 42));
            await handleDataDelete(deleteMsg("proj-1::x"));
            const result = await handleDataGet(getMsg("proj-1::x"));

            expect(result.value).toBeUndefined();
        });

        it("succeeds on non-existent key", async () => {
            const result = await handleDataDelete(deleteMsg("proj-1::nope"));

            expect(result.isOk).toBe(true);
        });
    });

    describe("KEYS", () => {
        it("returns stripped keys for a prefix", async () => {
            await handleDataSet(setMsg("proj-1::a", 1));
            await handleDataSet(setMsg("proj-1::b", 2));
            await handleDataSet(setMsg("proj-2::c", 3));

            const result = await handleDataKeys(keysMsg("proj-1::"));

            expect(result.keys).toContain("a");
            expect(result.keys).toContain("b");
            expect(result.keys).not.toContain("c");
        });

        it("returns empty array when no keys match", async () => {
            const result = await handleDataKeys(keysMsg("proj-99::"));

            expect(result.keys).toEqual([]);
        });
    });

    describe("GET_ALL", () => {
        it("returns all entries for a prefix", async () => {
            await handleDataSet(setMsg("proj-1::x", 10));
            await handleDataSet(setMsg("proj-1::y", 20));

            const result = await handleDataGetAll(getAllMsg("proj-1::"));

            expect(result.entries).toEqual({ x: 10, y: 20 });
        });
    });

    describe("CLEAR", () => {
        it("removes all entries for a prefix", async () => {
            await handleDataSet(setMsg("proj-1::a", 1));
            await handleDataSet(setMsg("proj-1::b", 2));
            await handleDataSet(setMsg("proj-2::c", 3));

            const result = await handleDataClear(clearMsg("proj-1::"));

            expect(result.cleared).toBe(2);

            const remaining = await handleDataKeys(keysMsg("proj-2::"));
            expect(remaining.keys).toContain("c");
        });
    });

    describe("Validation", () => {
        it("rejects key longer than 256 chars", async () => {
            const longKey = "proj-1::" + "a".repeat(250);
            const result = await handleDataSet(setMsg(longKey, "v"));

            expect(result.isOk).toBe(false);
            expect(result.errorMessage).toContain("256");
        });

        it("rejects value larger than 1 MB", async () => {
            const bigValue = "x".repeat(1_100_000);
            const result = await handleDataSet(setMsg("proj-1::big", bigValue));

            expect(result.isOk).toBe(false);
            expect(result.errorMessage).toContain("byte limit");
        });

        it("rejects key with control characters", async () => {
            const result = await handleDataSet(setMsg("proj-1::bad\x00key", "v"));

            expect(result.isOk).toBe(false);
            expect(result.errorMessage).toContain("control characters");
        });
    });

    describe("Project isolation", () => {
        it("project A cannot read project B data", async () => {
            await handleDataSet(setMsg("projA::secret", "hidden"));
            const result = await handleDataGet(getMsg("projB::secret"));

            expect(result.value).toBeUndefined();
        });

        it("global namespace accessible across projects", async () => {
            await handleDataSet(setMsg("__global__::shared", "visible", "__global__"));
            const result = await handleDataGet(getMsg("__global__::shared"));

            expect(result.value).toBe("visible");
        });
    });
});
