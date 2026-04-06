/**
 * Unit tests — Shared Utilities
 *
 * Tests generateId, nowTimestamp, and computeSha256.
 */

import { describe, it, expect } from "vitest";
import { generateId, nowTimestamp, computeSha256 } from "../../src/shared/utils";

describe("generateId", () => {
    it("returns a valid UUID v4 string", () => {
        const id = generateId();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

        expect(uuidRegex.test(id)).toBe(true);
    });

    it("generates unique IDs on each call", () => {
        const id1 = generateId();
        const id2 = generateId();
        const id3 = generateId();

        expect(id1).not.toBe(id2);
        expect(id2).not.toBe(id3);
    });
});

describe("nowTimestamp", () => {
    it("returns a valid ISO 8601 string", () => {
        const timestamp = nowTimestamp();
        const parsed = new Date(timestamp);

        expect(parsed.toISOString()).toBe(timestamp);
    });

    it("returns a timestamp close to current time", () => {
        const before = Date.now();
        const timestamp = nowTimestamp();
        const after = Date.now();
        const tsMs = new Date(timestamp).getTime();

        expect(tsMs).toBeGreaterThanOrEqual(before);
        expect(tsMs).toBeLessThanOrEqual(after);
    });
});

describe("computeSha256", () => {
    it("returns a 64-character hex string", async () => {
        const hash = await computeSha256("hello");

        expect(hash).toHaveLength(64);
        expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    });

    it("produces deterministic output", async () => {
        const hash1 = await computeSha256("test content");
        const hash2 = await computeSha256("test content");

        expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", async () => {
        const hash1 = await computeSha256("input A");
        const hash2 = await computeSha256("input B");

        expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", async () => {
        const hash = await computeSha256("");

        expect(hash).toHaveLength(64);
        // Known SHA-256 of empty string
        expect(hash).toBe(
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        );
    });

    it("handles unicode content", async () => {
        const hash = await computeSha256("こんにちは🌍");

        expect(hash).toHaveLength(64);
    });
});
