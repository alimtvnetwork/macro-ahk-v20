/**
 * Unit tests — URL Matcher Edge Cases
 *
 * Tests exclude patterns, fragment handling, glob edge cases,
 * and unknown match types.
 */

import { describe, it, expect } from "vitest";
import { isUrlMatch } from "../../src/background/url-matcher";

describe("URL Matcher — Exclude Patterns", () => {
    it("excludes URL matching excludePattern", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc/settings", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
            excludePattern: "/settings$",
        });

        expect(result).toBe(false);
    });

    it("includes URL not matching excludePattern", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc/editor", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
            excludePattern: "/settings$",
        });

        expect(result).toBe(true);
    });

    it("handles undefined excludePattern", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
            excludePattern: undefined,
        });

        expect(result).toBe(true);
    });

    it("handles empty string excludePattern", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
            excludePattern: "",
        });

        expect(result).toBe(true);
    });

    it("handles invalid excludePattern regex gracefully", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
            excludePattern: "[invalid",
        });

        // Invalid regex should not exclude (returns false from checkExcludePattern)
        expect(result).toBe(true);
    });
});

describe("URL Matcher — Fragment Handling", () => {
    it("ignores fragment in exact match", () => {
        const result = isUrlMatch("https://lovable.dev/page#section", {
            pattern: "https://lovable.dev/page",
            matchType: "exact",
        });

        expect(result).toBe(true);
    });

    it("ignores both query and fragment in exact match", () => {
        const result = isUrlMatch("https://lovable.dev/page?q=1#top", {
            pattern: "https://lovable.dev/page?other=2",
            matchType: "exact",
        });

        expect(result).toBe(true);
    });

    it("ignores fragment in pattern for exact match", () => {
        const result = isUrlMatch("https://lovable.dev/page", {
            pattern: "https://lovable.dev/page#footer",
            matchType: "exact",
        });

        expect(result).toBe(true);
    });
});

describe("URL Matcher — Glob Edge Cases", () => {
    it("handles single-char wildcard (?)", () => {
        const result = isUrlMatch("https://lovable.dev/a1", {
            pattern: "https://lovable.dev/a?",
            matchType: "glob",
        });

        expect(result).toBe(true);
    });

    it("rejects partial glob match (anchored)", () => {
        const result = isUrlMatch("https://lovable.dev/projects/abc/extra/path", {
            pattern: "https://lovable.dev/projects/?",
            matchType: "glob",
        });

        expect(result).toBe(false);
    });

    it("handles glob with special regex chars in URL", () => {
        const result = isUrlMatch("https://lovable.dev/page.html", {
            pattern: "https://lovable.dev/*.html",
            matchType: "glob",
        });

        expect(result).toBe(true);
    });
});

describe("URL Matcher — Unknown Match Type", () => {
    it("returns false for unknown match type", () => {
        const result = isUrlMatch("https://lovable.dev/", {
            pattern: "https://lovable.dev/",
            matchType: "unknown" as any,
        });

        expect(result).toBe(false);
    });
});

describe("URL Matcher — Prefix Edge Cases", () => {
    it("matches exact URL as prefix", () => {
        const result = isUrlMatch("https://lovable.dev/", {
            pattern: "https://lovable.dev/",
            matchType: "prefix",
        });

        expect(result).toBe(true);
    });

    it("rejects when URL is shorter than prefix", () => {
        const result = isUrlMatch("https://lovable.dev", {
            pattern: "https://lovable.dev/projects/",
            matchType: "prefix",
        });

        expect(result).toBe(false);
    });
});
