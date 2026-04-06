/**
 * MacroLoop Controller — IndexedDB Prompt Cache
 *
 * Provides cache-first (stale-while-revalidate) prompt loading.
 * See: spec/12-chrome-extension/52-prompt-caching-indexeddb.md
 */

import { log } from '../logging';

const DB_NAME = 'marco_prompts_cache';
const DB_VERSION = 1;
const STORE_NAME = 'prompts';
const CACHE_KEY = 'prompt_cache';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedPromptEntry {
  name: string;
  text: string;
  category?: string;
  isDefault?: boolean;
  isFavorite?: boolean;
  order?: number;
  id?: string;
  version?: string;
}

interface CacheRecord {
  id: string;
  entries: CachedPromptEntry[];
  fetchedAt: number;
  hash: string;
}

/** Compute a lightweight hash for change detection */
export function computePromptHash(entries: CachedPromptEntry[]): string {
  const parts: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    parts.push((entries[i].name || '') + ':' + (entries[i].text || '').length);
  }
  parts.sort();
  return parts.join('|');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise(function(resolve, reject) {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function() {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    } catch (e) {
      reject(e);
    }
  });
}

/** Read cached prompts from IndexedDB */
export function readPromptCache(): Promise<CacheRecord | null> {
  return openDb().then(function(db) {
    return new Promise<CacheRecord | null>(function(resolve) {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(CACHE_KEY);
        req.onsuccess = function() {
          const record = req.result as CacheRecord | undefined;
          if (!record || !record.entries || record.entries.length === 0) {
            resolve(null);
            return;
          }
          // Check TTL
          const age = Date.now() - (record.fetchedAt || 0);
          if (age > CACHE_TTL_MS) {
            log('[PromptCache] Cache expired (age=' + Math.round(age / 1000) + 's)', 'info');
            // Return stale data but mark as expired (caller should revalidate)
          }
          resolve(record);
        };
        req.onerror = function() { resolve(null); };
        tx.oncomplete = function() { db.close(); };
      } catch (e) {
        resolve(null);
      }
    });
  }).catch(function() { return null; });
}

/** Write prompts to IndexedDB cache */
export function writePromptCache(entries: CachedPromptEntry[]): Promise<void> {
  const hash = computePromptHash(entries);
  return openDb().then(function(db) {
    return new Promise<void>(function(resolve) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put({
          id: CACHE_KEY,
          entries: entries,
          fetchedAt: Date.now(),
          hash: hash,
        });
        tx.oncomplete = function() { db.close(); resolve(); };
        tx.onerror = function() { db.close(); resolve(); };
      } catch (e) {
        resolve();
      }
    });
  }).catch(function() { /* IndexedDB unavailable */ });
}

/** Clear the prompt cache (on save/delete) */
export function clearPromptCache(): Promise<void> {
  return openDb().then(function(db) {
    return new Promise<void>(function(resolve) {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(CACHE_KEY);
        tx.oncomplete = function() { db.close(); resolve(); };
        tx.onerror = function() { db.close(); resolve(); };
      } catch (e) {
        resolve();
      }
    });
  }).catch(function() { /* IndexedDB unavailable */ });
}

/** Get cached hash for comparison */
export function getCachedHash(): Promise<string | null> {
  return readPromptCache().then(function(record) {
    return record ? record.hash : null;
  });
}
