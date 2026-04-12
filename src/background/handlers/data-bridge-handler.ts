/**
 * Marco Extension — Data Bridge Handler
 *
 * Handles USER_SCRIPT_DATA_* messages for cross-site key-value storage.
 * Data is persisted in chrome.storage.local under 'marco_user_data'.
 *
 * @see spec/05-chrome-extension/42-user-script-logging-and-data-bridge.md — Data bridge spec
 * @see .lovable/memory/architecture/macro-controller-bridge-spec.md — Bridge architecture
 */

import type { JsonValue } from "./handler-types";
import type { MessageRequest } from "../../shared/messages";
import { logBgWarnError, BgLogTag} from "../bg-logger";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORE_KEY = "marco_user_data";
const MAX_KEY_LENGTH = 256;
const MAX_VALUE_SIZE_BYTES = 1_048_576; // 1 MB
const MAX_KEYS_PER_PREFIX = 1000;
const WARN_TOTAL_SIZE_BYTES = 41_943_040; // 40 MB

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface StoreEntry {
    value: JsonValue;
    updatedAt: string;
    projectId: string;
    scriptId: string;
}

type StoreData = Record<string, StoreEntry>;

/* ------------------------------------------------------------------ */
/*  Storage Access                                                     */
/* ------------------------------------------------------------------ */

/** Reads the full data store from chrome.storage.local. */
async function readStore(): Promise<StoreData> {
    const stored = await chrome.storage.local.get(STORE_KEY);
    const data = stored[STORE_KEY] as StoreData | undefined;

    return data ?? {};
}

/** Writes the full data store to chrome.storage.local. */
async function writeStore(data: StoreData): Promise<void> {
    await chrome.storage.local.set({ [STORE_KEY]: data });
    checkStoreSizeWarning(data);
}

/** Logs a warning if the store size exceeds the threshold. */
function checkStoreSizeWarning(data: StoreData): void {
    const serialized = JSON.stringify(data);
    const sizeBytes = new Blob([serialized]).size;
    const isOverThreshold = sizeBytes > WARN_TOTAL_SIZE_BYTES;

    if (isOverThreshold) {
        logBgWarnError(BgLogTag.DATA_BRIDGE, `Store size ${sizeBytes} bytes exceeds warning threshold (${WARN_TOTAL_SIZE_BYTES})`);
    }
}

/* ------------------------------------------------------------------ */
/*  Validation                                                         */
/* ------------------------------------------------------------------ */

/** Validates a key for length and character constraints. */
function validateKey(key: string): string | null {
    const isTooLong = key.length > MAX_KEY_LENGTH;

    if (isTooLong) {
        return `Key exceeds ${MAX_KEY_LENGTH} character limit`;
    }

    // eslint-disable-next-line no-control-regex
    const hasControlChars = /[\x00-\x1f]/.test(key);

    if (hasControlChars) {
        return "Key contains control characters";
    }

    return null;
}

/** Validates a value for size constraints. */
function validateValue(value: JsonValue): string | null {
    const serialized = JSON.stringify(value);
    const sizeBytes = new Blob([serialized]).size;
    const isTooLarge = sizeBytes > MAX_VALUE_SIZE_BYTES;

    if (isTooLarge) {
        return `Value exceeds ${MAX_VALUE_SIZE_BYTES} byte limit (${sizeBytes} bytes)`;
    }

    return null;
}

/** Counts keys matching a prefix. */
function countKeysWithPrefix(data: StoreData, prefix: string): number {
    let count = 0;

    for (const key of Object.keys(data)) {
        const hasPrefix = key.startsWith(prefix);

        if (hasPrefix) {
            count++;
        }
    }

    return count;
}

/* ------------------------------------------------------------------ */
/*  SET                                                                */
/* ------------------------------------------------------------------ */

/** Handles USER_SCRIPT_DATA_SET — stores a key-value pair. */
export async function handleDataSet(
    message: MessageRequest,
): Promise<{ isOk: boolean; errorMessage?: string }> {
    const msg = message as MessageRequest & {
        key: string;
        value: JsonValue;
        projectId: string;
        scriptId: string;
    };

    const keyError = validateKey(msg.key);
    const hasKeyError = keyError !== null;

    if (hasKeyError) {
        return { isOk: false, errorMessage: keyError! };
    }

    const valueError = validateValue(msg.value);
    const hasValueError = valueError !== null;

    if (hasValueError) {
        return { isOk: false, errorMessage: valueError! };
    }

    const data = await readStore();
    const prefix = extractPrefix(msg.key);
    const existingCount = countKeysWithPrefix(data, prefix);
    const isNewKey = data[msg.key] === undefined;
    const isOverKeyLimit = isNewKey && existingCount >= MAX_KEYS_PER_PREFIX;

    if (isOverKeyLimit) {
        return { isOk: false, errorMessage: `Exceeded ${MAX_KEYS_PER_PREFIX} keys per project` };
    }

    const sanitizedValue = JSON.parse(JSON.stringify(msg.value));

    data[msg.key] = {
        value: sanitizedValue,
        updatedAt: new Date().toISOString(),
        projectId: msg.projectId,
        scriptId: msg.scriptId,
    };

    await writeStore(data);
    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  GET                                                                */
/* ------------------------------------------------------------------ */

/** Handles USER_SCRIPT_DATA_GET — retrieves a value by key. */
export async function handleDataGet(
    message: MessageRequest,
): Promise<{ value: JsonValue }> {
    const msg = message as MessageRequest & { key: string };
    const data = await readStore();
    const entry = data[msg.key];
    const hasEntry = entry !== undefined;

    return { value: hasEntry ? entry.value : undefined };
}

/* ------------------------------------------------------------------ */
/*  DELETE                                                             */
/* ------------------------------------------------------------------ */

/** Handles USER_SCRIPT_DATA_DELETE — removes a key. */
export async function handleDataDelete(
    message: MessageRequest,
): Promise<{ isOk: boolean }> {
    const msg = message as MessageRequest & { key: string };
    const data = await readStore();

    delete data[msg.key];
    await writeStore(data);

    return { isOk: true };
}

/* ------------------------------------------------------------------ */
/*  KEYS                                                               */
/* ------------------------------------------------------------------ */

/** Handles USER_SCRIPT_DATA_KEYS — lists keys matching a prefix. */
export async function handleDataKeys(
    message: MessageRequest,
): Promise<{ keys: string[] }> {
    const msg = message as MessageRequest & { prefix: string };
    const data = await readStore();
    const matchingKeys: string[] = [];

    for (const key of Object.keys(data)) {
        const hasPrefix = key.startsWith(msg.prefix);

        if (hasPrefix) {
            const strippedKey = key.slice(msg.prefix.length);

            matchingKeys.push(strippedKey);
        }
    }

    return { keys: matchingKeys };
}

/* ------------------------------------------------------------------ */
/*  GET_ALL                                                            */
/* ------------------------------------------------------------------ */

/** Handles USER_SCRIPT_DATA_GET_ALL — returns all entries for a prefix. */
export async function handleDataGetAll(
    message: MessageRequest,
): Promise<{ entries: Record<string, unknown> }> {
    const msg = message as MessageRequest & { prefix: string };
    const data = await readStore();
    const entries: Record<string, unknown> = {};

    for (const key of Object.keys(data)) {
        const hasPrefix = key.startsWith(msg.prefix);

        if (hasPrefix) {
            const strippedKey = key.slice(msg.prefix.length);

            entries[strippedKey] = data[key].value;
        }
    }

    return { entries };
}

/* ------------------------------------------------------------------ */
/*  CLEAR                                                              */
/* ------------------------------------------------------------------ */

/** Handles USER_SCRIPT_DATA_CLEAR — removes all entries for a prefix. */
export async function handleDataClear(
    message: MessageRequest,
): Promise<{ isOk: boolean; cleared: number }> {
    const msg = message as MessageRequest & { prefix: string };
    const data = await readStore();
    let cleared = 0;

    for (const key of Object.keys(data)) {
        const hasPrefix = key.startsWith(msg.prefix);

        if (hasPrefix) {
            delete data[key];
            cleared++;
        }
    }

    await writeStore(data);
    return { isOk: true, cleared };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  GET_DATA_STORE_ALL (Options page browser)                          */
/* ------------------------------------------------------------------ */

export interface DataStoreEntry {
    key: string;
    value: JsonValue;
    valuePreview: string;
    sizeBytes: number;
    projectId: string;
    scriptId: string;
    updatedAt: string;
}

/** Returns every entry in the data store with metadata for the Options UI. */
export async function handleGetDataStoreAll(): Promise<{ entries: DataStoreEntry[] }> {
    const data = await readStore();
    const entries: DataStoreEntry[] = [];

    for (const [key, entry] of Object.entries(data)) {
        const serialized = JSON.stringify(entry.value);
        const sizeBytes = new Blob([serialized]).size;
        const valuePreview = serialized.length > 120
            ? serialized.slice(0, 120) + "…"
            : serialized;

        entries.push({
            key,
            value: entry.value,
            valuePreview,
            sizeBytes,
            projectId: entry.projectId,
            scriptId: entry.scriptId,
            updatedAt: entry.updatedAt,
        });
    }

    return { entries };
}

/** Extracts the namespace prefix from a namespaced key. */
function extractPrefix(key: string): string {
    const separatorIndex = key.indexOf("::");
    const hasSeparator = separatorIndex !== -1;

    if (hasSeparator) {
        return key.slice(0, separatorIndex + 2);
    }

    return "";
}
