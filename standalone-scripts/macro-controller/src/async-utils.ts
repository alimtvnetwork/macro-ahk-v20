/**
 * MacroLoop Controller — Async Utilities (SDK Delegation Layer)
 *
 * This module re-exports async utilities from the marco-sdk (`window.marco.utils`)
 * at runtime when available, with built-in fallbacks for standalone usage.
 *
 * The canonical implementations live in `standalone-scripts/marco-sdk/src/utils.ts`.
 * This shim ensures backward compatibility and provides the same API surface.
 *
 * @see spec/06-coding-guidelines/02-typescript-immutability-standards.md — Rule CQ18
 */

// ============================================
// Types (re-exported for consumers)
// ============================================

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly delayMs: number;
  readonly backoffMultiplier?: number;
  readonly onRetry?: (attempt: number, error: Error) => void;
}

export interface ConcurrencyLockResult<T> {
  readonly value: T;
  readonly wasQueued: boolean;
}

export interface ConcurrencyLock<T> {
  run(fn: () => Promise<T>, timeoutMs?: number, fallback?: T): Promise<ConcurrencyLockResult<T>>;
  readonly isInFlight: boolean;
}

export interface PollUntilOptions {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly onTimeout?: () => void;
  readonly onFound?: (elapsedMs: number) => void;
}

// ============================================
// SDK Runtime Access
// ============================================

interface SdkUtils {
  withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T>;
  withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T>;
  createConcurrencyLock<T>(): ConcurrencyLock<T>;
  delay(ms: number): Promise<void>;
  pollUntil<T>(condition: () => T | null | undefined | false, options?: PollUntilOptions): Promise<T | null>;
  debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void;
  throttle<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void;
  safeJsonParse<T>(json: string, fallback: T): T;
  formatDuration(ms: number): string;
  uid(prefix?: string): string;
  deepClone<T>(value: T): T;
  isObject(value: string | number | boolean | object | null | undefined): value is Record<string, string | number | boolean | null>;
}

function getSdkUtils(): SdkUtils | null {
  try {
    const w = window as unknown as { marco?: { utils?: SdkUtils } };

    if (w.marco && w.marco.utils) {
      return w.marco.utils;
    }
  } catch { /* not available */ }

  return null;
}

// ============================================
// withTimeout
// ============================================

export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  const sdk = getSdkUtils();

  if (sdk) {
    return sdk.withTimeout(promise, ms, fallback);
  }

  return new Promise<T>(function (resolve) {
    let isSettled = false;
    const timer = setTimeout(function () {
      if (isSettled) { return; }
      isSettled = true;
      resolve(fallback);
    }, ms);
    promise.then(function (value) {
      if (isSettled) { return; }
      isSettled = true;
      clearTimeout(timer);
      resolve(value);
    });
  });
}

// ============================================
// withRetry
// ============================================

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sdk = getSdkUtils();

  if (sdk) {
    return sdk.withRetry(fn, options);
  }

  let currentDelay = options.delayMs;
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === options.maxAttempts) { throw error; }
      if (options.onRetry) { options.onRetry(attempt, error); }
      await delay(currentDelay);
      if (options.backoffMultiplier !== undefined) {
        currentDelay = currentDelay * options.backoffMultiplier;
      }
    }
  }

  throw new Error('withRetry: exhausted all attempts');
}

// ============================================
// CQ16: Extracted from createConcurrencyLock
// ============================================

interface WaiterEntry<T> {
  resolve: (result: ConcurrencyLockResult<T>) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

function resolveAllWaiters<T>(waiters: WaiterEntry<T>[], value: T): void {
  const pending = waiters.splice(0);
  for (const waiter of pending) {
    if (waiter.timer !== null) { clearTimeout(waiter.timer); }
    waiter.resolve({ value, wasQueued: true });
  }
}

// ============================================
// ConcurrencyLock
// ============================================

export function createConcurrencyLock<T>(): ConcurrencyLock<T> {
  const sdk = getSdkUtils();

  if (sdk) {
    return sdk.createConcurrencyLock<T>();
  }

  let inFlight: Promise<T> | null = null;
  const waiters: WaiterEntry<T>[] = [];

  return {
    get isInFlight(): boolean { return inFlight !== null; },
    run(fn: () => Promise<T>, timeoutMs?: number, fallback?: T): Promise<ConcurrencyLockResult<T>> {
      if (inFlight !== null) {
        return new Promise<ConcurrencyLockResult<T>>(function (resolve) {
          const entry: WaiterEntry<T> = { resolve, timer: null };
          if (timeoutMs !== undefined && fallback !== undefined) {
            entry.timer = setTimeout(function () {
              const idx = waiters.indexOf(entry);
              if (idx !== -1) { waiters.splice(idx, 1); }
              resolve({ value: fallback!, wasQueued: true });
            }, timeoutMs);
          }
          waiters.push(entry);
        });
      }
      inFlight = fn();

      return inFlight.then(function (value) {
        inFlight = null;
        resolveAllWaiters(waiters, value);

        return { value, wasQueued: false };
      });
    },
  };
}

// ============================================
// delay
// ============================================

export function delay(ms: number): Promise<void> {
  const sdk = getSdkUtils();

  if (sdk) {
    return sdk.delay(ms);
  }

  return new Promise<void>(function (resolve) { setTimeout(resolve, ms); });
}

// ============================================
// pollUntil
// ============================================

export function pollUntil<T>(
  condition: () => T | null | undefined | false,
  options: PollUntilOptions = {},
): Promise<T | null> {
  const sdk = getSdkUtils();

  if (sdk) {
    return sdk.pollUntil(condition, options);
  }

  const intervalMs = options.intervalMs ?? 200;
  const timeoutMs = options.timeoutMs ?? 5000;

  return new Promise<T | null>(function (resolve) {
    const startedAt = Date.now();
    const immediate = condition();

    if (immediate) {
      if (options.onFound) { options.onFound(0); }
      resolve(immediate);

      return;
    }

    const timer = setInterval(function () {
      const elapsed = Date.now() - startedAt;
      const result = condition();

      if (result) {
        clearInterval(timer);
        if (options.onFound) { options.onFound(elapsed); }
        resolve(result);

        return;
      }

      if (elapsed >= timeoutMs) {
        clearInterval(timer);
        if (options.onTimeout) { options.onTimeout(); }
        resolve(null);
      }
    }, intervalMs);
  });
}
