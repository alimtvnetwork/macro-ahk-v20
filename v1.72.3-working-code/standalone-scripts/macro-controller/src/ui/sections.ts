/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — UI Sections
 * Step 03h: Extracted from macro-looping.ts createUI closure
 *
 * Contains: createCollapsibleSection, createWsHistorySection, createAuthDiagRow
 */

import {
  cSectionBg, cSectionToggle, cSectionHeader,
  cPanelFgDim, cPrimaryLight, cPrimaryLighter
} from '../shared-state';
import { getTimingEntries, getTimingSinceLoadMs, type TimingEntry } from '../startup-timing';

// ============================================
// Collapsible section helper with localStorage persistence
// ============================================
export interface CollapsibleResult {
  section: HTMLElement;
  header: HTMLElement;
  toggle: HTMLElement;
  titleEl: HTMLElement;
  body: HTMLElement;
}

export function createCollapsibleSection(title: string, storageKey: string, opts?: any): CollapsibleResult {
  opts = opts || {};
  const section = document.createElement('div');
  section.style.cssText = 'padding:4px 6px;background:' + cSectionBg + ';border-radius:4px;';
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;cursor:pointer;user-select:none;padding:2px 4px;border-radius:3px;transition:background-color 150ms ease;';
  header.onmouseenter = function() { header.style.backgroundColor = 'rgba(255,255,255,0.06)'; };
  header.onmouseleave = function() { header.style.backgroundColor = ''; };
  const toggle = document.createElement('span');
  toggle.style.cssText = 'font-size:10px;color:' + cSectionToggle + ';margin-right:4px;';
  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:10px;color:' + cSectionHeader + ';font-weight:bold;';
  titleEl.textContent = title;
  header.appendChild(toggle);
  header.appendChild(titleEl);
  const body = document.createElement('div');
  body.style.cssText = 'margin-top:4px;';
  let savedState: string | null = null;
  try { savedState = localStorage.getItem(storageKey); } catch(e) {}
  const isCollapsed = savedState !== null ? savedState === 'collapsed' : true;
  body.style.display = isCollapsed ? 'none' : '';
  toggle.textContent = isCollapsed ? '[+]' : '[-]';
  header.onclick = function() {
    let hidden = body.style.display === 'none';
    body.style.display = hidden ? '' : 'none';
    toggle.textContent = hidden ? '[-]' : '[+]';
    try { localStorage.setItem(storageKey, hidden ? 'expanded' : 'collapsed'); } catch(e) {}
  };
  section.appendChild(header);
  section.appendChild(body);
  return { section, header, toggle, titleEl, body };
}

// ============================================
// Workspace History section
// ============================================
export interface WsHistoryDeps {
  getWorkspaceHistory: () => any[];
  getDisplayProjectName: () => string;
  getWsHistoryKey: () => string;
}

export interface WsHistoryResult {
  section: HTMLElement;
  renderWsHistory: () => void;
}

export function createWsHistorySection(deps: WsHistoryDeps): WsHistoryResult {
  const wsHistoryCol = createCollapsibleSection('Workspace History', 'ml_collapse_wshistory');

  const wsHistoryPanel = document.createElement('div');
  wsHistoryPanel.id = 'loop-ws-history-panel';
  wsHistoryPanel.style.cssText = 'padding:4px;background:rgba(0,0,0,.5);border:1px solid #b45309;border-radius:3px;max-height:120px;overflow-y:auto;';

  function renderWsHistory() {
    let history = deps.getWorkspaceHistory();
    const projectName = deps.getDisplayProjectName();
    const historyKey = deps.getWsHistoryKey();
    if (history.length === 0) {
      wsHistoryPanel.innerHTML = '<div style="color:' + cPanelFgDim + ';font-size:10px;padding:4px;">No workspace changes recorded for project "' + projectName + '"</div>';
      return;
    }
    let html = '<div style="font-size:9px;color:' + cPrimaryLight + ';padding:2px 0;margin-bottom:2px;">📁 Project: ' + projectName + ' (' + history.length + ' entries)</div>';
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      html += '<div style="font-size:10px;font-family:monospace;padding:2px 0;color:#fbbf24;">';
      html += '<span style="color:' + cPanelFgDim + ';">[' + e.display + ']</span> ';
      html += '<span style="color:#ef4444;">' + e.from + '</span>';
      html += ' <span style="color:#9ca3af;">→</span> ';
      html += '<span style="color:#10b981;">' + e.to + '</span>';
      html += '</div>';
    }
    html += '<div style="margin-top:4px;text-align:right;"><button onclick="(function(){try{localStorage.removeItem(\'' + historyKey + '\');document.getElementById(\'loop-ws-history-panel\').innerHTML=\'<div style=\\\'color:' + cPanelFgDim + ';font-size:10px;padding:4px;\\\'>History cleared</div>\';}catch(e){}})();" style="padding:2px 6px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:2px;font-size:9px;cursor:pointer;">Clear History</button></div>';
    wsHistoryPanel.innerHTML = html;
  }

  wsHistoryCol.body.appendChild(wsHistoryPanel);
  const origWsHistoryClick = wsHistoryCol.header.onclick as (() => void) | null;
  wsHistoryCol.header.onclick = function() {
    if (origWsHistoryClick) origWsHistoryClick();
    if (wsHistoryCol.body.style.display !== 'none') renderWsHistory();
  };
  if (wsHistoryCol.body.style.display !== 'none') renderWsHistory();

  return { section: wsHistoryCol.section, renderWsHistory };
}

// ============================================
// Auth Diagnostic Row
// ============================================
export interface AuthDiagDeps {
  getLastTokenSource: () => string;
  resolveToken: () => string;
  recoverAuthOnce: () => Promise<string>;
  getSessionCookieNames: () => string[];
  getLastBridgeOutcome: () => { attempted: boolean; success: boolean; source: string; error: string };
  refreshFromBestSource: (cb: (token: string, source: string) => void) => void;
}

export interface AuthDiagResult {
  row: HTMLElement;
  updateAuthDiagRow: () => void;
}

interface JwtInfo {
  valid: boolean;
  expiresAt: string;
  issuedAt: string;
  remainingMs: number;
  sub: string;
  error: string;
}

function decodeJwtPayload(token: string): JwtInfo {
  const fail: JwtInfo = { valid: false, expiresAt: '—', issuedAt: '—', remainingMs: 0, sub: '—', error: '' };
  try {
    const parts = token.split('.');
    if (parts.length !== 3) { fail.error = 'Not a JWT (expected 3 parts, got ' + parts.length + ')'; return fail; }
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);
    const exp = typeof payload.exp === 'number' ? payload.exp : 0;
    const iat = typeof payload.iat === 'number' ? payload.iat : 0;
    const remainingMs = exp ? (exp - now) * 1000 : 0;
    return {
      valid: exp > now,
      expiresAt: exp ? new Date(exp * 1000).toLocaleTimeString('en-US', { hour12: false }) : '—',
      issuedAt: iat ? new Date(iat * 1000).toLocaleTimeString('en-US', { hour12: false }) : '—',
      remainingMs: remainingMs,
      sub: (payload.sub || payload.email || '—').toString().substring(0, 30),
      error: exp <= now ? 'Token expired' : '',
    };
  } catch (e: unknown) {
    fail.error = 'Decode failed: ' + ((e as Error)?.message || e);
    return fail;
  }
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'EXPIRED';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

// Shared state for last refresh outcome
let _lastRefreshOutcome = { time: '', success: false, source: '', error: '' };

export function recordRefreshOutcome(success: boolean, source: string, error?: string): void {
  const now = new Date();
  _lastRefreshOutcome = {
    time: now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    success: success,
    source: source,
    error: error || '',
  };
}

export function createAuthDiagRow(deps: AuthDiagDeps): AuthDiagResult {
  const col = createCollapsibleSection('🔐 Auth Diagnostics', 'ml_collapse_auth_diag');
  // Issue 82: Auth diagnostics should always start collapsed unless user explicitly expanded
  // Force collapsed on fresh creation — localStorage persistence still works for subsequent toggles
  col.body.style.display = 'none';
  col.toggle.textContent = '[+]';

  const diagBody = col.body;
  diagBody.style.cssText = 'margin-top:4px;display:none;flex-direction:column;gap:3px;font-size:10px;font-family:monospace;';

  // Override toggle to use display:flex instead of display:'' for this flex container
  col.header.onclick = function() {
    const hidden = diagBody.style.display === 'none';
    diagBody.style.display = hidden ? 'flex' : 'none';
    col.toggle.textContent = hidden ? '[-]' : '[+]';
    try { localStorage.setItem('ml_collapse_auth_diag', hidden ? 'expanded' : 'collapsed'); } catch(e) {}
  };

  const dimStyle = 'color:' + cPanelFgDim + ';';
  const valStyle = 'color:' + cPrimaryLighter + ';';
  const rowCss = 'display:flex;align-items:center;gap:6px;padding:2px 4px;background:rgba(0,0,0,.2);border-radius:3px;';

  // --- Token Source row ---
  const srcRow = document.createElement('div');
  srcRow.style.cssText = rowCss;
  const srcLabel = document.createElement('span');
  srcLabel.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  srcLabel.textContent = 'Source:';
  const srcIcon = document.createElement('span');
  srcIcon.style.cssText = 'font-size:11px;';
  const srcVal = document.createElement('span');
  srcVal.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  srcRow.appendChild(srcIcon);
  srcRow.appendChild(srcLabel);
  srcRow.appendChild(srcVal);

  // --- JWT Validity row ---
  const jwtRow = document.createElement('div');
  jwtRow.style.cssText = rowCss;
  const jwtLabel = document.createElement('span');
  jwtLabel.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  jwtLabel.textContent = 'JWT:';
  const jwtIcon = document.createElement('span');
  jwtIcon.style.cssText = 'font-size:11px;';
  const jwtVal = document.createElement('span');
  jwtVal.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  jwtRow.appendChild(jwtIcon);
  jwtRow.appendChild(jwtLabel);
  jwtRow.appendChild(jwtVal);

  // --- JWT Detail row (sub + iat + exp) ---
  const jwtDetailRow = document.createElement('div');
  jwtDetailRow.style.cssText = rowCss + 'flex-wrap:wrap;';
  const jwtDetailVal = document.createElement('span');
  jwtDetailVal.style.cssText = dimStyle + 'font-size:9px;flex:1;';
  jwtDetailRow.appendChild(jwtDetailVal);

  // --- Last Refresh row ---
  const refreshRow = document.createElement('div');
  refreshRow.style.cssText = rowCss;
  const refreshLabel = document.createElement('span');
  refreshLabel.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  refreshLabel.textContent = 'Refresh:';
  const refreshIcon = document.createElement('span');
  refreshIcon.style.cssText = 'font-size:11px;';
  const refreshVal = document.createElement('span');
  refreshVal.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  refreshRow.appendChild(refreshIcon);
  refreshRow.appendChild(refreshLabel);
  refreshRow.appendChild(refreshVal);

  // --- Refresh button ---
  const refreshBtn = document.createElement('button');
  refreshBtn.style.cssText = 'padding:2px 8px;background:#1e3a5f;color:' + cPrimaryLighter + ';border:1px solid #2563eb;border-radius:3px;font-size:9px;cursor:pointer;margin-top:2px;transition:background 0.15s;';
  refreshBtn.textContent = '🔄 Force Refresh Token';
  refreshBtn.onmouseenter = function() { refreshBtn.style.background = '#2563eb'; };
  refreshBtn.onmouseleave = function() { refreshBtn.style.background = '#1e3a5f'; };
  refreshBtn.onclick = function() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '⏳ Refreshing…';
    deps.recoverAuthOnce().then(function(token: string) {
      const source = token ? deps.getLastTokenSource() : 'none';
      recordRefreshOutcome(!!token, source, token ? '' : 'No token from any source');
      updateAuthDiagRow();
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Force Refresh Token';
    });
  };

  // --- Cookie Names row ---
  const cookieRow = document.createElement('div');
  cookieRow.style.cssText = rowCss;
  const cookieLabel = document.createElement('span');
  cookieLabel.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  cookieLabel.textContent = 'Cookies:';
  const cookieIcon = document.createElement('span');
  cookieIcon.style.cssText = 'font-size:11px;';
  const cookieVal = document.createElement('span');
  cookieVal.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;';
  cookieRow.appendChild(cookieIcon);
  cookieRow.appendChild(cookieLabel);
  cookieRow.appendChild(cookieVal);

  // --- Bridge Outcome row ---
  const bridgeRow = document.createElement('div');
  bridgeRow.style.cssText = rowCss;
  const bridgeLabel = document.createElement('span');
  bridgeLabel.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  bridgeLabel.textContent = 'Bridge:';
  const bridgeIcon = document.createElement('span');
  bridgeIcon.style.cssText = 'font-size:11px;';
  const bridgeVal = document.createElement('span');
  bridgeVal.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  bridgeRow.appendChild(bridgeIcon);
  bridgeRow.appendChild(bridgeLabel);
  bridgeRow.appendChild(bridgeVal);

  // --- Read Cookie button (quick access) ---
  const readCookieBtn = document.createElement('button');
  readCookieBtn.style.cssText = 'padding:2px 8px;background:#1e3a5f;color:' + cPrimaryLighter + ';border:1px solid #2563eb;border-radius:3px;font-size:9px;cursor:pointer;margin-top:2px;transition:background 0.15s;';
  readCookieBtn.textContent = '🍪 Read Cookie';
  readCookieBtn.title = 'Read session token from extension bridge and save to localStorage';
  readCookieBtn.onmouseenter = function() { readCookieBtn.style.background = '#2563eb'; };
  readCookieBtn.onmouseleave = function() { readCookieBtn.style.background = '#1e3a5f'; };
  readCookieBtn.onclick = function() {
    readCookieBtn.disabled = true;
    readCookieBtn.textContent = '⏳ Reading…';
    deps.refreshFromBestSource(function(token: string, source: string) {
      recordRefreshOutcome(!!token, source, token ? '' : 'No token from any source');
      updateAuthDiagRow();
      readCookieBtn.disabled = false;
      readCookieBtn.textContent = token ? '✅ Read Cookie' : '❌ Read Cookie';
      setTimeout(function() { readCookieBtn.textContent = '🍪 Read Cookie'; }, 2000);
    });
  };

  // --- Button row (Force Refresh + Read Cookie side by side) ---
  const btnRowDiag = document.createElement('div');
  btnRowDiag.style.cssText = 'display:flex;gap:4px;margin-top:2px;';
  btnRowDiag.appendChild(refreshBtn);
  btnRowDiag.appendChild(readCookieBtn);

  diagBody.appendChild(cookieRow);
  diagBody.appendChild(bridgeRow);
  diagBody.appendChild(srcRow);
  diagBody.appendChild(jwtRow);
  diagBody.appendChild(jwtDetailRow);
  diagBody.appendChild(refreshRow);
  diagBody.appendChild(btnRowDiag);

  // --- Startup Timing Waterfall ---
  const waterfallContainer = document.createElement('div');
  waterfallContainer.style.cssText = 'margin-top:6px;padding:4px 6px;background:rgba(0,0,0,.25);border-radius:4px;';
  const waterfallHeader = document.createElement('div');
  waterfallHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';
  const waterfallTitle = document.createElement('span');
  waterfallTitle.style.cssText = 'font-size:9px;font-weight:bold;color:' + cPanelFgDim + ';';
  waterfallTitle.textContent = '⏱ Startup Waterfall';
  const refreshWfBtn = document.createElement('button');
  refreshWfBtn.style.cssText = 'padding:1px 5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:3px;font-size:9px;cursor:pointer;opacity:0.7;transition:opacity 0.15s;line-height:1;color:' + cPanelFgDim + ';';
  refreshWfBtn.textContent = '🔄';
  refreshWfBtn.title = 'Refresh waterfall';
  refreshWfBtn.onmouseenter = function() { refreshWfBtn.style.opacity = '1'; };
  refreshWfBtn.onmouseleave = function() { refreshWfBtn.style.opacity = '0.7'; };
  refreshWfBtn.onclick = function(e: MouseEvent) { e.stopPropagation(); renderWaterfall(); };
  waterfallHeader.appendChild(waterfallTitle);
  waterfallHeader.appendChild(refreshWfBtn);
  waterfallContainer.appendChild(waterfallHeader);
  const waterfallBody = document.createElement('div');
  waterfallBody.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
  waterfallContainer.appendChild(waterfallBody);
  diagBody.appendChild(waterfallContainer);

  function renderWaterfall() {
    const entries = getTimingEntries();
    const totalMs = getTimingSinceLoadMs();
    if (entries.length === 0) {
      waterfallBody.innerHTML = '<span style="font-size:9px;color:' + cPanelFgDim + '">No timing data yet</span>';
      return;
    }
    // Find the max end time for scaling
    let maxEnd = 0;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].endMs > maxEnd) maxEnd = entries[i].endMs;
    }
    if (maxEnd < 100) maxEnd = 100;

    const STATUS_COLORS: Record<string, string> = {
      ok: '#4ade80',
      warn: '#fbbf24',
      error: '#f87171',
      pending: '#60a5fa',
    };

    waterfallBody.innerHTML = '';
    for (let i = 0; i < entries.length; i++) {
      var e = entries[i];
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:4px;height:16px;';

      // Label
      var label = document.createElement('span');
      label.style.cssText = 'font-size:9px;color:' + cPanelFgDim + ';min-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      label.textContent = e.label;
      label.title = e.detail || '';

      // Bar container
      var barTrack = document.createElement('div');
      barTrack.style.cssText = 'flex:1;height:10px;background:rgba(255,255,255,0.05);border-radius:2px;position:relative;overflow:hidden;';

      // Bar fill
      var barFill = document.createElement('div');
      var leftPct = (e.startMs / maxEnd * 100).toFixed(1);
      var widthPct = Math.max(((e.endMs - e.startMs) / maxEnd * 100), 1).toFixed(1);
      var color = STATUS_COLORS[e.status] || '#60a5fa';
      barFill.style.cssText = 'position:absolute;top:0;bottom:0;left:' + leftPct + '%;width:' + widthPct + '%;background:' + color + ';border-radius:2px;opacity:0.8;';
      if (e.status === 'pending') {
        barFill.style.animation = 'pulse 1.5s ease-in-out infinite';
      }
      barTrack.appendChild(barFill);

      // Duration
      var dur = document.createElement('span');
      var durationMs = e.endMs - e.startMs;
      dur.style.cssText = 'font-size:9px;color:' + color + ';min-width:36px;text-align:right;white-space:nowrap;';
      dur.textContent = durationMs < 1000 ? durationMs + 'ms' : (durationMs / 1000).toFixed(1) + 's';

      row.appendChild(label);
      row.appendChild(barTrack);
      row.appendChild(dur);
      waterfallBody.appendChild(row);
    }

    // Total row
    var totalRow = document.createElement('div');
    totalRow.style.cssText = 'font-size:9px;color:' + cPanelFgDim + ';text-align:right;margin-top:2px;border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;';
    totalRow.textContent = 'Total: ' + (totalMs < 1000 ? totalMs + 'ms' : (totalMs / 1000).toFixed(1) + 's');
    waterfallBody.appendChild(totalRow);
  }

  renderWaterfall();

  // --- Copy Auth Diag button in header ---
  const copyDiagBtn = document.createElement('button');
  copyDiagBtn.style.cssText = 'margin-left:auto;padding:1px 5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:3px;font-size:10px;cursor:pointer;opacity:0.7;transition:opacity 0.15s;line-height:1;';
  copyDiagBtn.textContent = '📋';
  copyDiagBtn.title = 'Copy auth diagnostics';
  copyDiagBtn.onmouseenter = function() { copyDiagBtn.style.opacity = '1'; };
  copyDiagBtn.onmouseleave = function() { copyDiagBtn.style.opacity = '0.7'; };
  copyDiagBtn.onclick = function(e: MouseEvent) {
    e.stopPropagation();
    const lines = [
      '=== Auth Diagnostics @ ' + new Date().toLocaleTimeString('en-US', { hour12: false }) + ' ===',
      'Cookies: ' + cookieVal.textContent + ' (' + cookieVal.title + ')',
      'Bridge:  ' + bridgeVal.textContent,
      'Source:  ' + srcVal.textContent,
      'JWT:     ' + jwtVal.textContent,
      'Detail:  ' + jwtDetailVal.textContent,
      'Refresh: ' + refreshVal.textContent,
      '',
      '=== Startup Waterfall ===',
    ];
    const entries = getTimingEntries();
    for (let i = 0; i < entries.length; i++) {
      var te = entries[i];
      var ms = te.endMs - te.startMs;
      lines.push(te.label.padEnd(22) + (ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's').padStart(8) + '  [' + te.status + ']' + (te.detail ? '  ' + te.detail : ''));
    }
    lines.push('Total: ' + (getTimingSinceLoadMs() / 1000).toFixed(1) + 's');
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(function() {
      copyDiagBtn.textContent = '✅';
      setTimeout(function() { copyDiagBtn.textContent = '📋'; }, 1500);
    }).catch(function() {
      copyDiagBtn.textContent = '❌';
      setTimeout(function() { copyDiagBtn.textContent = '📋'; }, 1500);
    });
  };

  // --- Summary indicator on section header ---
  const headerBadge = document.createElement('span');
  headerBadge.style.cssText = 'font-size:11px;margin-left:4px;';
  col.header.style.cssText += 'display:flex;align-items:center;';
  col.header.appendChild(copyDiagBtn);
  col.header.appendChild(headerBadge);

  function updateAuthDiagRow() {
    // Cookie names from project bindings
    const cookieNames = deps.getSessionCookieNames();
    const isFromBindings = (function() {
      try {
        const root = (window as any).RiseupAsiaMacroExt;
        return !!(root && root.Projects && Object.keys(root.Projects).length > 0);
      } catch(_e) { return false; }
    })();
    cookieIcon.textContent = isFromBindings ? '🔗' : '📋';
    cookieVal.textContent = cookieNames.join(', ');
    cookieVal.title = (isFromBindings ? 'From project namespace bindings' : 'Hardcoded fallback') + ': ' + cookieNames.join(', ');

    // Bridge outcome
    const bridge = deps.getLastBridgeOutcome();
    if (!bridge.attempted) {
      bridgeIcon.textContent = '⚪';
      bridgeVal.textContent = 'No bridge attempt yet';
    } else if (bridge.success) {
      bridgeIcon.textContent = '✅';
      bridgeVal.textContent = 'OK via ' + bridge.source;
      bridgeVal.style.color = '#4ade80';
    } else {
      bridgeIcon.textContent = '❌';
      bridgeVal.textContent = 'FAILED' + (bridge.error ? ' — ' + bridge.error : '');
      bridgeVal.style.color = '#f87171';
    }

    // Token source
    const source = deps.getLastTokenSource() || 'none';
    const hasToken = source !== 'none';
    srcIcon.textContent = hasToken ? '🟢' : '🔴';
    srcVal.textContent = hasToken ? source : 'No token resolved';
    srcVal.title = hasToken ? 'Bearer resolved from: ' + source : 'No bearer token found';
    headerBadge.textContent = hasToken ? '🟢' : '🔴';

    // JWT validity
    const token = deps.resolveToken();
    if (!token) {
      jwtIcon.textContent = '⚪';
      jwtVal.textContent = 'No token to validate';
      jwtDetailVal.textContent = '';
    } else {
      const info = decodeJwtPayload(token);
      if (info.valid) {
        jwtIcon.textContent = '✅';
        jwtVal.textContent = 'Valid · expires in ' + formatRemaining(info.remainingMs);
        jwtVal.style.color = '#4ade80';
      } else {
        jwtIcon.textContent = '❌';
        jwtVal.textContent = info.error || 'Invalid / expired';
        jwtVal.style.color = '#f87171';
      }
      jwtDetailVal.textContent = 'sub: ' + info.sub + ' · iat: ' + info.issuedAt + ' · exp: ' + info.expiresAt;
    }

    // Last refresh outcome
    if (!_lastRefreshOutcome.time) {
      refreshIcon.textContent = '⚪';
      refreshVal.textContent = 'No refresh attempted yet';
    } else if (_lastRefreshOutcome.success) {
      refreshIcon.textContent = '✅';
      refreshVal.textContent = 'OK @ ' + _lastRefreshOutcome.time + ' via ' + _lastRefreshOutcome.source;
      refreshVal.style.color = '#4ade80';
    } else {
      refreshIcon.textContent = '❌';
      refreshVal.textContent = 'FAILED @ ' + _lastRefreshOutcome.time + (_lastRefreshOutcome.error ? ' — ' + _lastRefreshOutcome.error : '');
      refreshVal.style.color = '#f87171';
    }
    renderWaterfall();
  }

  updateAuthDiagRow();

  // Auto-refresh every 10s while panel is visible
  setInterval(function() {
    if (diagBody.style.display !== 'none') updateAuthDiagRow();
  }, 10000);

  return { row: col.section, updateAuthDiagRow };
}
