/**
 * Marco — Platform Adapter Interface
 *
 * Abstracts chrome.* APIs so React components work identically
 * in both the Chrome extension and the browser preview.
 */

/** JSON-serializable value used inside message payloads. */
export type SerializableValue =
    | string
    | number
    | boolean
    | null
    | undefined
    | SerializableValue[]
    | { [key: string]: SerializableValue };

/** Typed message payload sent to the background service worker. */
export interface MessagePayload {
    type: string;
    [key: string]: SerializableValue | object;
}

/** Platform-agnostic storage interface. */
export interface PlatformStorage {
    get<T = string | number | boolean | null | object>(key: string): Promise<T>;
    set(key: string, value: string | number | boolean | null | object): Promise<void>;
    remove(key: string): Promise<void>;
}

/** Platform-agnostic tab operations. */
export interface PlatformTabs {
    openUrl(url: string): void;
    getActiveTabId(): Promise<number | null>;
}

/**
 * Core adapter interface.
 *
 * Components import this interface and never call chrome.* directly.
 * At runtime, the correct implementation is resolved by the factory.
 */
export interface PlatformAdapter {
    /** Identifies the runtime environment. */
    readonly target: "extension" | "preview";

    /** Sends a typed message to the background service worker. */
    sendMessage<T = void>(message: MessagePayload): Promise<T>;

    /** Platform-scoped storage operations. */
    readonly storage: PlatformStorage;

    /** Tab management operations. */
    readonly tabs: PlatformTabs;

    /** Returns the full URL for an extension-relative path. */
    getExtensionUrl(path: string): string;
}
