/**
 * Credit Parser — API response parsing and tier resolution
 *
 * Extracted from credit-fetch.ts (module splitting).
 * Contains: parseLoopApiResponse, syncCreditStateFromApi, resolveWsTier, WsTier, WS_TIER_LABELS.
 */

import { log, logSub } from './logging';
import { CreditSource } from './types';
import { calcTotalCredits, calcAvailableCredits } from './credit-api';
import { loopCreditState, state } from './shared-state';

// ============================================
// Workspace Tier Enum
// ============================================
export const enum WsTier {
  FREE     = 'FREE',
  LITE     = 'LITE',
  PRO      = 'PRO',
  EXPIRED  = 'EXPIRED',
}

export const WS_TIER_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  FREE:    { label: 'FREE',    bg: 'rgba(255,255,255,0.08)', fg: '#94a3b8' },
  LITE:    { label: 'LITE',    bg: '#3b82f6',                fg: '#fff' },
  PRO:     { label: 'PRO',     bg: '#F59E0B',                fg: '#1a1a2e' },
  EXPIRED: { label: 'EXPIRED', bg: '#7f1d1d',                fg: '#fca5a5' },
};

/**
 * Derive workspace tier from plan name + subscription status + billing limit.
 * - plan "free" or empty + no billing → FREE
 * - plan "ktlo" or "lite" → LITE
 * - plan "free" + subStatus "canceled"/"cancelled" → EXPIRED (was pro, now canceled)
 * - billing limit > 0 + subStatus "active" → PRO
 * - billing limit > 0 + subStatus canceled → EXPIRED
 */
export function resolveWsTier(plan: string, subStatus: string, billingLimit: number): string {
  const p = (plan || '').toLowerCase().trim();
  const s = (subStatus || '').toLowerCase().trim();

  // Lite / ktlo plan
  if (p === 'ktlo' || p === 'lite') return 'LITE';

  // Has billing = was/is pro
  if (billingLimit > 0 || (p && p !== 'free')) {
    if (s === 'active') return 'PRO';
    if (s === 'canceled' || s === 'cancelled' || s === 'past_due') return 'EXPIRED';
    return 'PRO'; // default if billing exists
  }

  // Free plan + canceled sub = expired trial/pro
  if (s === 'canceled' || s === 'cancelled') return 'EXPIRED';

  return 'FREE';
}

// ============================================
// Expiry helpers — used by ws-list-renderer & filter logic
// ============================================

/**
 * Returns true when the workspace is in an "expired" subscription state.
 * Uses subscription_status (canonical signal): canceled / cancelled / past_due / unpaid.
 * Centralised here so the filter, badge, and sort code share one definition.
 */
export function isExpiredWs(ws: import('./types').WorkspaceCredit): boolean {
  const s = (ws.subscriptionStatus || '').toLowerCase().trim();
  return s === 'canceled' || s === 'cancelled' || s === 'past_due' || s === 'unpaid';
}

/**
 * Returns the integer number of full days since the workspace's
 * subscription_status last changed (i.e. since it became expired).
 * Returns null when no timestamp is available or it cannot be parsed.
 */
export function expiredDays(ws: import('./types').WorkspaceCredit): number | null {
  const iso = ws.subscriptionStatusChangedAt;
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const ms = Date.now() - t;
  if (ms < 0) return 0;
  return Math.floor(ms / 86400000);
}

// ============================================
// parseWorkspaceItem — extract a single workspace from API response
// ============================================
function parseWorkspaceItem(rawItem: Record<string, unknown>, wsIdx: number): import('./types').WorkspaceCredit {
  const rawWs = rawItem as Record<string, unknown>;
  const ws = (rawWs.workspace || rawWs) as Record<string, number | string>;
  const bUsed = (ws.billing_period_credits_used as number) || 0;
  const bLimit = (ws.billing_period_credits_limit as number) || 0;
  const dUsed = (ws.daily_credits_used as number) || 0;
  const dLimit = (ws.daily_credits_limit as number) || 0;
  const rUsed = (ws.rollover_credits_used as number) || 0;
  const rLimit = (ws.rollover_credits_limit as number) || 0;
  const freeGranted = (ws.credits_granted as number) || 0;
  const freeUsed = (ws.credits_used as number) || 0;
  const freeRemaining = Math.max(0, Math.round(freeGranted - freeUsed));

  const dailyFree = Math.max(0, Math.round(dLimit - dUsed));
  const rollover = Math.max(0, Math.round(rLimit - rUsed));
  const billingAvailable = Math.max(0, Math.round(bLimit - bUsed));
  const topupLimit = Math.round((ws.topup_credits_limit as number) || 0);
  const totalCreditsUsed = Math.round((ws.total_credits_used as number) || 0);
  const totalCredits = calcTotalCredits(freeGranted, dLimit, bLimit, topupLimit, rLimit);
  const available = calcAvailableCredits(totalCredits, rUsed, dUsed, bUsed, freeUsed);

  const subStatus = ((rawWs.workspace ? (rawWs as Record<string, unknown>).subscription_status : ws.subscription_status) || '') as string;
  const subStatusChangedAt = ((rawWs.workspace ? (rawWs as Record<string, unknown>).subscription_status_changed_at : ws.subscription_status_changed_at) || '') as string;
  const role = ((rawWs.workspace ? (rawWs as Record<string, unknown>).role : ws.role) || 'N/A') as string;
  const plan = ((rawWs.workspace ? (rawWs as Record<string, unknown>).plan : ws.plan) || (rawWs.plan as string) || '') as string;

  return {
    id: (ws.id as string) || '',
    name: ((ws.name as string) || 'WS' + wsIdx).substring(0, 12),
    fullName: (ws.name as string) || 'WS' + wsIdx,
    dailyFree, dailyLimit: Math.round(dLimit),
    dailyUsed: Math.round(dUsed),
    rollover, rolloverLimit: Math.round(rLimit),
    rolloverUsed: Math.round(rUsed),
    available, billingAvailable,
    used: Math.round(bUsed),
    limit: Math.round(bLimit),
    freeGranted: Math.round(freeGranted), freeRemaining,
    hasFree: freeGranted > 0 && freeUsed < freeGranted,
    topupLimit,
    totalCreditsUsed,
    totalCredits,
    subscriptionStatus: subStatus, subscriptionStatusChangedAt: subStatusChangedAt, plan, role,
    tier: resolveWsTier(plan, subStatus, bLimit),
    raw: ws,
    rawApi: rawWs as Record<string, unknown>
  };
}

// ============================================
// aggregateCreditTotals — sum per-workspace credits
// ============================================
function aggregateCreditTotals(perWs: import('./types').WorkspaceCredit[]): void {
  let tdf = 0, tr = 0, ta = 0, tba = 0;
  for (const ws of perWs) {
    tdf += ws.dailyFree;
    tr += ws.rollover;
    ta += ws.available;
    tba += ws.billingAvailable;
  }
  loopCreditState.totalDailyFree = tdf;
  loopCreditState.totalRollover = tr;
  loopCreditState.totalAvailable = ta;
  loopCreditState.totalBillingAvail = tba;
}

// ============================================
// matchCurrentWorkspace — find current ws by name
// ============================================
function matchCurrentWorkspace(perWs: import('./types').WorkspaceCredit[]): void {
  if (!state.workspaceName || perWs.length === 0) return;
  for (const ws of perWs) {
    if (ws.fullName === state.workspaceName || ws.name === state.workspaceName) {
      loopCreditState.currentWs = ws;
      return;
    }
  }
}

// ============================================
// buildWsByIdIndex — O(1) lookup dictionary
// ============================================
function buildWsByIdIndex(perWs: import('./types').WorkspaceCredit[]): void {
  loopCreditState.wsById = {};
  for (const ws of perWs) {
    if (ws.id) loopCreditState.wsById[ws.id] = ws;
  }
}

// ============================================
// parseLoopApiResponse — parse /user/workspaces API response
// ============================================
export function parseLoopApiResponse(data: Record<string, unknown>): boolean {
  const workspaces = (data.workspaces || data || []) as Array<Record<string, unknown>>;
  if (!Array.isArray(workspaces)) {
    log('parseLoopApiResponse: unexpected response shape', 'warn');
    return false;
  }

  const perWs = workspaces.map((raw, idx) => parseWorkspaceItem(raw, idx));

  loopCreditState.perWorkspace = perWs;
  loopCreditState.lastCheckedAt = Date.now();

  aggregateCreditTotals(perWs);
  matchCurrentWorkspace(perWs);
  buildWsByIdIndex(perWs);

  loopCreditState.source = CreditSource.Api;
  log('Credit API: parsed ' + perWs.length + ' workspaces — dailyFree=' + loopCreditState.totalDailyFree + ' rollover=' + loopCreditState.totalRollover + ' available=' + loopCreditState.totalAvailable + ' | wsById keys=' + Object.keys(loopCreditState.wsById).length, 'success');
  return true;
}

// ============================================
// syncCreditStateFromApi — sync loop state from API data
// ============================================
export function syncCreditStateFromApi(): void {
  const cws = loopCreditState.currentWs;
  if (!cws) {
    logSub('syncCreditState: no currentWs — cannot determine credit', 1);
    return;
  }
  const dailyFree = cws.dailyFree || 0;
  const hasCredit = dailyFree > 0;
  state.hasFreeCredit = hasCredit;
  state.isIdle = !hasCredit;
  state.lastStatusCheck = Date.now();
  log('API Credit Sync: ' + cws.fullName + ' dailyFree=' + dailyFree + ' (available=' + cws.available + ') → ' + (hasCredit ? '[Y] FREE CREDIT' : '[N] NO FREE CREDIT → will move'), hasCredit ? 'success' : 'warn');
}
