/**
 * Marco — Chrome API Ambient Types
 *
 * Minimal ambient declarations for chrome.* APIs used by the
 * PlatformAdapter. In the extension build, @types/chrome provides
 * the full definitions; this file prevents TS errors in preview.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export {};

declare global {
    namespace chrome {
        namespace runtime {
            const id: string | undefined;
            function sendMessage(message: any): Promise<any>;
            function getURL(path: string): string;
        }
        namespace storage {
            namespace local {
                function get(key: string): Promise<Record<string, any>>;
                function set(items: Record<string, any>): Promise<void>;
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
