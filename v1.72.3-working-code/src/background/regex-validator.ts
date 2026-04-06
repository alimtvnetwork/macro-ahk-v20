/**
 * Marco Extension — Regex Validator
 *
 * Validates user-entered regex patterns for URL matching.
 * Enforces length limits, syntax checks, and ReDoS heuristics.
 * See spec 12-project-model-and-url-rules.md §Regex Safety.
 */

import { MAX_REGEX_LENGTH } from "../shared/constants";
import type { RegexValidation } from "../shared/types";

/* ------------------------------------------------------------------ */
/*  ReDoS Heuristic Patterns                                           */
/* ------------------------------------------------------------------ */

const REDOS_PATTERNS: RegExp[] = [
    /\([^)]*[+*][^)]*\)[+*]/,
    /\([^)]*\.\*[^)]*\)\{/,
];

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Validates a regex pattern for safety and correctness. */
export function validateRegexPattern(pattern: string): RegexValidation {
    const isTooLong = pattern.length > MAX_REGEX_LENGTH;

    if (isTooLong) {
        return {
            isValid: false,
            errorMessage: `Pattern too long (max ${MAX_REGEX_LENGTH} characters)`,
        };
    }

    const syntaxResult = checkSyntax(pattern);
    const hasSyntaxError = syntaxResult !== null;

    if (hasSyntaxError) {
        return {
            isValid: false,
            errorMessage: syntaxResult!,
        };
    }

    const redosWarning = checkRedosHeuristics(pattern);
    const hasWarning = redosWarning !== null;

    if (hasWarning) {
        return {
            isValid: true,
            warningMessage: redosWarning!,
        };
    }

    return { isValid: true };
}

/* ------------------------------------------------------------------ */
/*  Internal Checks                                                    */
/* ------------------------------------------------------------------ */

/** Checks if the pattern is syntactically valid. */
function checkSyntax(pattern: string): string | null {
    try {
        new RegExp(pattern);
        return null;
    } catch (syntaxError) {
        const errorMessage = syntaxError instanceof Error
            ? syntaxError.message
            : String(syntaxError);

        return `Invalid regex: ${errorMessage}`;
    }
}

/** Checks for common ReDoS-prone patterns. */
function checkRedosHeuristics(pattern: string): string | null {
    for (const check of REDOS_PATTERNS) {
        const isRedosRisk = check.test(pattern);

        if (isRedosRisk) {
            return "This pattern may be slow on long URLs. Consider simplifying.";
        }
    }

    return null;
}
