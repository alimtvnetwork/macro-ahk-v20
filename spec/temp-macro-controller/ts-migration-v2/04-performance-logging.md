# Phase 04 — Performance Optimization & Configurable Logging

**Priority**: High
**Status**: ✅ Complete (2026-04-01)
**Depends On**: Phase 01 (initialization fix)

---

## Part A: Performance Optimization

### Identified Bottlenecks

#### 1. Excessive DOM Queries
**Problem**: XPath queries (`getByXPath`, `getAllByXPath`) execute on every loop cycle, observer callback, and UI update. Each XPath evaluation traverses the DOM tree.

**Solution**: Cache DOM references with TTL-based invalidation.
```typescript
class DomCache {
  private cache = new Map<string, { element: Element | null; timestamp: number }>();
  private ttlMs = 2000; // 2 seconds
  
  get(xpath: string): Element | null {
    const cached = this.cache.get(xpath);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) return cached.element;
    const el = getByXPath(xpath);
    this.cache.set(xpath, { element: el, timestamp: Date.now() });
    return el;
  }
  
  invalidate(): void { this.cache.clear(); }
}
```

#### 2. MutationObserver Overhead
**Problem**: Three separate MutationObservers (SPA persistence, workspace name, auto-attach) all observe `subtree: true` on broad targets. Each DOM mutation triggers all three.

**Solution**:
- Merge observers where possible (single observer, dispatch by mutation type)
- Use `requestAnimationFrame` debouncing instead of `setTimeout`
- Narrow observation scope (specific containers, not `document.body`)

#### 3. Redundant API Calls
**Problem**: `fetchLoopCredits()` called on startup, on Check, on timer, and on workspace change — sometimes overlapping.

**Solution**: Deduplication via in-flight promise tracking:
```typescript
let inFlightFetch: Promise<void> | null = null;
function fetchCreditsDeduped(): Promise<void> {
  if (inFlightFetch) return inFlightFetch;
  inFlightFetch = doFetch().finally(() => { inFlightFetch = null; });
  return inFlightFetch;
}
```

#### 4. Excessive localStorage Reads/Writes
**Problem**: `log()` calls `safeSetItem()` which writes to `localStorage` on every log entry. High-frequency logging (during loops) causes I/O pressure.

**Solution**: Batch localStorage writes with a flush interval:
```typescript
let pendingLogs: string[] = [];
let flushTimer: number | null = null;

function queueLog(entry: string): void {
  pendingLogs.push(entry);
  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, 1000);
  }
}
```

#### 5. UI Re-renders
**Problem**: `updateUI()` rebuilds large portions of the DOM on every call. Called frequently during loops.

**Solution**: Dirty-flag based partial updates — only update changed sections:
```typescript
const dirty = { credits: false, workspace: false, status: false, countdown: false };
function updateUI(): void {
  if (dirty.credits) updateCreditBar();
  if (dirty.workspace) updateWorkspaceName();
  if (dirty.status) updateStatusIndicator();
  if (dirty.countdown) updateCountdown();
  // Reset all flags
  Object.keys(dirty).forEach(k => dirty[k] = false);
}
```

---

## Part B: Configurable Logging System

### Current State

Logging uses `console.log` via the `log()` function in `logging.ts`. There is no way to disable or filter logs at runtime. Debug logs, info logs, and error logs all output unconditionally.

### Target: Config-Driven Logger

#### Configuration Schema

Add to `02-macro-controller-config.json`:
```json
{
  "general": {
    "logLevel": "info",
    "logToConsole": true,
    "logToStorage": true,
    "logToBridge": false,
    "maxLogEntries": 500
  }
}
```

#### Log Levels

| Level | Value | Description |
|-------|-------|-------------|
| `debug` | 0 | Verbose — DOM queries, XPath results, state changes |
| `info` | 1 | Normal — startup, cycle completion, workspace changes |
| `warn` | 2 | Warnings — fallbacks, retries, missing data |
| `error` | 3 | Errors — API failures, uncaught exceptions |
| `silent` | 4 | No logging at all |

#### Logger Class

```typescript
export class LogManager {
  private level: number;
  private toConsole: boolean;
  private toStorage: boolean;
  private toBridge: boolean;
  
  constructor(config: GeneralConfig) {
    this.level = this.parseLevel(config.logLevel || 'info');
    this.toConsole = config.logToConsole !== false;
    this.toStorage = config.logToStorage !== false;
    this.toBridge = config.logToBridge || false;
  }
  
  debug(msg: string, ...args: unknown[]): void { this.emit(0, msg, args); }
  info(msg: string, ...args: unknown[]): void { this.emit(1, msg, args); }
  warn(msg: string, ...args: unknown[]): void { this.emit(2, msg, args); }
  error(msg: string, ...args: unknown[]): void { this.emit(3, msg, args); }
  
  private emit(level: number, msg: string, args: unknown[]): void {
    if (level < this.level) return;
    if (this.toConsole) { /* console output */ }
    if (this.toStorage) { /* localStorage/bridge output */ }
  }
  
  setLevel(level: string): void { this.level = this.parseLevel(level); }
}
```

#### Runtime Toggle

Users can toggle logging from the Settings dialog or via console:
```javascript
MacroController.getInstance().logging.setLevel('debug');  // verbose
MacroController.getInstance().logging.setLevel('silent'); // quiet
```

---

## Tasks

| # | Task | Effort | Phase |
|---|------|--------|-------|
| 04.1 | Implement DomCache with TTL | 2h | A |
| 04.2 | Merge/narrow MutationObservers | 3h | A |
| 04.3 | Add API call deduplication | 1h | A |
| 04.4 | Batch localStorage writes | 2h | A |
| 04.5 | Dirty-flag UI updates | 3h | A |
| 04.6 | Create LogManager class | 2h | B |
| 04.7 | Add log level to config schema | 1h | B |
| 04.8 | Replace all `log()` calls with LogManager | 3h | B |
| 04.9 | Add runtime log toggle to Settings UI | 1h | B |

---

## Acceptance Criteria

### Performance
1. [x] DOM XPath queries cached with 2s TTL — `dom-cache.ts` DomCache class; wired into `xpath-utils.ts` `getByXPath`/`getAllByXPath`
2. [x] No more than 2 MutationObservers active simultaneously — persistence (childList-only on main/#root), workspace (narrow navEl)
3. [x] Duplicate API calls within 1s window are deduplicated — `CreditAsyncState` in `credit-fetch.ts`
4. [x] localStorage writes batched (max 1 write/second during loop) — `LogFlushState` in `logging.ts` (1s flush interval)
5. [x] `updateUI()` only updates changed sections — `updateStatus()` dirty-flag fingerprint; `updateUILight()` skips dropdown rebuild

### Logging
1. [x] Log level configurable via `02-macro-controller-config.json` — `LogManagerConfig` with per-level toggles in `log-manager.ts`
2. [x] Runtime log level change via Settings dialog — `buildLoggingPanel()` in `settings-tab-panels.ts`
3. [x] `debug` level shows all logs; `silent` shows none — `shouldLog()` checks `cfg.enabled` + per-level
4. [x] No direct `console.log` calls outside LogManager — all calls flow through `log()` → `shouldLog()`/`shouldConsole()`
5. [x] Log output targets (console, storage, bridge) independently toggleable — `consoleOutput`, `persistLogs`, `activityLogUi` flags
