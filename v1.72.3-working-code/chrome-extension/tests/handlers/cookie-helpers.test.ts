/**
 * Unit tests — Cookie Helpers
 *
 * Tests URL candidate building and cookie resolution logic.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildCookieUrlCandidates, readCookieFromCandidates, readCookieValueFromCandidates } from "../../src/background/cookie-helpers";

// Mock chrome.cookies API
const mockCookiesGet = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).chrome = {
        cookies: { get: mockCookiesGet },
    };
});

describe("buildCookieUrlCandidates", () => {
    it("returns default candidates when no primary URL", () => {
        const candidates = buildCookieUrlCandidates();
        expect(candidates).toContain("https://lovable.dev/");
        expect(candidates).toContain("https://lovable.app/");
        expect(candidates).toContain("https://localhost/");
        expect(candidates.length).toBeGreaterThanOrEqual(6);
    });

    it("prepends primary URL when provided", () => {
        const candidates = buildCookieUrlCandidates("https://custom.example.com/page");
        expect(candidates[0]).toBe("https://custom.example.com/page");
        expect(candidates).toContain("https://custom.example.com/");
    });

    it("deduplicates when primary URL is a default", () => {
        const candidates = buildCookieUrlCandidates("https://lovable.dev/");
        const lovableCount = candidates.filter((c) => c === "https://lovable.dev/").length;
        expect(lovableCount).toBe(1);
    });

    it("ignores non-http URLs", () => {
        const candidates = buildCookieUrlCandidates("chrome-extension://abc123");
        expect(candidates).not.toContain("chrome-extension://abc123");
        // Should still have defaults
        expect(candidates).toContain("https://lovable.dev/");
    });

    it("ignores malformed URLs", () => {
        const candidates = buildCookieUrlCandidates("not-a-url");
        expect(candidates).toContain("https://lovable.dev/");
    });

    it("handles null primary URL", () => {
        const candidates = buildCookieUrlCandidates(null);
        expect(candidates.length).toBeGreaterThanOrEqual(6);
    });
});

describe("readCookieFromCandidates", () => {
    it("returns cookie from first matching URL", async () => {
        const fakeCookie = { name: "session", value: "abc123" };
        mockCookiesGet.mockResolvedValueOnce(null).mockResolvedValueOnce(fakeCookie);

        const result = await readCookieFromCandidates("session");
        expect(result).toEqual(fakeCookie);
        expect(mockCookiesGet).toHaveBeenCalledTimes(2);
    });

    it("returns null when no candidate has the cookie", async () => {
        mockCookiesGet.mockResolvedValue(null);

        const result = await readCookieFromCandidates("missing-cookie");
        expect(result).toBeNull();
    });

    it("skips URLs that throw errors", async () => {
        const fakeCookie = { name: "session", value: "found" };
        mockCookiesGet
            .mockRejectedValueOnce(new Error("access denied"))
            .mockResolvedValueOnce(fakeCookie);

        const result = await readCookieFromCandidates("session");
        expect(result).toEqual(fakeCookie);
    });
});

describe("readCookieValueFromCandidates", () => {
    it("returns cookie value string", async () => {
        mockCookiesGet.mockResolvedValueOnce({ name: "token", value: "xyz" });

        const value = await readCookieValueFromCandidates("token");
        expect(value).toBe("xyz");
    });

    it("returns null when cookie not found", async () => {
        mockCookiesGet.mockResolvedValue(null);

        const value = await readCookieValueFromCandidates("missing");
        expect(value).toBeNull();
    });
});
