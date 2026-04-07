/**
 * MacroLoop Controller — Auth JWT Utilities
 *
 * JWT decoding, time formatting, and refresh outcome tracking.
 * Extracted from sections.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { toErrorMessage } from '../error-utils';

export interface JwtInfo {
  valid: boolean;
  expiresAt: string;
  issuedAt: string;
  remainingMs: number;
  sub: string;
  error: string;
}

export interface RefreshOutcomeState {
  time: string;
  success: boolean;
  source: string;
  error: string;
}

// CQ11: Singleton for refresh outcome tracking
class RefreshOutcomeTracker {
  private _outcome: RefreshOutcomeState = { time: '', success: false, source: '', error: '' };

  get outcome(): RefreshOutcomeState {
    return this._outcome;
  }

  set outcome(v: RefreshOutcomeState) {
    this._outcome = v;
  }
}

const refreshOutcomeTracker = new RefreshOutcomeTracker();

/** Record the outcome of a token refresh attempt. */
export function recordRefreshOutcome(isSuccess: boolean, source: string, error?: string): void {
  const now = new Date();
  refreshOutcomeTracker.outcome = {
    time: now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    success: isSuccess,
    source,
    error: error || '',
  };
}

/** Get the last recorded refresh outcome. */
export function getLastRefreshOutcome(): RefreshOutcomeState {
  return refreshOutcomeTracker.outcome;
}

/** Decode a JWT token's payload and extract validity info. */
export function decodeJwtPayload(token: string): JwtInfo {
  const failResult: JwtInfo = { valid: false, expiresAt: '—', issuedAt: '—', remainingMs: 0, sub: '—', error: '' };

  try {
    const parts = token.split('.');
    const isNotJwt = parts.length !== 3;

    if (isNotJwt) {
      failResult.error = 'Not a JWT (expected 3 parts, got ' + parts.length + ')';
      return failResult;
    }

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expSeconds = typeof payload.exp === 'number' ? payload.exp : 0;
    const iatSeconds = typeof payload.iat === 'number' ? payload.iat : 0;
    const remainingMs = expSeconds ? (expSeconds - nowSeconds) * 1000 : 0;
    const isExpired = expSeconds <= nowSeconds;

    return {
      valid: !isExpired,
      expiresAt: expSeconds ? formatTimestamp(expSeconds) : '—',
      issuedAt: iatSeconds ? formatTimestamp(iatSeconds) : '—',
      remainingMs,
      sub: (payload.sub || payload.email || '—').toString().substring(0, 30),
      error: isExpired ? 'Token expired' : '',
    };
  } catch (e: unknown) {
    failResult.error = 'Decode failed: ' + toErrorMessage(e);
    return failResult;
  }
}

/**
 * Format a Unix timestamp (seconds) into a compact date+time string.
 * Same-day timestamps show time only; different-day includes the date.
 */
function formatTimestamp(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const now = new Date();
  const timeStr = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isSameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
  if (isSameDay) return timeStr;
  const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return monthDay + ' ' + timeStr;
}

/** Format milliseconds remaining into a human-readable duration. */
export function formatRemaining(milliseconds: number): string {
  const isExpired = milliseconds <= 0;

  if (isExpired) {
    return 'EXPIRED';
  }

  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hasHours = hours > 0;

  if (hasHours) {
    return hours + 'h ' + minutes + 'm';
  }

  const hasMinutes = minutes > 0;

  if (hasMinutes) {
    return minutes + 'm ' + seconds + 's';
  }

  return seconds + 's';
}
