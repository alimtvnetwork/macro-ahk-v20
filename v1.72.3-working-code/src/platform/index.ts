/**
 * Marco — Platform Adapter Factory
 *
 * Detects the runtime environment and returns the correct adapter.
 * Components import { getPlatform } from "@/platform" and never
 * reference chrome.* directly.
 */

import type { PlatformAdapter } from "./platform-adapter";
import { chromeAdapter } from "./chrome-adapter";
import { previewAdapter } from "./preview-adapter";

/** Detects whether we are running inside a Chrome extension context. */
function isExtensionContext(): boolean {
    const win = globalThis as any;

    const hasChromeRuntime =
        win.chrome !== undefined
        && win.chrome.runtime !== undefined
        && win.chrome.runtime.id !== undefined;

    return hasChromeRuntime;
}

/** Lazily resolved singleton adapter. */
let resolvedAdapter: PlatformAdapter | null = null;

/** Returns the platform adapter for the current environment. */
export function getPlatform(): PlatformAdapter {
    if (resolvedAdapter !== null) {
        return resolvedAdapter;
    }

    resolvedAdapter = isExtensionContext()
        ? chromeAdapter
        : previewAdapter;

    return resolvedAdapter;
}

/** Convenience re-exports. */
export type { PlatformAdapter, MessagePayload } from "./platform-adapter";
export type { PlatformStorage, PlatformTabs } from "./platform-adapter";
