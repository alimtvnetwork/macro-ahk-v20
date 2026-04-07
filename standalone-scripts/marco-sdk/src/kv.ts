/**
 * Riseup Macro SDK — KV Module
 *
 * Provides marco.kv.* methods for project-scoped key-value storage.
 *
 * See: spec/12-devtools-and-injection/sdk-convention.md §marco.kv
 */

import { sendMessage } from "./bridge";

export interface KvApi {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
    list(): Promise<Array<{ key: string; value: string }>>;
}

export function createKvApi(): KvApi {
    return {
        get(key: string) {
            return sendMessage<string | null>("KV_GET", { key });
        },
        async set(key: string, value: string) {
            await sendMessage<void>("KV_SET", { key, value });
        },
        async delete(key: string) {
            await sendMessage<void>("KV_DELETE", { key });
        },
        list() {
            return sendMessage<Array<{ key: string; value: string }>>("KV_LIST");
        },
    };
}
