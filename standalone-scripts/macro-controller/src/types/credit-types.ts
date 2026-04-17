/**
 * Macro Controller — Credit & API Response Type Definitions
 *
 * Phase 5E: Extracted from types.ts.
 * Contains credit state, workspace info, API response types, and diagnostics.
 */

/** Source of credit data. */
export enum CreditSource {
  Api = 'api',
  Cache = 'cache',
}

/** A single workspace's credit breakdown from the API. */
export interface WorkspaceCredit {
  id: string;
  name: string;
  fullName: string;
  dailyFree: number;
  dailyUsed: number;
  dailyLimit: number;
  rolloverUsed: number;
  rolloverLimit: number;
  freeGranted: number;
  freeRemaining: number;
  used: number;
  limit: number;
  topupLimit: number;
  totalCredits: number;
  available: number;
  rollover: number;
  billingAvailable: number;
  hasFree: boolean;
  totalCreditsUsed: number;
  subscriptionStatus: string;
  /**
   * ISO 8601 timestamp of the last subscription_status change (from the API field
   * `subscription_status_changed_at`). When tier === 'EXPIRED' this marks when the
   * expiry/cancel/past_due transition happened, used to compute the "expired · Nd" badge.
   * Empty string when the API does not provide it.
   */
  subscriptionStatusChangedAt: string;
  plan: string;
  role: string;
  tier: string;
  raw: Record<string, string | number>;
  /**
   * Verbatim raw API workspace section as returned by /user/workspaces.
   * Preserved as a JSON-stringifyable object for the right-click "Copy JSON" action.
   * Keys/values reflect the exact server response (snake_case, nested objects, arrays).
   */
  rawApi: Record<string, unknown>;
  [key: string]: string | number | boolean | Record<string, string | number> | Record<string, unknown> | undefined;
}

export interface LoopCreditState {
  lastCheckedAt: number | null;
  perWorkspace: WorkspaceCredit[];
  currentWs: WorkspaceCredit | null;
  totalDailyFree: number;
  totalRollover: number;
  totalAvailable: number;
  totalBillingAvail: number;
  source: CreditSource | null;
  wsById: Record<string, WorkspaceCredit>;
}

export interface WorkspaceInfo {
  id: string;
  name: string;
  plan: string;
  credits?: CreditInfo;
}

export interface CreditInfo {
  available: number;
  bonus: number;
  billing: number;
  rollover: number;
  daily: number;
  total: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  workspace_id: string;
}

/** Tier 1 Mark-Viewed Response */
export interface MarkViewedResponse {
  workspace_id?: string;
  workspaceId?: string;
  project?: { workspace_id?: string; name?: string; title?: string };
  name?: string;
  title?: string;
  [key: string]: unknown;
}

/** Credit Balance API Response (GET /workspaces/{id}/credit-balance) */
export interface CreditBalanceResponse {
  ledger_enabled?: boolean;
  total_remaining: number;
  total_granted: number;
  daily_remaining: number;
  daily_limit: number;
  total_billing_period_used: number;
  expiring_grants: unknown[];
  grant_type_balances: GrantTypeBalance[];
}

export interface GrantTypeBalance {
  grant_type: string;
  granted: number;
  remaining: number;
}

/** Credit Balance Config (from [CreditStatus.Balance] in config) */
export interface CreditBalanceConfig {
  checkIntervalSeconds: number;
  minDailyCredit: number;
  enableApiDetection: boolean;
  fallbackToXPath: boolean;
}

/** Diagnostic Dump */
export interface DiagnosticDump {
  version: string;
  workspaceName: string;
  workspaceFromApi: boolean;
  currentWsName: string;
  currentWsId: string;
  [key: string]: unknown;
}
