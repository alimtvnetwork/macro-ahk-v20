import { logError } from './error-utils';
/**
 * DomCache — TTL-based DOM query cache (V2 Phase 04, Task 04.1)
 *
 * Caches XPath and CSS selector query results to avoid redundant DOM traversals
 * during hot paths (loop cycles, observer callbacks, UI updates).
 *
 * Usage:
 *   import { domCache } from './dom-cache';
 *   const el = domCache.getByXPath(xpath);  // cached for 2s
 *   domCache.invalidate();                   // force clear on navigation/mutation
 *
 * See: spec/04-macro-controller/ts-migration-v2/04-performance-logging.md
 */


interface CacheEntry {
  element: Node | null;
  timestamp: number;
}

interface CacheEntryMulti {
  elements: Node[];
  timestamp: number;
}

class DomCache {
  private _cache = new Map<string, CacheEntry>();
  private _cacheMulti = new Map<string, CacheEntryMulti>();
  private _ttlMs: number;
  private _hits = 0;
  private _misses = 0;

  constructor(ttlMs = 2000) {
    this._ttlMs = ttlMs;
  }

  /** Get a single node by XPath, using cache if fresh */
  getByXPath(xpath: string): Node | null {
    if (!xpath) {
      return null;
    }

    const cached = this._cache.get(xpath);
    if (cached && Date.now() - cached.timestamp < this._ttlMs) {
      // Verify element is still in DOM
      if (cached.element === null || (cached.element instanceof Element && document.contains(cached.element))) {
        this._hits++;
        return cached.element;
      }
      // Element was removed from DOM — invalidate this entry
      this._cache.delete(xpath);
    }

    this._misses++;
    try {
      const el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
      this._cache.set(xpath, { element: el, timestamp: Date.now() });
      return el;
    } catch (e: unknown) {
      logError('DomCache.getOne', 'XPath evaluation failed', e);
      return null;
    }
  }

  /** Get all nodes by XPath, using cache if fresh */
  getAllByXPath(xpath: string): Node[] {
    if (!xpath) {
      return [];
    }

    const cached = this._cacheMulti.get(xpath);
    if (cached && Date.now() - cached.timestamp < this._ttlMs) {
      this._hits++;
      return cached.elements;
    }

    this._misses++;
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const nodes: Node[] = [];

      for (let i = 0; i < result.snapshotLength; i++) {
        const node = result.snapshotItem(i);

        if (node) {
          nodes.push(node);
        }
      }
      this._cacheMulti.set(xpath, { elements: nodes, timestamp: Date.now() });
      return nodes;
    } catch (e: unknown) {
      logError('DomCache.getAll', 'XPath multi-evaluation failed', e);
      return [];
    }
  }

  /** Get by CSS selector, using cache */
  querySelector(selector: string): Element | null {
    const key = 'css:' + selector;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < this._ttlMs) {
      if (cached.element === null || (cached.element instanceof Element && document.contains(cached.element))) {
        this._hits++;
        return cached.element as Element | null;
      }
      this._cache.delete(key);
    }

    this._misses++;
    const el = document.querySelector(selector);
    this._cache.set(key, { element: el, timestamp: Date.now() });
    return el;
  }

  /** Get by ID, using cache */
  getElementById(id: string): HTMLElement | null {
    const key = 'id:' + id;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.timestamp < this._ttlMs) {
      if (cached.element === null || (cached.element instanceof Element && document.contains(cached.element))) {
        this._hits++;
        return cached.element as HTMLElement | null;
      }
      this._cache.delete(key);
    }

    this._misses++;
    const el = document.getElementById(id);
    this._cache.set(key, { element: el, timestamp: Date.now() });
    return el;
  }

  /** Clear all cached entries */
  invalidate(): void {
    this._cache.clear();
    this._cacheMulti.clear();
  }

  /** Invalidate a specific key */
  invalidateKey(key: string): void {
    this._cache.delete(key);
    this._cacheMulti.delete(key);
  }

  /** Set TTL in milliseconds */
  setTtl(ms: number): void {
    this._ttlMs = ms;
  }

  /** Get cache hit/miss stats */
  stats(): { hits: number; misses: number; ratio: string; size: number; ttlMs: number } {
    const total = this._hits + this._misses;
    return {
      hits: this._hits,
      misses: this._misses,
      ratio: total > 0 ? (this._hits / total * 100).toFixed(1) + '%' : 'N/A',
      size: this._cache.size + this._cacheMulti.size,
      ttlMs: this._ttlMs,
    };
  }

  /** Reset stats counters */
  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
  }
}

/** Global singleton DomCache instance */
export const domCache = new DomCache(2000);
