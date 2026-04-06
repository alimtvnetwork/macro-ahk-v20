/**
 * Marco Extension — Utility Functions
 *
 * Cross-module helpers used by background, popup, and options.
 */

/** Generates a UUID v4 identifier. */
export function generateId(): string {
    return crypto.randomUUID();
}

/** Returns current ISO 8601 timestamp. */
export function nowTimestamp(): string {
    return new Date().toISOString();
}

/** Computes SHA-256 hex digest of a string. */
export async function computeSha256(content: string): Promise<string> {
    const buffer = new TextEncoder().encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));

    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
