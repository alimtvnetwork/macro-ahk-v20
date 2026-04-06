/**
 * Marco Extension — Script & Config Types
 *
 * Defines stored script and config records for chrome.storage.local.
 */

/** A stored user script record. */
export interface StoredScript {
    id: string;
    name: string;
    description?: string;
    code: string;
    /** Relative file path within the extension (e.g., "projects/scripts/macro-controller/macro-looping.js") */
    filePath?: string;
    /** If true, filePath is an absolute URL rather than relative to extension root */
    isAbsolute?: boolean;
    order: number;
    isEnabled: boolean;
    runAt?: "document_start" | "document_idle" | "document_end";
    configBinding?: string;
    themeBinding?: string;
    cookieBinding?: string;
    isIife?: boolean;
    hasDomUsage?: boolean;
    /** If false, script is only injected manually (via Popup Run button). Default: true. */
    autoInject?: boolean;
    /** If true, this script is a global utility loaded before all dependent scripts. */
    isGlobal?: boolean;
    /** IDs of scripts this script depends on (loaded first). */
    dependencies?: string[];
    /** Numeric load order (lower = loaded first). Global scripts default to 1. */
    loadOrder?: number;
    /** Remote URL to fetch the latest version of this script. */
    updateUrl?: string;
    /** Last time the script was updated from its updateUrl (ISO string). */
    lastUpdateCheck?: string;
    createdAt: string;
    updatedAt: string;
}

/** A stored JSON config record. */
export interface StoredConfig {
    id: string;
    name: string;
    description?: string;
    json: string;
    createdAt: string;
    updatedAt: string;
}
