/**
 * Panel Header — Title bar construction extracted from panel-builder.ts (Phase 5F)
 *
 * Builds the title row: title label, project name, workspace badge,
 * version span, auth badge, minimize/close buttons, and drag handlers.
 */

import {
  VERSION,
  cPrimaryLight,
  cNeutral500,
  loopCreditState,
  tFontTiny,
  state,
} from '../shared-state';
import { log, getDisplayProjectName } from '../logging';
import {
  getLastTokenSource,
  refreshBearerTokenFromBestSource,
  resolveToken,
  updateAuthBadge,
} from '../auth';
import { showToast } from '../toast';
import { showAboutModal } from './about-modal';
import {
  startDragHandler,
  toggleMinimize,
} from './panel-layout';
import { destroyPanel, updateUI } from './ui-updaters';

import type { PanelBuilderDeps } from './panel-builder';
import type { PanelLayoutCtx } from './panel-layout';
import { logError } from '../error-utils';
import { CssFragment } from '../types';
// ============================================
// Return type for buildTitleRow
// ============================================

export interface TitleRowResult {
  titleRow: HTMLElement;
  wsNameEl: HTMLElement;
  authBadge: HTMLElement;
  panelToggleSpan: HTMLElement;
}

// ============================================
// buildTitleRow — title bar with drag, auth, minimize/close
// ============================================

export function buildTitleRow(
  deps: PanelBuilderDeps,
  plCtx: PanelLayoutCtx,
): TitleRowResult {
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:6px;cursor:grab;user-select:none;padding:0 0 2px 0;';
  titleRow.title = 'Drag to move, click to minimize/expand';

  const { elements, wsNameEl, authBadge, panelToggleSpan, hideBtn } = _buildTitleElements(deps, plCtx);
  _setupTitleDragHandlers(titleRow, plCtx, hideBtn, panelToggleSpan);
  _assembleTitleRow(titleRow, elements);

  return { titleRow, wsNameEl, authBadge, panelToggleSpan };
}

function _buildTitleElements(deps: PanelBuilderDeps, plCtx: PanelLayoutCtx) {
  const title = document.createElement('div');
  title.style.cssText = 'font-weight:bold;color:#E0E0E0;font-size:14px;flex-shrink:0;white-space:nowrap;transform:translateY(-2px);';
  title.textContent = 'TS Macro';

  const wsNameEl = buildWorkspaceNameBadge(deps);

  const versionSpan = document.createElement('span');
  versionSpan.style.cssText = CssFragment.FontSize + tFontTiny + ';color:' + cPrimaryLight + ';margin-right:4px;cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px;';
  versionSpan.textContent = 'v' + VERSION;
  versionSpan.title = 'Click to see About info';
  versionSpan.onclick = function(e: Event) { e.stopPropagation(); showAboutModal(); };

  const authBadge = buildAuthBadge();

  const panelToggleSpan = document.createElement('span');
  panelToggleSpan.style.cssText = CssFragment.FontSize + tFontTiny + ';color:' + cNeutral500 + ';cursor:pointer;margin-right:4px;';
  panelToggleSpan.textContent = plCtx.panelState === 'minimized' ? '[ + ]' : '[ - ]';
  panelToggleSpan.title = 'Minimize / Expand panel';
  panelToggleSpan.onclick = function(e: Event) { e.stopPropagation(); toggleMinimize(plCtx); };
  plCtx.panelToggleSpan = panelToggleSpan;

  const hideBtn = document.createElement('span');
  hideBtn.style.cssText = CssFragment.FontSize + tFontTiny + ';color:' + cNeutral500 + ';cursor:pointer;';
  hideBtn.textContent = '[ x ]';
  hideBtn.title = 'Close and fully remove controller (re-inject to restore)';
  hideBtn.onclick = function(e: Event) { e.stopPropagation(); destroyPanel(); };

  return {
    elements: { title, wsNameEl, versionSpan, authBadge, panelToggleSpan, hideBtn },
    wsNameEl, authBadge, panelToggleSpan, hideBtn,
  };
}

function _setupTitleDragHandlers(titleRow: HTMLElement, plCtx: PanelLayoutCtx, hideBtn: HTMLElement, panelToggleSpan: HTMLElement): void {
  titleRow.onpointerdown = function(e: PointerEvent) {
    if (e.target === hideBtn || e.target === panelToggleSpan) return;
    startDragHandler(plCtx, e);
  };
  titleRow.onpointerup = function(e: PointerEvent) {
    if (e.target === hideBtn || e.target === panelToggleSpan) return;
    const dx = Math.abs(e.clientX - plCtx.dragStartPos.x);
    const dy = Math.abs(e.clientY - plCtx.dragStartPos.y);
    if (dx < 5 && dy < 5) { toggleMinimize(plCtx); }
  };
}

function _assembleTitleRow(titleRow: HTMLElement, els: Record<string, HTMLElement>): void {
  titleRow.appendChild(els.title);
  const titleSpacer = document.createElement('div');
  titleSpacer.style.cssText = 'flex:1;';
  titleRow.appendChild(titleSpacer);
  titleRow.appendChild(els.wsNameEl);
  titleRow.appendChild(els.versionSpan);
  titleRow.appendChild(els.authBadge);
  titleRow.appendChild(els.panelToggleSpan);
  titleRow.appendChild(els.hideBtn);
}

// ============================================
// Project name badge builder (title bar)
// Displays project name from API or DOM — click to re-detect workspace
// ============================================

// eslint-disable-next-line max-lines-per-function -- workspace badge with click-to-detect, shimmer fallback, hover states
function buildWorkspaceNameBadge(deps: PanelBuilderDeps): HTMLElement {
  const wsNameEl = document.createElement('div');
  wsNameEl.id = 'loop-title-ws-name';
  wsNameEl.style.cssText = CssFragment.FontSize + tFontTiny + ';color:#fbbf24;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;cursor:pointer;border-bottom:1px dotted rgba(251,191,36,0.4);transition:color 0.15s;margin-right:4px;';
  wsNameEl.title = 'Project name — click to re-detect workspace';

  const projectName = getDisplayProjectName();
  const wsName = state.workspaceName
    || (loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '');

  if (projectName && projectName !== 'Unknown Project') {
    wsNameEl.textContent = projectName;
    wsNameEl.title = 'Project: ' + projectName + (wsName ? ' | Workspace: ' + wsName : '') + ' — click to re-detect';
  } else if (wsName) {
    wsNameEl.textContent = wsName;
    wsNameEl.title = 'Workspace: ' + wsName + ' (project name not yet resolved) — click to re-detect';
  } else {
    const wsShimmer = document.createElement('span');
    wsShimmer.className = 'marco-skeleton';
    wsShimmer.setAttribute('data-skeleton', 'ws-name');
    wsShimmer.style.cssText = 'display:inline-block;width:80px;height:10px;border-radius:3px;vertical-align:middle;';
    wsNameEl.appendChild(wsShimmer);
  }

  wsNameEl.onmouseenter = function() { wsNameEl.style.color = '#fde68a'; };
  wsNameEl.onmouseleave = function() { wsNameEl.style.color = '#fbbf24'; };
  wsNameEl.onclick = function(e: Event) {
    e.stopPropagation();
    wsNameEl.textContent = '⏳ detecting…';
    wsNameEl.style.color = '#9ca3af';
    const token = resolveToken();
    state.workspaceFromApi = false;
    deps.autoDetectLoopCurrentWorkspace(token).then(function() {
      wsNameEl.style.color = '#fbbf24';
      wsNameEl.style.opacity = '1';
      const ws = state.workspaceName || '';
      const name = getDisplayProjectName();
      // Title bar prioritizes project name; workspace shown in tooltip
      wsNameEl.textContent = (name && name !== 'Unknown Project') ? name : ws || '❌ unknown';
      wsNameEl.title = (name ? 'Project: ' + name : '') + (ws ? ' | Workspace: ' + ws : '') + ' — click to re-detect';
      if (ws) {
        log('Title bar: ✅ Workspace re-detected: "' + ws + '"', 'success');
        showToast('Workspace: ' + ws, 'success');
      }
      updateUI();
    }).catch(function(e: unknown) {
      logError('switchWorkspace', 'Workspace switch failed', e);
      showToast('❌ Workspace switch failed', 'error');
      wsNameEl.style.color = '#f87171';
      wsNameEl.textContent = '❌ failed';
      setTimeout(function() {
        wsNameEl.style.color = '#fbbf24';
        const fallbackName = getDisplayProjectName();
        wsNameEl.textContent = (fallbackName && fallbackName !== 'Unknown Project') ? fallbackName : state.workspaceName || '⟳ detecting…';
      }, 2000);
    });
  };

  return wsNameEl;
}

// ============================================
// Auth badge builder
// ============================================

function buildAuthBadge(): HTMLElement {
  const authBadge = document.createElement('span');
  authBadge.id = 'loop-auth-badge';
  authBadge.style.cssText = 'font-size:8px;margin-right:8px;cursor:pointer;vertical-align:middle;transition:opacity 0.2s;';
  authBadge.textContent = '🔴';
  authBadge.title = 'Auth: no token — click to refresh';
  authBadge.addEventListener('click', function() {
    authBadge.style.opacity = '0.4';
    authBadge.title = 'Refreshing token…';
    log('Auth badge clicked — triggering manual token refresh', 'check');
    refreshBearerTokenFromBestSource(function(token: string, source: string) {
      authBadge.style.opacity = '1';
      if (token) {
        log('Auth badge refresh: ✅ Token resolved from ' + source, 'success');
        updateAuthBadge(true, source);
        showToast('🟢 Token refreshed (' + source + ')', 'success');
      } else {
        logError('Auth badge refresh', '❌ No token found');
        updateAuthBadge(false, 'none');
        showToast('🔴 Token refresh failed — please log in', 'warn');
      }
    });
  });
  const currentToken = resolveToken();
  if (currentToken) {
    authBadge.textContent = '🟢';
    authBadge.title = 'Auth: token available (' + (getLastTokenSource() || 'cached') + ') — click to refresh';
  }
  return authBadge;
}
