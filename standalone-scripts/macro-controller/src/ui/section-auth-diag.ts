/**
 * MacroLoop Controller — Auth Diagnostics Section
 *
 * Collapsible auth diagnostics panel orchestrator.
 * Sub-modules: auth-diag-rows, auth-diag-waterfall, auth-diag-clipboard.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { createSkeletonBar } from './skeleton';
import { logSub } from '../logging';
import { cPanelFgDim, cPrimaryLighter } from '../shared-state';
import { createCollapsibleSection } from './section-collapsible';

import {
  buildDiagRow,
  buildProjectIdRow,
  buildButtonRow,
  updateCookieRow,
  updateBridgeRow,
  updateSourceRow,
  updateJwtRow,
  updateRefreshRow,
  updateWsCacheRow,
} from './auth-diag-rows';

import { buildWaterfallSection } from './auth-diag-waterfall';
import { buildHeaderControls } from './auth-diag-clipboard';
import { logError } from '../error-utils';
import { showToast } from '../toast';

// Re-export for backward compatibility
export { recordRefreshOutcome } from './auth-jwt-utils';

export interface AuthDiagDeps {
  getLastTokenSource: () => string;
  resolveToken: () => string;
  recoverAuthOnce: () => Promise<string>;
  getSessionCookieNames: () => string[];
  getLastBridgeOutcome: () => { attempted: boolean; success: boolean; source: string; error: string };
  refreshFromBestSource: (callback: (token: string, source: string) => void) => void;
}

export interface AuthDiagResult {
  row: HTMLElement;
  updateAuthDiagRow: () => void;
}

const ROW_CSS = 'display:flex;align-items:center;gap:6px;padding:2px 4px;background:rgba(0,0,0,.2);border-radius:3px;';

// CQ16: Extracted auth diag update context + function
interface AuthDiagUpdateCtx {
  deps: AuthDiagDeps;
  cookieRow: ReturnType<typeof buildDiagRow>;
  bridgeRow: ReturnType<typeof buildDiagRow>;
  srcRow: ReturnType<typeof buildDiagRow>;
  headerBadge: HTMLElement;
  jwtRow: ReturnType<typeof buildDiagRow>;
  jwtDetailVal: HTMLElement;
  refreshRow: ReturnType<typeof buildDiagRow>;
  wsCacheRow: ReturnType<typeof buildDiagRow>;
  renderWaterfall: () => void;
}

function performAuthDiagUpdate(ctx: AuthDiagUpdateCtx): void {
  updateCookieRow(ctx.deps, ctx.cookieRow);
  updateBridgeRow(ctx.deps, ctx.bridgeRow);
  updateSourceRow(ctx.deps, ctx.srcRow, ctx.headerBadge);
  updateJwtRow(ctx.deps, ctx.jwtRow, ctx.jwtDetailVal);
  updateRefreshRow(ctx.refreshRow);
  updateWsCacheRow(ctx.wsCacheRow);
  ctx.renderWaterfall();

  // Update header badge with SDK bridge outcome indicator
  try {
    const diag = window.marco?.auth?.getLastAuthDiag?.();
    if (diag) {
      const isDegraded = diag.bridgeOutcome === 'timeout' || diag.bridgeOutcome === 'error' || diag.source === 'none';
      ctx.headerBadge.style.animation = isDegraded ? 'ml-badge-pulse 1.8s ease-in-out infinite' : 'none';

      if (diag.bridgeOutcome === 'hit') {
        ctx.headerBadge.textContent = '🟢';
        ctx.headerBadge.title = 'Bridge OK · ' + Math.round(diag.durationMs) + 'ms';
      } else if (diag.bridgeOutcome === 'timeout') {
        ctx.headerBadge.textContent = '🟡';
        ctx.headerBadge.title = 'Bridge timeout · fell back to ' + diag.source + ' · ' + Math.round(diag.durationMs) + 'ms';
      } else if (diag.bridgeOutcome === 'error') {
        ctx.headerBadge.textContent = '🔴';
        ctx.headerBadge.title = 'Bridge error · fell back to ' + diag.source + ' · ' + Math.round(diag.durationMs) + 'ms';
      } else if (diag.source === 'none') {
        ctx.headerBadge.textContent = '🔴';
        ctx.headerBadge.title = 'No token from any source · ' + Math.round(diag.durationMs) + 'ms';
      }
    }
  } catch (e: unknown) {
    logError('renderAuthDiag', 'Auth diagnostics render failed', e);
    showToast('❌ Auth diagnostics render failed', 'error');
    // SDK not available
  }
}

/** Build the auth diagnostics collapsible section. */
// eslint-disable-next-line max-lines-per-function
export function createAuthDiagRow(deps: AuthDiagDeps): AuthDiagResult {
  const col = createCollapsibleSection('🔐 Auth Diagnostics', 'ml_collapse_auth_diag');
  col.body.style.display = 'none';
  col.toggle.textContent = '[+]';

  const diagBody = col.body;
  diagBody.style.cssText = 'margin-top:4px;display:none;flex-direction:column;gap:3px;font-size:10px;font-family:monospace;';

  col.header.onclick = function () {
    const isHidden = diagBody.style.display === 'none';
    diagBody.style.display = isHidden ? 'flex' : 'none';
    col.toggle.textContent = isHidden ? '[-]' : '[+]';
    try { localStorage.setItem('ml_collapse_auth_diag', isHidden ? 'expanded' : 'collapsed'); } catch (_e: unknown) { logSub('Failed to persist auth diag collapse state: ' + (_e instanceof Error ? _e.message : String(_e)), 1); }
  };

  const dimStyle = 'color:' + cPanelFgDim + ';';
  const valStyle = 'color:' + cPrimaryLighter + ';';

  const cookieRow = buildDiagRow(dimStyle, valStyle, 'Cookies:', '120px', '7px');
  cookieRow.valEl.style.fontSize = '9px';
  const bridgeRow = buildDiagRow(dimStyle, valStyle, 'Bridge:', '90px', '8px');
  const srcRow = buildDiagRow(dimStyle, valStyle, 'Source:', '80px', '8px');
  const jwtRow = buildDiagRow(dimStyle, valStyle, 'JWT:', '110px', '8px');

  const jwtDetailRow = document.createElement('div');
  jwtDetailRow.style.cssText = ROW_CSS + 'flex-wrap:wrap;';
  const jwtDetailVal = document.createElement('span');
  jwtDetailVal.style.cssText = dimStyle + 'font-size:9px;flex:1;';
  jwtDetailVal.appendChild(createSkeletonBar({ width: '180px', height: '7px' }));
  jwtDetailRow.appendChild(jwtDetailVal);

  const refreshRow = buildDiagRow(dimStyle, valStyle, 'Refresh:', '100px', '8px');
  const btnRowDiag = buildButtonRow(deps, () => updateAuthDiagRow());
  const pidRow = buildProjectIdRow(dimStyle, valStyle);
  const wsCacheRow = buildDiagRow(dimStyle, valStyle, 'WS src:', '100px', '8px');

  diagBody.appendChild(cookieRow.row);
  diagBody.appendChild(bridgeRow.row);
  diagBody.appendChild(srcRow.row);
  diagBody.appendChild(jwtRow.row);
  diagBody.appendChild(jwtDetailRow);
  diagBody.appendChild(refreshRow.row);
  diagBody.appendChild(pidRow);
  diagBody.appendChild(wsCacheRow.row);
  diagBody.appendChild(btnRowDiag);

  const { waterfallContainer, renderWaterfall } = buildWaterfallSection();
  diagBody.appendChild(waterfallContainer);
  renderWaterfall();

  const { copyButton, headerBadge } = buildHeaderControls(
    cookieRow.valEl, bridgeRow.valEl, srcRow.valEl, jwtRow.valEl, jwtDetailVal, refreshRow.valEl,
  );
  col.header.style.cssText += 'display:flex;align-items:center;';
  col.header.appendChild(copyButton);
  col.header.appendChild(headerBadge);

  const diagCtx: AuthDiagUpdateCtx = { deps, cookieRow, bridgeRow, srcRow, headerBadge, jwtRow, jwtDetailVal, refreshRow, wsCacheRow, renderWaterfall };
  const updateAuthDiagRow = function(): void { performAuthDiagUpdate(diagCtx); };

  updateAuthDiagRow();

  setInterval(function () {
    const isVisible = diagBody.style.display !== 'none';
    if (isVisible) {
      updateAuthDiagRow();
    }
  }, 10000);

  return { row: col.section, updateAuthDiagRow };
}
