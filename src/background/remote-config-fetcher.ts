/**
 * Marco Extension — Remote Config Fetcher
 *
 * Fetches and merges remote configuration with the 3-tier cascade:
 * Remote Endpoint > Local Overrides > Bundled Defaults.
 * See spec 05-content-script-adaptation.md §Config Cascade.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

import { logCaughtError, logBgWarnError, BgLogTag} from "./bg-logger";

export interface RemoteConfigSettings {
    isEnabled: boolean;
    endpointUrl: string;
    refreshIntervalMinutes: number;
    mergeStrategy: "deep" | "replace";
    authHeader: string;
}

export interface ConfigCascadeResult {
    config: Record<string, unknown>;
    source: "remote" | "local" | "hardcoded";
    lastFetchedAt: string | null;
    lastFetchError: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const REMOTE_CONFIG_KEY = "marco_remote_config";
const REMOTE_CACHE_KEY = "marco_remote_config_cache";
const DEFAULT_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/*  Module State                                                       */
/* ------------------------------------------------------------------ */

let cachedRemoteConfig: Record<string, unknown> | null = null;
let lastFetchedAt: string | null = null;
let lastFetchError: string | null = null;

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Resolves config using the 3-tier cascade. */
export async function resolveConfigCascade(
    bundledDefaults: Record<string, unknown>,
): Promise<ConfigCascadeResult> {
    const settings = await readRemoteSettings();
    const localOverrides = await readLocalOverrides();

    const isRemoteEnabled = settings !== null && settings.isEnabled;

    if (isRemoteEnabled) {
        const remoteConfig = await fetchRemoteConfig(settings!);
        const hasRemote = remoteConfig !== null;

        if (hasRemote) {
            const merged = mergeConfigs(
                bundledDefaults,
                localOverrides,
                remoteConfig!,
                settings!.mergeStrategy,
            );

            return buildResult(merged, "remote");
        }
    }

    const hasLocal = Object.keys(localOverrides).length > 0;

    if (hasLocal) {
        const merged = { ...bundledDefaults, ...localOverrides };
        return buildResult(merged, "local");
    }

    return buildResult(bundledDefaults, "hardcoded");
}

/** Returns the last fetch status for display. */
export function getRemoteFetchStatus(): {
    lastFetchedAt: string | null;
    lastFetchError: string | null;
} {
    return { lastFetchedAt, lastFetchError };
}

/* ------------------------------------------------------------------ */
/*  Remote Fetch                                                       */
/* ------------------------------------------------------------------ */

/** Fetches config from the remote endpoint. */
async function fetchRemoteConfig(
    settings: RemoteConfigSettings,
): Promise<Record<string, unknown> | null> {
    const isUrlMissing = settings.endpointUrl === "";

    if (isUrlMissing) {
        return getCachedConfig();
    }

    try {
        const headers = buildFetchHeaders(settings.authHeader);
        const controller = new AbortController();
        const timeoutId = setTimeout(
            () => controller.abort(),
            DEFAULT_TIMEOUT_MS,
        );

        const response = await fetch(settings.endpointUrl, {
            method: "GET",
            headers,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const isResponseOk = response.ok;

        if (isResponseOk) {
            return handleSuccessfulFetch(response);
        }

        return handleFailedFetch(response.status);
    } catch (fetchError) {
        return handleFetchException(fetchError);
    }
}

/** Handles a successful remote config response. */
async function handleSuccessfulFetch(
    response: Response,
): Promise<Record<string, unknown>> {
    const json = (await response.json()) as Record<string, unknown>;

    cachedRemoteConfig = json;
    lastFetchedAt = new Date().toISOString();
    lastFetchError = null;

    await persistCache(json);
    logFetchSuccess();

    return json;
}

/** Handles a non-OK HTTP response. */
function handleFailedFetch(
    status: number,
): Record<string, unknown> | null {
    lastFetchError = `HTTP ${status}`;
    logBgWarnError(BgLogTag.REMOTE_CONFIG, `Fetch failed: HTTP ${status}`);

    return getCachedConfig();
}

/** Handles a fetch exception (network error, timeout). */
function handleFetchException(
    error: unknown,
): Record<string, unknown> | null {
    const errorMessage = error instanceof Error
        ? error.message
        : String(error);

    lastFetchError = errorMessage;
    logCaughtError(BgLogTag.REMOTE_CONFIG, "Fetch error", error);

    return getCachedConfig();
}

/** Returns the cached remote config, or null. */
function getCachedConfig(): Record<string, unknown> | null {
    const hasCached = cachedRemoteConfig !== null;

    if (hasCached) {
        console.log("[remote-config] Using cached config");
    }

    return cachedRemoteConfig;
}

/* ------------------------------------------------------------------ */
/*  Merge Logic                                                        */
/* ------------------------------------------------------------------ */

/** Merges configs using the 3-tier cascade. */
function mergeConfigs(
    defaults: Record<string, unknown>,
    local: Record<string, unknown>,
    remote: Record<string, unknown>,
    strategy: "deep" | "replace",
): Record<string, unknown> {
    const isReplace = strategy === "replace";

    if (isReplace) {
        return { ...defaults, ...remote };
    }

    return deepMerge(deepMerge(defaults, local), remote);
}

/** Deep-merges two objects. */
function deepMerge(
    base: Record<string, unknown>,
    overlay: Record<string, unknown>,
): Record<string, unknown> {
    const result = { ...base };

    for (const key of Object.keys(overlay)) {
        const baseValue = base[key];
        const overlayValue = overlay[key];
        const isBothObject = isPlainObject(baseValue) && isPlainObject(overlayValue);

        if (isBothObject) {
            result[key] = deepMerge(
                baseValue as Record<string, unknown>,
                overlayValue as Record<string, unknown>,
            );
        } else {
            result[key] = overlayValue;
        }
    }

    return result;
}

/** Checks if a value is a plain object. */
function isPlainObject(value: unknown): boolean {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* ------------------------------------------------------------------ */
/*  Storage Helpers                                                    */
/* ------------------------------------------------------------------ */

/** Reads remote config settings from storage. */
async function readRemoteSettings(): Promise<RemoteConfigSettings | null> {
    const stored = await chrome.storage.local.get(REMOTE_CONFIG_KEY);
    const settings = stored[REMOTE_CONFIG_KEY];
    const hasSettings = settings !== undefined && settings !== null;

    return hasSettings ? (settings as RemoteConfigSettings) : null;
}

/** Reads local config overrides from storage. */
async function readLocalOverrides(): Promise<Record<string, unknown>> {
    const stored = await chrome.storage.local.get("marco_config_overrides");
    const overrides = stored["marco_config_overrides"];
    const hasOverrides = overrides !== undefined && overrides !== null;

    return hasOverrides ? (overrides as Record<string, unknown>) : {};
}

/** Persists fetched remote config to storage as a cache. */
async function persistCache(
    config: Record<string, unknown>,
): Promise<void> {
    await chrome.storage.local.set({
        [REMOTE_CACHE_KEY]: {
            config,
            fetchedAt: new Date().toISOString(),
        },
    });
}

/** Builds fetch headers with optional auth. */
function buildFetchHeaders(authHeader: string): Record<string, string> {
    const headers: Record<string, string> = {
        "Accept": "application/json",
    };

    const hasAuth = authHeader !== "";

    if (hasAuth) {
        headers["Authorization"] = authHeader;
    }

    return headers;
}

/* ------------------------------------------------------------------ */
/*  Result Builder                                                     */
/* ------------------------------------------------------------------ */

/** Builds a ConfigCascadeResult. */
function buildResult(
    config: Record<string, unknown>,
    source: ConfigCascadeResult["source"],
): ConfigCascadeResult {
    return {
        config,
        source,
        lastFetchedAt,
        lastFetchError,
    };
}

/* ------------------------------------------------------------------ */
/*  Logging                                                            */
/* ------------------------------------------------------------------ */

/** Logs a successful fetch. */
function logFetchSuccess(): void {
    console.log("[remote-config] Remote config fetched successfully");
}
