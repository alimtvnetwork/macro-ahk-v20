/**
 * MacroLoop Controller — Runtime State Singletons
 *
 * Phase 5 split from shared-state.ts.
 * Contains: mutable state objects (activity log, credit, workspace selection,
 * auth session bridge, controller state).
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import {
  LoopDirection,
  type ControllerState,
  type LoopCreditState,
  type ActivityLogEntry,
} from './types';

// ============================================
// Activity log state (CQ11: singleton)
// ============================================
class ActivityLogState {
  private _visible = false;

  get visible(): boolean {
    return this._visible;
  }

  set visible(v: boolean) {
    this._visible = v;
  }
}

const activityLogState = new ActivityLogState();
export function getActivityLogVisible(): boolean { return activityLogState.visible; }
export function setActivityLogVisible(v: boolean): void { activityLogState.visible = v; }
/** @deprecated Use getActivityLogVisible(). Kept for backward compat. */
export { activityLogState };
export const activityLogLines: ActivityLogEntry[] = [];
import { ApiPath, DomId } from './types';
import { MAX_ACTIVITY_LINES, CREDIT_CACHE_TTL_S } from './constants';
export { CREDIT_CACHE_TTL_S };
export const maxActivityLines = MAX_ACTIVITY_LINES;
export const CREDIT_API_BASE = ApiPath.CreditApiBase;

export const loopCreditState: LoopCreditState = {
  lastCheckedAt: null,
  perWorkspace: [],
  currentWs: null,
  totalDailyFree: 0,
  totalRollover: 0,
  totalAvailable: 0,
  totalBillingAvail: 0,
  source: null,
  wsById: {}
};

// ============================================
// Workspace rename selection state (CQ11: singleton)
// ============================================
class WsSelectionState {
  private _checkedIds: Record<string, boolean> = {};
  private _lastCheckedIdx = -1;

  get checkedIds(): Record<string, boolean> {
    return this._checkedIds;
  }

  set checkedIds(v: Record<string, boolean>) {
    this._checkedIds = v;
  }

  get lastCheckedIdx(): number {
    return this._lastCheckedIdx;
  }

  set lastCheckedIdx(v: number) {
    this._lastCheckedIdx = v;
  }
}

const wsSelectionState = new WsSelectionState();
export function getLoopWsCheckedIds(): Record<string, boolean> { return wsSelectionState.checkedIds; }
export function setLoopWsCheckedIds(v: Record<string, boolean>): void { wsSelectionState.checkedIds = v; }
export function getLoopWsLastCheckedIdx(): number { return wsSelectionState.lastCheckedIdx; }
export function setLoopWsLastCheckedIdx(v: number): void { wsSelectionState.lastCheckedIdx = v; }
// ============================================
// Auth state (CQ11: singleton)
// ============================================
export { SESSION_BRIDGE_KEYS } from './constants';


class SessionBridgeState {
  private _source = '';

  get source(): string {
    return this._source;
  }

  set source(v: string) {
    this._source = v;
  }
}

const sessionBridgeState = new SessionBridgeState();
export function getLastSessionBridgeSource(): string { return sessionBridgeState.source; }
export function setLastSessionBridgeSource(v: string): void { sessionBridgeState.source = v; }

// ============================================
// Toast constants (legacy — now delegated to SDK marco.notify)
// ============================================
export const toastContainerId = DomId.ToastContainer;

// ============================================
// Controller State (Step 2i: moved from macro-looping.ts IIFE)
// Ref: workspace-cache.ts — workspaceName seeded from project-scoped localStorage
// ============================================

// Seed workspace name from project-scoped localStorage cache for UI-first strategy
import { getCachedWorkspaceName, migrateLegacyCache } from './workspace-cache';
import { isInvalidWorkspaceCandidateName } from './ws-name-matching';
migrateLegacyCache(); // one-time migration from old non-scoped keys
const _cachedWsNameRaw = getCachedWorkspaceName();
const _cachedWsName = isInvalidWorkspaceCandidateName(_cachedWsNameRaw) ? '' : _cachedWsNameRaw;

// loopCfg imported at shared-state.ts level — use config-validator defaults
import { RETRY_MAX_RETRIES as _retryMaxRetries, RETRY_BACKOFF_MS as _retryBackoffMs } from './constants';

export const state: ControllerState = {
  running: false,
  direction: LoopDirection.Down,
  cycleCount: 0,
  countdown: 0,
  isIdle: false,
  isDelegating: false,
  forceDirection: null,
  delegateStartTime: 0,
  loopIntervalId: null,
  countdownIntervalId: null,
  workspaceName: _cachedWsName,
  projectNameFromApi: '',
  projectNameFromDom: '',
  customDisplayName: (() => { try { return localStorage.getItem('marco_custom_display_name') || ''; } catch { return ''; } })(),
  hasFreeCredit: false,
  lastStatusCheck: 0,
  statusRefreshId: null,
  workspaceJustChanged: false,
  workspaceChangedTimer: null,
  workspaceObserverActive: false,
  workspaceFromApi: false,
  workspaceFromCache: !!_cachedWsName,
  isManualCheck: false,
  retryCount: 0,
  maxRetries: _retryMaxRetries,
  retryBackoffMs: _retryBackoffMs,
  lastRetryError: null,
  __cycleInFlight: false,
  __cycleRetryPending: false,
};
