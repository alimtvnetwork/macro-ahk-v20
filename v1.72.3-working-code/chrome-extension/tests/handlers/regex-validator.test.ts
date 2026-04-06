/**
 * Unit tests — Regex Validator
 *
 * Tests regex validation rules: length, syntax, ReDoS.
 */

import { describe, it, expect } from "vitest";
import { validateRegexPattern } from "../../src/background/regex-validator";

describe("Regex Validator", () => {
    it("accepts valid regex", () => {
        const result = validateRegexPattern("^https://lovable\\.dev/");

        expect(result.isValid).toBe(true);
        expect(result.errorMessage).toBeUndefined();
    });

    it("rejects pattern exceeding 500 chars", () => {
        const longPattern = "a".repeat(501);
        const result = validateRegexPattern(longPattern);

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain("too long");
    });

    it("rejects invalid regex syntax", () => {
        const result = validateRegexPattern("[invalid");

        expect(result.isValid).toBe(false);
        expect(result.errorMessage).toContain("Invalid regex");
    });

    it("warns on ReDoS-prone patterns", () => {
        const result = validateRegexPattern("(a+)+b");

        expect(result.isValid).toBe(true);
        expect(result.warningMessage).toContain("slow");
    });

    it("accepts safe patterns with no warnings", () => {
        const result = validateRegexPattern("^https://example\\.com/.*$");

        expect(result.isValid).toBe(true);
        expect(result.warningMessage).toBeUndefined();
    });
});
