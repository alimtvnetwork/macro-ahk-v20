/**
 * Marco Extension — URL Matcher
 *
 * Evaluates a URL against a single UrlRule's match mode.
 * Supports exact, prefix, glob, and regex matching.
 * See spec 12-project-model-and-url-rules.md §URL Matching Logic.
 */

import type { UrlRule } from "../shared/project-types";
import { logBgWarnError, BgLogTag} from "./bg-logger";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Returns true if the URL matches the given rule and is not excluded. */
export function isUrlMatch(url: string, rule: UrlRule): boolean {
    const isIncluded = evaluateMatchType(url, rule);
    const isExcluded = isIncluded && checkExcludePattern(url, rule.excludePattern);
    return isIncluded && isExcluded === false;
}

/* ------------------------------------------------------------------ */
/*  Match Mode Dispatch                                                */
/* ------------------------------------------------------------------ */

/** Evaluates the URL against the rule based on match type. */
function evaluateMatchType(url: string, rule: UrlRule): boolean {
    switch (rule.matchType) {
        case "exact":
            return isExactMatch(url, rule.pattern);
        case "prefix":
            return isPrefixMatch(url, rule.pattern);
        case "glob":
            return isGlobMatch(url, rule.pattern);
        case "regex":
            return isRegexMatch(url, rule.pattern);
        default:
            return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Match Implementations                                              */
/* ------------------------------------------------------------------ */

/** Exact match — ignores query string and fragment. */
function isExactMatch(url: string, pattern: string): boolean {
    const urlWithoutQuery = stripQueryAndFragment(url);
    const patternWithoutQuery = stripQueryAndFragment(pattern);

    return urlWithoutQuery === patternWithoutQuery;
}

/** Prefix match — URL starts with pattern. */
function isPrefixMatch(url: string, pattern: string): boolean {
    return url.startsWith(pattern);
}

/** Glob match — converts glob to regex. */
function isGlobMatch(url: string, pattern: string): boolean {
    const regexPattern = convertGlobToRegex(pattern);

    try {
        const regex = new RegExp(regexPattern);
        return regex.test(url);
    } catch {
        return false;
    }
}

/** Regex match with error handling. */
function isRegexMatch(url: string, pattern: string): boolean {
    try {
        const regex = new RegExp(pattern);
        return regex.test(url);
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Strips query string and fragment from a URL. */
function stripQueryAndFragment(url: string): string {
    const queryIndex = url.indexOf("?");
    const fragmentIndex = url.indexOf("#");

    let endIndex = url.length;

    const hasQuery = queryIndex >= 0;
    const hasFragment = fragmentIndex >= 0;

    if (hasQuery) {
        endIndex = queryIndex;
    }

    const isFragmentEarlier = hasFragment && fragmentIndex < endIndex;

    if (isFragmentEarlier) {
        endIndex = fragmentIndex;
    }

    return url.slice(0, endIndex);
}

/** Converts a glob pattern to a regex string. */
function convertGlobToRegex(glob: string): string {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");

    return `^${escaped}$`;
}

/* ------------------------------------------------------------------ */
/*  Exclude Pattern                                                    */
/* ------------------------------------------------------------------ */

/** Checks if the URL pathname matches the exclude regex pattern. */
function checkExcludePattern(
    url: string,
    excludePattern: string | undefined,
): boolean {
    const hasPattern = excludePattern !== undefined && excludePattern !== "";
    const isMissingPattern = hasPattern === false;

    if (isMissingPattern) {
        return false;
    }

    try {
        const pathname = extractPathname(url);
        const regex = new RegExp(excludePattern!);

        return regex.test(pathname);
    } catch {
        logBgWarnError(BgLogTag.URL_MATCHER, `Invalid excludePattern: ${excludePattern}`);
        return false;
    }
}

/** Extracts the pathname from a URL string. */
function extractPathname(url: string): string {
    try {
        return new URL(url).pathname;
    } catch {
        return url;
    }
}
