/**
 * MacroLoop Controller — CSV Export for Workspace Credits
 *
 * Builds and downloads CSV files of workspace credit data,
 * with options for all workspaces or only those with available credits.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { loopCreditState } from './shared-state';
import type { WorkspaceCredit } from './types';
import { log } from './logging';

// ── CSV Helpers ──

function csvVal(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) {
    return '';
  }
  const s = String(v);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCsvRow(ws: WorkspaceCredit): (string | number)[] {
  const r: Record<string, string | number> = ws.raw || {};
  const m: Record<string, string> = (r.membership || {}) as Record<string, string>;
  return [
    csvVal(ws.fullName),
    csvVal(ws.id),
    csvVal(m.email || ''),
    csvVal(m.role || ws.role || ''),
    csvVal(r.plan || ''),
    csvVal(r.plan_type || ''),
    csvVal(ws.subscriptionStatus || r.subscription_status || ''),
    csvVal(r.subscription_currency || ''),
    csvVal(r.payment_provider || ''),
    ws.dailyFree,
    ws.dailyLimit,
    ws.dailyUsed,
    r.daily_credits_used_in_billing_period != null ? r.daily_credits_used_in_billing_period : '',
    ws.rollover,
    ws.rolloverLimit,
    ws.rolloverUsed,
    ws.billingAvailable,
    ws.limit,
    ws.used,
    ws.freeGranted,
    ws.freeRemaining,
    ws.topupLimit,
    r.topup_credits_used != null ? r.topup_credits_used : '',
    ws.totalCredits,
    ws.totalCreditsUsed != null ? ws.totalCreditsUsed : (r.total_credits_used != null ? r.total_credits_used : ''),
    r.total_credits_used_in_billing_period != null ? r.total_credits_used_in_billing_period : '',
    ws.available,
    r.backend_total_used_in_billing_period != null ? r.backend_total_used_in_billing_period : '',
    r.num_projects != null ? r.num_projects : '',
    r.referral_count != null ? r.referral_count : '',
    r.followers_count != null ? r.followers_count : '',
    csvVal(r.billing_period_start_date || ''),
    csvVal(r.billing_period_end_date || ''),
    csvVal(r.next_monthly_credit_grant_date || ''),
    csvVal(r.created_at || ''),
    csvVal(r.updated_at || ''),
    csvVal(r.owner_id || ''),
    r.mcp_enabled != null ? r.mcp_enabled : ''
  ];
}

const CSV_HEADER = [
  'Workspace Name', 'Workspace ID', 'Email', 'Role',
  'Plan', 'Plan Type', 'Subscription Status', 'Subscription Currency', 'Payment Provider',
  'Daily Free', 'Daily Limit', 'Daily Used', 'Daily Used In Billing',
  'Rollover', 'Rollover Limit', 'Rollover Used',
  'Billing Available', 'Billing Limit', 'Billing Used',
  'Granted', 'Granted Remaining', 'Topup Limit', 'Topup Used',
  'Total Credits', 'Total Credits Used', 'Total Used In Billing', 'Available Credits',
  'Backend Used In Billing',
  'Num Projects', 'Referral Count', 'Followers Count',
  'Billing Period Start', 'Billing Period End', 'Next Credit Grant Date',
  'Created At', 'Updated At',
  'Owner ID', 'MCP Enabled'
].join(',');

function downloadCsvBlob(csvText: string, filename: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Exports ──

export function exportWorkspacesAsCsv(): void {
  const workspaces = loopCreditState.perWorkspace;
  if (!workspaces || workspaces.length === 0) {
    log('CSV Export: No workspace data — fetch credits first (💳)', 'warn');
    return;
  }

  const sorted = workspaces.slice().sort(function(a: WorkspaceCredit, b: WorkspaceCredit) {
    return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
  });

  const lines = [CSV_HEADER];

  for (const ws of sorted) {
    lines.push(buildCsvRow(ws).join(','));
  }

  downloadCsvBlob(lines.join('\n'), 'workspaces-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
  log('CSV Export: Downloaded ' + sorted.length + ' workspaces (sorted A→Z)', 'success');
}

export function exportAvailableWorkspacesAsCsv(): void {
  const workspaces = loopCreditState.perWorkspace;
  if (!workspaces || workspaces.length === 0) {
    log('CSV Export (available): No workspace data — fetch credits first (💳)', 'warn');
    return;
  }

  const filtered = workspaces.filter(function(ws: WorkspaceCredit) {
    return (ws.available || 0) > 0;
  });

  if (filtered.length === 0) {
    log('CSV Export (available): No workspaces with available credits > 0', 'warn');
    return;
  }

  const sorted = filtered.slice().sort(function(a: WorkspaceCredit, b: WorkspaceCredit) {
    return (a.fullName || '').toLowerCase().localeCompare((b.fullName || '').toLowerCase());
  });

  const lines = [CSV_HEADER];

  for (const ws of sorted) {
    lines.push(buildCsvRow(ws).join(','));
  }

  downloadCsvBlob(lines.join('\n'), 'workspaces-available-' + new Date().toISOString().replace(/[:.]/g, '-') + '.csv');
  log('CSV Export (available): Downloaded ' + sorted.length + '/' + workspaces.length + ' workspaces with credits > 0', 'success');
}
