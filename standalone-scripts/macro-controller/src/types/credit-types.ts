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
  plan: string;
  role: string;
  tier: string;
  raw: Record<string, string | number>;
  [key: string]: string | number | boolean | Record<string, string | number> | undefined;
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
  status?: string;
  message?: string;
}

/** Credit Balance API Response (GET /workspaces/{id}/credit-balance) */
export interface CreditBalanceResponse {
  ledger_enabled?: boolean;
  total_remaining: number;
  total_granted: number;
  daily_remaining: number;
  daily_limit: number;
  total_billing_period_used: number;
  expiring_grants: Array<{ amount: number; expires_at: string }>;
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
  loopRunning: boolean;
  tokenSource: string;
  creditBarVisible: boolean;
  lastCreditCheckAt: string;
  lastError: string;
}
