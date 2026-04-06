/**
 * Marco Extension — Cookie Resolution Helpers
 *
 * Shared candidate URL resolution for platform session cookies.
 */

const DEFAULT_COOKIE_URL_CANDIDATES = [
    "https://lovable.dev/",
    "https://www.lovable.dev/",
    "https://lovable.app/",
    "https://www.lovable.app/",
    "https://lovableproject.com/",
    "https://www.lovableproject.com/",
    "https://localhost/",
    "http://localhost/",
    "https://127.0.0.1/",
    "http://127.0.0.1/",
] as const;

/** Builds an ordered list of candidate URLs for chrome.cookies.get. */
export function buildCookieUrlCandidates(primaryUrl?: string | null): string[] {
    const candidates = new Set<string>();

    appendUrlCandidate(candidates, primaryUrl);

    for (const url of DEFAULT_COOKIE_URL_CANDIDATES) {
        candidates.add(url);
    }

    return [...candidates];
}

/** Reads the first matching cookie object from the resolved candidate URLs. */
export async function readCookieFromCandidates(
    cookieName: string,
    primaryUrl?: string | null,
): Promise<chrome.cookies.Cookie | null> {
    const candidateUrls = buildCookieUrlCandidates(primaryUrl);

    for (const url of candidateUrls) {
        try {
            const cookie = await chrome.cookies.get({ url, name: cookieName });

            if (cookie !== null) {
                return cookie;
            }
        } catch {
            // Try the next candidate URL.
        }
    }

    return null;
}

/** Reads the first matching cookie value from the resolved candidate URLs. */
export async function readCookieValueFromCandidates(
    cookieName: string,
    primaryUrl?: string | null,
): Promise<string | null> {
    const cookie = await readCookieFromCandidates(cookieName, primaryUrl);
    return cookie?.value ?? null;
}

/** Adds a normalized HTTP(S) URL candidate and its origin. */
function appendUrlCandidate(
    candidates: Set<string>,
    rawUrl?: string | null,
): void {
    if (!rawUrl) {
        return;
    }

    try {
        const parsed = new URL(rawUrl);
        const isHttpUrl = parsed.protocol === "http:" || parsed.protocol === "https:";

        if (!isHttpUrl) {
            return;
        }

        candidates.add(parsed.href);
        candidates.add(`${parsed.origin}/`);
    } catch {
        // Ignore malformed candidate URLs.
    }
}
