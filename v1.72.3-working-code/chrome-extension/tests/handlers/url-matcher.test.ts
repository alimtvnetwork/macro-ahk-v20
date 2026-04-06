/**
 * Unit tests — URL Matcher
 *
 * Tests exact, prefix, glob, and regex matching.
 */

import { describe, it, expect } from "vitest";
import { isUrlMatch } from "../../src/background/url-matcher";

describe("URL Matcher — Exact", () => {
    it("matches identical URLs", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc", {
            pattern: "https://lovable.dev/projects/abc",
            matchType: "exact",
        });

        expect(result).toBe(true);
    });

    it("ignores query string for exact match", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc?tab=code", {
            pattern: "https://lovable.dev/projects/abc",
            matchType: "exact",
        });

        expect(result).toBe(true);
    });

    it("rejects non-matching URL", () => {
        const result = isUrlMatch("https://lovable.dev/projects/xyz", {
            pattern: "https://lovable.dev/projects/abc",
            matchType: "exact",
        });

        expect(result).toBe(false);
    });
});

describe("URL Matcher — Prefix", () => {
    it("matches URL starting with prefix", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc-123", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
        });

        expect(result).toBe(true);
    });

    it("rejects URL not starting with prefix", () => {
        const result = isUrlMatch("https://google.com/search", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
        });

        expect(result).toBe(false);
    });
});

describe("URL Matcher — Glob", () => {
    it("matches wildcard glob pattern", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc-123", {
            pattern: "https://lovable.dev/projects/*",
            matchType: "glob",
        });

        expect(result).toBe(true);
    });

    it("matches subdomain glob pattern", () => {
        const result = isUrlMatch("https://preview.lovable.app/page", {
            pattern: "https://*.lovable.app/*",
            matchType: "glob",
        });

        expect(result).toBe(true);
    });

    it("rejects non-matching glob", () => {
        const result = isUrlMatch("https://google.com/search", {
            pattern: "https://lovable.dev/*",
            matchType: "glob",
        });

        expect(result).toBe(false);
    });
});

describe("URL Matcher — Regex", () => {
    it("matches regex pattern", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc-123", {
            pattern: "^https://lovable\\.dev/projects/[a-z0-9-]+$",
            matchType: "regex",
        });

        expect(result).toBe(true);
    });

    it("rejects non-matching regex", () => {
        const result = isUrlMatch("https://google.com", {
            pattern: "^https://lovable\\.dev/",
            matchType: "regex",
        });

        expect(result).toBe(false);
    });

    it("handles invalid regex gracefully", () => {
        const result = isUrlMatch("https://test.com", {
            pattern: "[invalid",
            matchType: "regex",
        });

        expect(result).toBe(false);
    });
});
