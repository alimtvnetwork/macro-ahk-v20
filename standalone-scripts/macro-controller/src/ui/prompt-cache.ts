/**
 * MacroLoop Controller — IndexedDB Prompt Cache (Dual-Record)
 *
 * Provides dual-cache storage: JsonCopy (raw data) + HtmlCopy (rendered HTML).
 * No TTL — cache is invalidated only on explicit save/delete.
 * See: spec/05-chrome-extension/52-prompt-caching-indexeddb.md
 */

import { log } from '../logging';
import { logError } from '../error-utils';
import { showToast } from '../toast';

const DB_NAME = 'marco_prompts_cache';
const DB_VERSION = 3;
const STORE_NAME = 'prompts';
const UI_STORE_NAME = 'ui_snapshots';

// ============================================
// Cache key constants
// ============================================

const JSON_COPY_KEY = 'json_copy';
const HTML_COPY_KEY = 'html_copy';
const UI_CACHE_KEY = 'dropdown_snapshot';

// ============================================
// Types
// ============================================

export interface CachedPromptEntry {
  name: string;
  text: string;
  id?: string;
  slug?: string;
  category?: string;
  isDefault?: boolean;
  isFavorite?: boolean;
  order?: number;
  version?: string;
}

/** Record shape for JSON copy in IndexedDB. */
interface JsonCopyRecord {
  id: string;
  entries: CachedPromptEntry[];
  fetchedAt: number;
  hash: string;
}

/** Record shape for HTML copy in IndexedDB. */
interface HtmlCopyRecord {
  id: string;
  html: string;
  promptCount: number;
  dataHash: string;
  savedAt: number;
}

export interface UISnapshot {
  id: string;
  html: string;
  categoryFilter: string | null;
  scrollTop: number;
  promptCount: number;
  dataHash: string;
  savedAt: number;
}

// ============================================
// Hash computation
// ============================================

/** Compute a lightweight hash for change detection. */
export function computePromptHash(entries: CachedPromptEntry[]): string {
  const parts: string[] = [];

  for (const entry of entries) {
    parts.push((entry.name || '') + ':' + (entry.text || '').length);
  }
  parts.sort();

  return parts.join('|');
}

// ============================================
// IndexedDB open helper
// ============================================

function openDb(): Promise<IDBDatabase> {
  return new Promise(function(resolve, reject) {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function() {
        createStoresIfMissing(request.result);
      };
      request.onsuccess = function() { resolve(request.result); };
      request.onerror = function() { reject(request.error); };
    } catch (e) {
      logError('readFromStore', 'IndexedDB read failed', e);
      showToast('❌ IndexedDB read failed', 'error');
      reject(e);
    }
  });
}

/** Ensure both object stores exist during upgrade. */
function createStoresIfMissing(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(UI_STORE_NAME)) {
    db.createObjectStore(UI_STORE_NAME, { keyPath: 'id' });
  }
}

// ============================================
// Generic IDB helpers (≤8 lines each)
// ============================================

/** Read a single record from a store by key. */
function readRecord<T>(storeName: string, key: string): Promise<T | null> {
  return openDb().then(function(db) {
    return new Promise<T | null>(function(resolve) {
      try {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = function() { resolve((req.result as T) || null); };
        req.onerror = function() { resolve(null); };
        tx.oncomplete = function() { db.close(); };
      } catch (_e) {
        log('[PromptCache] readRecord(' + storeName + '/' + key + ') transaction failed: ' + (_e instanceof Error ? _e.message : String(_e)), 'warn');
        resolve(null);
      }
    });
  }).catch(function(e: unknown) { log('[PromptCache] readRecord(' + storeName + ') IndexedDB open failed: ' + (e instanceof Error ? e.message : String(e)), 'warn'); return null; });
}

/** Write a record to a store. */
function writeRecord(storeName: string, record: Record<string, unknown>): Promise<void> {
  return openDb().then(function(db) {
    return new Promise<void>(function(resolve) {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(record);
        tx.oncomplete = function() { db.close(); resolve(); };
        tx.onerror = function() { db.close(); resolve(); };
      } catch (e) {
        logWriteError(storeName, e);
        resolve();
      }
    });
  }).catch(function(err) {
    logWriteError(storeName, err);
  });
}

/** Delete a record from a store by key. */
function deleteRecord(storeName: string, key: string): Promise<void> {
  return openDb().then(function(db) {
    return new Promise<void>(function(resolve) {
      try {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = function() { db.close(); resolve(); };
        tx.onerror = function() { db.close(); resolve(); };
      } catch (_e) {
        log('[PromptCache] deleteRecord(' + storeName + ') transaction failed: ' + (_e instanceof Error ? _e.message : String(_e)), 'warn');
        resolve();
      }
    });
  }).catch(function(e: unknown) { log('[PromptCache] deleteRecord(' + storeName + '/' + key + ') failed: ' + (e instanceof Error ? e.message : String(e)), 'warn'); });
}

function logWriteError(storeName: string, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  log('[PromptCache] Write to ' + storeName + ' failed: ' + msg, 'warn');
}

// ============================================
// JSON Copy — raw prompt data
// ============================================

/** Read the JSON copy of cached prompts. */
export function readJsonCopy(): Promise<JsonCopyRecord | null> {
  return readRecord<JsonCopyRecord>(STORE_NAME, JSON_COPY_KEY).then(function(record) {
    if (!record || !record.entries || record.entries.length === 0) {
      return null;
    }
    log('[PromptCache] JsonCopy read: ' + record.entries.length + ' entries', 'info');

    return record;
  });
}

/** Write the JSON copy of prompts to IndexedDB. */
export function writeJsonCopy(entries: CachedPromptEntry[]): Promise<void> {
  const hash = computePromptHash(entries);
  log('[PromptCache] Writing JsonCopy (' + entries.length + ' entries)', 'info');

  return writeRecord(STORE_NAME, {
    id: JSON_COPY_KEY,
    entries: entries,
    fetchedAt: Date.now(),
    hash: hash,
  });
}

// ============================================
// HTML Copy — pre-rendered dropdown HTML
// ============================================

/** Read the HTML copy of the rendered dropdown. */
export function readHtmlCopy(): Promise<HtmlCopyRecord | null> {
  return readRecord<HtmlCopyRecord>(STORE_NAME, HTML_COPY_KEY).then(function(record) {
    if (!record || !record.html) {
      return null;
    }
    log('[PromptCache] HtmlCopy read: ' + record.promptCount + ' prompts', 'info');

    return record;
  });
}

/** Write the HTML copy of the rendered dropdown. */
export function writeHtmlCopy(options: { html: string; promptCount: number; dataHash: string }): Promise<void> {
  log('[PromptCache] Writing HtmlCopy (' + options.promptCount + ' prompts)', 'info');

  return writeRecord(STORE_NAME, {
    id: HTML_COPY_KEY,
    html: options.html,
    promptCount: options.promptCount,
    dataHash: options.dataHash,
    savedAt: Date.now(),
  });
}

// ============================================
// Legacy compat — writePromptCache / readPromptCache
// ============================================

/** Write prompts to IndexedDB cache (writes JsonCopy). */
export function writePromptCache(entries: CachedPromptEntry[]): Promise<void> {
  return writeJsonCopy(entries);
}

/** Read cached prompts from IndexedDB (reads JsonCopy). */
export function readPromptCache(): Promise<JsonCopyRecord | null> {
  return readJsonCopy();
}

// ============================================
// Clear caches (on save/delete)
// ============================================

/** Clear both JSON and HTML prompt caches. */
export function clearPromptCache(): Promise<void> {
  log('[PromptCache] Clearing JsonCopy + HtmlCopy', 'info');

  return Promise.all([
    deleteRecord(STORE_NAME, JSON_COPY_KEY),
    deleteRecord(STORE_NAME, HTML_COPY_KEY),
  ]).then(function() { /* void */ });
}

/** Get cached hash for comparison. */
export function getCachedHash(): Promise<string | null> {
  return readJsonCopy().then(function(record) {
    return record ? record.hash : null;
  });
}

// ============================================
// UI Snapshot Cache — full dropdown HTML + state
// ============================================

/** Save rendered dropdown HTML + state to IndexedDB. */
export function writeUISnapshot(snapshot: Omit<UISnapshot, 'id' | 'savedAt'>): Promise<void> {
  return writeRecord(UI_STORE_NAME, {
    id: UI_CACHE_KEY,
    html: snapshot.html,
    categoryFilter: snapshot.categoryFilter,
    scrollTop: snapshot.scrollTop,
    promptCount: snapshot.promptCount,
    dataHash: snapshot.dataHash,
    savedAt: Date.now(),
  });
}

/** Read cached UI snapshot from IndexedDB. */
export function readUISnapshot(): Promise<UISnapshot | null> {
  return readRecord<UISnapshot>(UI_STORE_NAME, UI_CACHE_KEY).then(function(record) {
    if (!record || !record.html) {
      return null;
    }

    return record;
  });
}

/** Clear UI snapshot cache. */
export function clearUISnapshot(): Promise<void> {
  return deleteRecord(UI_STORE_NAME, UI_CACHE_KEY);
}
