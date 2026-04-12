/**
 * Riseup Macro SDK — Auth Token Utilities
 *
 * Static utility class for JWT token validation, normalization,
 * and extraction from various storage sources.
 *
 * These utilities are site-agnostic and reusable across any
 * website using JWT bearer tokens or Supabase auth.
 *
 * @see spec/13-features/cross-project-sync.md — Shared asset model
 * @see standalone-scripts/macro-controller/src/auth-resolve.ts — Consumer
 */

/**
 * Pure, stateless auth token utilities.
 * Exposed on `window.marco.authUtils` for runtime access by consumers.
 */
export class AuthTokenUtils {
    /**
     * Strip "Bearer " prefix and whitespace from a raw token string.
     */
    static normalizeBearerToken(raw: string): string {
        return (raw || "").trim().replace(/^Bearer\s+/i, "");
    }

    /**
     * Check if a string looks like a JWT (starts with eyJ, has 3 dot-separated parts).
     */
    static isJwtToken(raw: string): boolean {
        const token = AuthTokenUtils.normalizeBearerToken(raw);

        return token.startsWith("eyJ") && token.split(".").length === 3;
    }

    /**
     * Validate that a token is usable: non-empty, no whitespace, not JSON, and is a JWT.
     */
    static isUsableToken(raw: string): boolean {
        const token = AuthTokenUtils.normalizeBearerToken(raw);

        if (!token || token.length < 10) {
            return false;
        }

        if (/\s/.test(token)) {
            return false;
        }

        if (token[0] === "{" || token[0] === "[") {
            return false;
        }

        return AuthTokenUtils.isJwtToken(token);
    }

    /**
     * Extract a bearer token from an unknown value.
     * Handles raw strings, JSON objects with token/access_token/authToken/sessionId fields.
     */
    static extractBearerTokenFromUnknown(raw: unknown): string {
        if (typeof raw !== "string") {
            return "";
        }

        const normalized = AuthTokenUtils.normalizeBearerToken(raw);
        if (AuthTokenUtils.isUsableToken(normalized)) {
            return normalized;
        }

        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            if (parsed === null || typeof parsed !== "object") {
                return "";
            }

            const candidates = [
                parsed.token,
                parsed.access_token,
                parsed.authToken,
                parsed.sessionId,
            ];

            for (const candidate of candidates) {
                if (typeof candidate !== "string") {
                    continue;
                }

                const nested = AuthTokenUtils.normalizeBearerToken(candidate);
                if (AuthTokenUtils.isUsableToken(nested)) {
                    return nested;
                }
            }
        } catch (e) {
            console.debug(
                "[AuthTokenUtils] extractBearerTokenFromUnknown: value is not parseable JSON, skipping object extraction —",
                e instanceof Error ? e.message : String(e),
            );
        }

        return "";
    }

    /**
     * Scan localStorage for Supabase auth keys matching `sb-*-auth-token*`.
     * Returns the first usable access_token found, or empty string.
     *
     * @param onFound - Optional callback when a token is found (key, tokenLength).
     * @param onScanError - Optional callback when scan fails.
     */
    static scanSupabaseLocalStorage(
        onFound?: (key: string, tokenLength: number) => void,
        onScanError?: (error: Error | string) => void,
    ): string {
        try {
            const keys = AuthTokenUtils.collectLocalStorageKeys();

            for (const key of keys) {
                if (!key.startsWith("sb-") || !key.includes("-auth-token")) {
                    continue;
                }

                const raw = localStorage.getItem(key) || "";
                if (!raw || raw.length < 20) {
                    continue;
                }

                const token = AuthTokenUtils.extractSupabaseTokenFromRaw(key, raw, onFound);
                if (token) {
                    return token;
                }
            }
        } catch (scanErr) {
            if (onScanError) {
                onScanError(scanErr);
            } else {
                console.warn(
                    "[AuthTokenUtils] Supabase localStorage scan failed —",
                    scanErr instanceof Error ? scanErr.message : String(scanErr),
                );
            }
        }

        return "";
    }

    private static collectLocalStorageKeys(): string[] {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                keys.push(key);
            }
        }
        return keys;
    }

    /**
     * Extract a Supabase access_token from a raw localStorage value.
     * Tries JSON parse first, falls back to treating as raw token.
     *
     * @param key - The localStorage key (for logging/callbacks).
     * @param raw - The raw string value from localStorage.
     * @param onFound - Optional callback when a token is found.
     */
    static extractSupabaseTokenFromRaw(
        key: string,
        raw: string,
        onFound?: (key: string, tokenLength: number) => void,
    ): string {
        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;

            // Direct access_token field
            const accessToken = parsed.access_token;
            if (typeof accessToken === "string" && AuthTokenUtils.isUsableToken(accessToken)) {
                onFound?.(key, accessToken.length);

                return accessToken;
            }

            // Nested session.access_token
            const session = (parsed.currentSession || parsed.session) as
                | Record<string, unknown>
                | undefined;
            if (
                session !== undefined &&
                typeof session.access_token === "string" &&
                AuthTokenUtils.isUsableToken(session.access_token as string)
            ) {
                onFound?.(key, (session.access_token as string).length);

                return session.access_token as string;
            }
        } catch (jsonErr) {
            // JSON parse failed — try treating the raw value as a plain token
            console.debug(
                "[AuthTokenUtils] extractSupabaseTokenFromRaw: localStorage[" +
                    key +
                    "] is not JSON, trying as raw token —",
                jsonErr instanceof Error ? jsonErr.message : String(jsonErr),
            );

            const token = AuthTokenUtils.normalizeBearerToken(raw);
            if (AuthTokenUtils.isUsableToken(token)) {
                onFound?.(key, token.length);

                return token;
            }
        }

        return "";
    }
}
