/**
 * MacroLoop Controller — Auth Diagnostics Row Builders
 *
 * Individual diagnostic row construction and update functions
 * for the auth diagnostics panel (cookie, bridge, JWT, source, etc.).
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { createSkeletonBar } from './skeleton';
import { extractProjectIdFromUrl } from '../workspace-detection';
import { getCachedWorkspaceName } from '../workspace-cache';
import { cPrimaryLighter, state } from '../shared-state';
import {
  decodeJwtPayload,
  formatRemaining,
  getLastRefreshOutcome,
  recordRefreshOutcome,
} from './auth-jwt-utils';
import type { AuthDiagDeps } from './section-auth-diag';
import { logError } from '../error-utils';
import { CssFragment } from '../types';
// ── Diagnostic Row Elements ──

export interface DiagRowElements {
  row: HTMLElement;
  iconEl: HTMLElement;
  valEl: HTMLElement;
}

export function buildDiagRow(
  dimStyle: string,
  valStyle: string,
  labelText: string,
  skeletonWidth: string,
  skeletonHeight: string,
): DiagRowElements {
  const row = document.createElement('div');
  row.style.cssText = CssFragment.RowDiag;

  const iconEl = document.createElement('span');
  iconEl.style.cssText = 'font-size:11px;';

  const label = document.createElement('span');
  label.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  label.textContent = labelText;

  const valEl = document.createElement('span');
  valEl.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  valEl.appendChild(createSkeletonBar({ width: skeletonWidth, height: skeletonHeight }));

  row.appendChild(iconEl);
  row.appendChild(label);
  row.appendChild(valEl);

  return { row, iconEl, valEl };
}

// ── Update Functions ──

export function updateCookieRow(deps: AuthDiagDeps, cookieRow: DiagRowElements): void {
  const cookieNames = deps.getSessionCookieNames();
  const isFromBindings = detectBindingsSource();
  cookieRow.iconEl.textContent = isFromBindings ? '🔗' : '📋';
  cookieRow.valEl.textContent = cookieNames.join(', ');
  cookieRow.valEl.title = (isFromBindings ? 'From project namespace bindings' : 'Hardcoded fallback') + ': ' + cookieNames.join(', ');
}

function detectBindingsSource(): boolean {
  try {
    const root = RiseupAsiaMacroExt;
    return root !== undefined && root.Projects !== undefined && Object.keys(root.Projects).length > 0;
  } catch (e: unknown) {
    logError('hasActiveProject', 'Failed to check active projects', e);
    return false;
  }
}

export function updateBridgeRow(deps: AuthDiagDeps, bridgeRow: DiagRowElements): void {
  const bridge = deps.getLastBridgeOutcome();
  const isNotAttempted = !bridge.attempted;

  if (isNotAttempted) {
    bridgeRow.iconEl.textContent = '⚪';
    bridgeRow.valEl.textContent = 'No bridge attempt yet';
    _removeHelpIcon(bridgeRow);
    return;
  }

  if (bridge.success) {
    bridgeRow.iconEl.textContent = '✅';
    bridgeRow.valEl.textContent = 'OK via ' + bridge.source;
    bridgeRow.valEl.style.color = '#4ade80';
    _removeHelpIcon(bridgeRow);
  } else if (_isServiceWorkerSuspended(bridge.error || '')) {
    // Auto-wake: show reconnecting state, then ping to wake service worker
    bridgeRow.iconEl.textContent = '🔄';
    bridgeRow.valEl.textContent = 'Reconnecting…';
    bridgeRow.valEl.style.color = '#fbbf24';
    _removeHelpIcon(bridgeRow);

    deps.wakeBridge().then(function (alive: boolean) {
      if (alive) {
        bridgeRow.iconEl.textContent = '✅';
        bridgeRow.valEl.textContent = 'OK — reconnected after idle';
        bridgeRow.valEl.style.color = '#4ade80';
        _removeHelpIcon(bridgeRow);
      } else {
        bridgeRow.iconEl.textContent = '💤';
        bridgeRow.valEl.textContent = 'Idle — service worker suspended';
        bridgeRow.valEl.style.color = '#fbbf24';
        _appendHelpIcon(bridgeRow, _getBridgeErrorHelp(bridge.error || ''));
      }
    });
  } else {
    bridgeRow.iconEl.textContent = '❌';
    bridgeRow.valEl.textContent = 'FAILED' + (bridge.error ? ' — ' + bridge.error : '');
    bridgeRow.valEl.style.color = '#f87171';
    _appendHelpIcon(bridgeRow, _getBridgeErrorHelp(bridge.error || ''));
  }
}

/** Check if the bridge error is due to normal MV3 service worker suspension. */
function _isServiceWorkerSuspended(error: string): boolean {
  const lower = error.toLowerCase();
  return lower.includes('extension context invalidated') || lower.includes('receiving end does not exist');
}

/** Map known bridge errors to user-friendly help text. */
function _getBridgeErrorHelp(error: string): string {
  const lower = error.toLowerCase();
  if (lower.includes('extension context invalidated')) {
    return 'Normal MV3 behavior — Chrome suspended the background service worker after inactivity. ' +
      'The token is still available from localStorage. ' +
      'The bridge will reconnect automatically on the next action, or refresh the page (F5).';
  }
  if (lower.includes('receiving end does not exist')) {
    return 'Normal MV3 behavior — the background service worker is currently suspended. ' +
      'This happens automatically after ~30s of inactivity. ' +
      'The bridge will reconnect on the next action, or open the extension popup to wake it.';
  }
  if (lower.includes('could not establish connection')) {
    return 'Chrome could not reach the extension. It may be disabled, uninstalled, or crashed. ' +
      'Fix: Check chrome://extensions to verify the extension is enabled and reload it.';
  }
  return 'The extension bridge failed to communicate with the background service worker. ' +
    'Fix: Try refreshing the page or reloading the extension from chrome://extensions.';
}

/** Append a help ❓ icon with tooltip to a diagnostic row. */
function _appendHelpIcon(diagRow: DiagRowElements, helpText: string): void {
  _removeHelpIcon(diagRow);
  const helpIcon = document.createElement('span');
  helpIcon.setAttribute('data-help-icon', '1');
  helpIcon.textContent = '❓';
  helpIcon.style.cssText = 'cursor:help;font-size:10px;margin-left:4px;opacity:0.7;position:relative;';

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'display:none;position:absolute;bottom:calc(100% + 6px);left:50%;transform:translateX(-50%);' +
    'width:280px;padding:8px 10px;background:#1a1a2e;color:#e2e8f0;font-size:9px;line-height:1.4;' +
    'border:1px solid rgba(124,58,237,0.4);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.5);' +
    'z-index:100020;pointer-events:none;white-space:normal;';
  tooltip.textContent = helpText;

  helpIcon.appendChild(tooltip);
  helpIcon.onmouseover = function() { tooltip.style.display = 'block'; helpIcon.style.opacity = '1'; };
  helpIcon.onmouseout = function() { tooltip.style.display = 'none'; helpIcon.style.opacity = '0.7'; };

  diagRow.row.appendChild(helpIcon);
}

/** Remove existing help icon from a row. */
function _removeHelpIcon(diagRow: DiagRowElements): void {
  const existing = diagRow.row.querySelector('[data-help-icon]');
  if (existing) existing.remove();
}

export function updateSourceRow(deps: AuthDiagDeps, srcRow: DiagRowElements, headerBadge: HTMLElement): void {
  const source = deps.getLastTokenSource() || 'none';
  const hasToken = source !== 'none';
  srcRow.iconEl.textContent = hasToken ? '🟢' : '🔴';
  srcRow.valEl.textContent = hasToken ? source : 'No token resolved';
  srcRow.valEl.title = hasToken ? 'Bearer resolved from: ' + source : 'No bearer token found';
  headerBadge.textContent = hasToken ? '🟢' : '🔴';
}

export function updateJwtRow(deps: AuthDiagDeps, jwtRow: DiagRowElements, jwtDetailVal: HTMLElement): void {
  const token = deps.resolveToken();
  const hasNoToken = !token;

  if (hasNoToken) {
    jwtRow.iconEl.textContent = '⚪';
    jwtRow.valEl.textContent = 'No token to validate';
    jwtDetailVal.textContent = '';
    return;
  }

  const info = decodeJwtPayload(token);

  if (info.valid) {
    jwtRow.iconEl.textContent = '✅';
    jwtRow.valEl.textContent = 'Valid · expires in ' + formatRemaining(info.remainingMs);
    jwtRow.valEl.style.color = '#4ade80';
  } else {
    jwtRow.iconEl.textContent = '❌';
    jwtRow.valEl.textContent = info.error || 'Invalid / expired';
    jwtRow.valEl.style.color = '#f87171';
  }

  jwtDetailVal.textContent = 'sub: ' + info.sub + ' · iat: ' + info.issuedAt + ' · exp: ' + info.expiresAt;
}

export function updateRefreshRow(refreshRow: DiagRowElements): void {
  const outcome = getLastRefreshOutcome();
  const hasNoAttempt = !outcome.time;

  if (hasNoAttempt) {
    refreshRow.iconEl.textContent = '⚪';
    refreshRow.valEl.textContent = 'No refresh attempted yet';
    return;
  }

  if (outcome.success) {
    refreshRow.iconEl.textContent = '✅';
    refreshRow.valEl.textContent = 'OK @ ' + outcome.time + ' via ' + outcome.source;
    refreshRow.valEl.style.color = '#4ade80';
  } else {
    refreshRow.iconEl.textContent = '❌';
    refreshRow.valEl.textContent = 'FAILED @ ' + outcome.time + (outcome.error ? ' — ' + outcome.error : '');
    refreshRow.valEl.style.color = '#f87171';
  }
}

export function updateWsCacheRow(wsCacheRow: DiagRowElements): void {
  const cachedName = getCachedWorkspaceName();

  if (state.workspaceFromCache) {
    wsCacheRow.iconEl.textContent = '📦';
    wsCacheRow.valEl.textContent = 'Cached: "' + (cachedName || state.workspaceName) + '"';
    wsCacheRow.valEl.style.color = '#fbbf24';
  } else if (state.workspaceFromApi) {
    wsCacheRow.iconEl.textContent = '🌐';
    wsCacheRow.valEl.textContent = 'Fresh (API): "' + state.workspaceName + '"';
    wsCacheRow.valEl.style.color = '#4ade80';
  } else if (state.workspaceName) {
    wsCacheRow.iconEl.textContent = '🔍';
    wsCacheRow.valEl.textContent = 'Detected: "' + state.workspaceName + '"';
    wsCacheRow.valEl.style.color = cPrimaryLighter;
  } else {
    wsCacheRow.iconEl.textContent = '⚪';
    wsCacheRow.valEl.textContent = 'Not resolved yet';
  }
}

// ── Project ID Row ──

export function buildProjectIdRow(dimStyle: string, valStyle: string): HTMLElement {
  const pidRow = document.createElement('div');
  pidRow.style.cssText = CssFragment.RowDiag;

  const pidIcon = document.createElement('span');
  pidIcon.style.cssText = 'font-size:11px;';
  pidIcon.textContent = '🆔';

  const pidLabel = document.createElement('span');
  pidLabel.style.cssText = dimStyle + 'white-space:nowrap;min-width:60px;';
  pidLabel.textContent = 'Project:';

  const pidVal = document.createElement('span');
  pidVal.style.cssText = valStyle + 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;';
  const detectedPid = extractProjectIdFromUrl();
  pidVal.textContent = detectedPid || '(unknown)';
  pidVal.title = detectedPid || 'Could not detect project ID from URL';

  pidRow.appendChild(pidIcon);
  pidRow.appendChild(pidLabel);
  pidRow.appendChild(pidVal);

  return pidRow;
}

// ── Button Row ──

export function buildButtonRow(deps: AuthDiagDeps, onUpdate: () => void): HTMLElement {
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:4px;margin-top:2px;';

  const refreshBtn = buildRefreshButton(deps, onUpdate);
  const readCookieBtn = buildReadCookieButton(deps, onUpdate);

  btnRow.appendChild(refreshBtn);
  btnRow.appendChild(readCookieBtn);

  return btnRow;
}

function buildRefreshButton(deps: AuthDiagDeps, onUpdate: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.style.cssText = 'padding:2px 8px;background:#1e3a5f;color:' + cPrimaryLighter + ';border:1px solid #2563eb;border-radius:3px;font-size:9px;cursor:pointer;margin-top:2px;transition:background 0.15s;';
  button.textContent = '🔄 Force Refresh Token';
  button.onmouseenter = function () { button.style.background = '#2563eb'; };
  button.onmouseleave = function () { button.style.background = '#1e3a5f'; };

  button.onclick = function () {
    button.disabled = true;
    button.textContent = '⏳ Refreshing…';
    deps.recoverAuthOnce().then(function (token: string) {
      const source = token ? deps.getLastTokenSource() : 'none';
      const hasToken = !!token;
      recordRefreshOutcome(hasToken, source, token ? '' : 'No token from any source');
      onUpdate();
      button.disabled = false;
      button.textContent = '🔄 Force Refresh Token';
    });
  };

  return button;
}

function buildReadCookieButton(deps: AuthDiagDeps, onUpdate: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.style.cssText = 'padding:2px 8px;background:#1e3a5f;color:' + cPrimaryLighter + ';border:1px solid #2563eb;border-radius:3px;font-size:9px;cursor:pointer;margin-top:2px;transition:background 0.15s;';
  button.textContent = '🍪 Read Cookie';
  button.title = 'Read session token from extension bridge and save to localStorage';
  button.onmouseenter = function () { button.style.background = '#2563eb'; };
  button.onmouseleave = function () { button.style.background = '#1e3a5f'; };

  button.onclick = function () {
    button.disabled = true;
    button.textContent = '⏳ Reading…';
    deps.refreshFromBestSource(function (token: string, source: string) {
      const hasToken = !!token;
      recordRefreshOutcome(hasToken, source, token ? '' : 'No token from any source');
      onUpdate();
      button.disabled = false;
      button.textContent = hasToken ? '✅ Read Cookie' : '❌ Read Cookie';
      setTimeout(function () { button.textContent = '🍪 Read Cookie'; }, 2000);
    });
  };

  return button;
}
