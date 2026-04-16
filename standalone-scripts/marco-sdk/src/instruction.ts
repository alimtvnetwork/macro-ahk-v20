/**
 * Marco SDK — Project Instruction Manifest
 *
 * Global shared SDK. Injected first (loadOrder: 0) into MAIN world.
 * Creates and freezes `window.marco` namespace.
 */

export interface SeedTargetUrl {
    pattern: string;
    matchType: "glob" | "regex" | "exact";
}

export interface SeedCookie {
    cookieName: string;
    url: string;
    role: "session" | "refresh" | "other";
    description: string;
}

export interface SeedBlock {
    /** Deterministic ID for chrome.storage.local */
    id: string;
    /** Whether to auto-seed on extension install/update */
    seedOnInstall: boolean;
    /** Whether user can remove this script */
    isRemovable: boolean;
    /** Whether to auto-inject without explicit user action */
    autoInject: boolean;
    /** When to inject: document_start, document_idle, document_end */
    runAt?: string;
    /** Cookie name this script's auth depends on */
    cookieBinding?: string;
    /** URL patterns where this script should be injected */
    targetUrls: SeedTargetUrl[];
    /** Cookies the extension should monitor for this project */
    cookies: SeedCookie[];
    /** Arbitrary runtime settings */
    settings: Record<string, unknown>;
    /** Deterministic IDs for config entries (key → seedId) */
    configSeedIds?: Record<string, string>;
}

export interface ProjectInstruction {
    /** Schema version for forward-compatible evolution (e.g., "1.0") */
    schemaVersion: string;
    name: string;
    displayName: string;
    version: string;
    description: string;
    world: "MAIN" | "ISOLATED";
    isGlobal?: boolean;
    dependencies: string[];
    loadOrder: number;
    seed: SeedBlock;
    assets: {
        css: Array<{ file: string; inject: "head" }>;
        configs: Array<{ file: string; key: string; injectAs?: string }>;
        scripts: Array<{ file: string; order: number; configBinding?: string; themeBinding?: string; isIife?: boolean }>;
        templates: Array<{ file: string; injectAs?: string }>;
        prompts: Array<{ file: string }>;
    };
}

const LOVABLE_BASE_URL = "https://lovable.dev";

const instruction: ProjectInstruction = {
    schemaVersion: "1.0",
    name: "marco-sdk",
    displayName: "Rise Up Macro SDK",
    version: "2.142.0",
    description: "Core SDK — creates and freezes window.marco namespace",
    world: "MAIN",
    isGlobal: true,
    dependencies: [],
    loadOrder: 0,
    seed: {
        id: "default-marco-sdk",
        seedOnInstall: true,
        isRemovable: false,
        autoInject: true,
        runAt: "document_start",
        cookieBinding: undefined,
        targetUrls: [
            { pattern: "https://lovable.dev/projects/*", matchType: "glob" },
            { pattern: "https://*.lovable.app/*", matchType: "glob" },
            { pattern: "https://*.lovableproject.com/*", matchType: "glob" },
        ],
        cookies: [
            { cookieName: "lovable-session-id.id", url: LOVABLE_BASE_URL, role: "session", description: "Primary session cookie — JWT bearer token" },
            { cookieName: "lovable-session-id.refresh", url: LOVABLE_BASE_URL, role: "refresh", description: "Refresh token cookie" },
            { cookieName: "__Secure-lovable-session-id.id", url: LOVABLE_BASE_URL, role: "session", description: "Secure-prefixed session cookie alias" },
            { cookieName: "__Host-lovable-session-id.id", url: LOVABLE_BASE_URL, role: "session", description: "Host-prefixed session cookie alias" },
        ],
        settings: { onlyRunAsDependency: true },
    },
    assets: {
        css: [],
        configs: [],
        scripts: [
            { file: "marco-sdk.js", order: 1, isIife: true },
        ],
        templates: [],
        prompts: [],
    },
};

export default instruction;
