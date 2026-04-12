/**
 * Marco — Chrome API Ambient Types
 *
 * Minimal ambient declarations for chrome.* APIs used by the
 * PlatformAdapter. In the extension build, @types/chrome provides
 * the full definitions; this file prevents TS errors in preview.
 */

/* eslint-disable @typescript-eslint/no-namespace */

import type { SerializableValue } from "./platform-adapter";

export {};

declare global {
    namespace chrome {
        namespace runtime {
            const id: string | undefined;
            function sendMessage(message: Record<string, SerializableValue>): Promise<SerializableValue>;
            function getURL(path: string): string;
        }
        namespace storage {
            namespace local {
                function get(key: string): Promise<Record<string, SerializableValue>>;
                function set(items: Record<string, SerializableValue>): Promise<void>;
                function remove(key: string): Promise<void>;
            }
        }
        namespace tabs {
            function create(props: { url: string }): void;
            function query(
                queryInfo: { active: boolean; currentWindow: boolean },
            ): Promise<Array<{ id?: number }>>;
        }
    }
}
