/**
 * MacroLoop Controller — Check Button Builder
 * Step 2g: Extracted from macro-looping.ts
 */

import { log } from '../logging';
import { logError } from '../error-utils';
import { showToast } from '../toast';
import { refreshBearerTokenFromBestSource, resolveToken, getLastTokenSource } from '../auth';
import { isOnProjectPage } from '../dom-helpers';
import { runCheck } from '../loop-engine';

import { cBtnCheckGlow, cBtnCheckGrad, state } from '../shared-state';

export interface CheckButtonDeps {
  btnStyle: string;
  updateAuthBadge: (ok: boolean, source: string) => void;
}

export interface CheckButtonResult {
  checkBtn: HTMLButtonElement;
  resetCheckButtonState: () => void;
}

// CQ16: Extracted context for check button state
interface CheckButtonCtx {
  checkInFlight: boolean;
  checkInFlightTimer: ReturnType<typeof setTimeout> | null;
  checkBtn: HTMLButtonElement;
  updateAuthBadge: (ok: boolean, source: string) => void;
}

// CQ16: Extracted from createCheckButton closure
function resetCheckButtonState(ctx: CheckButtonCtx): void {
  if (ctx.checkInFlightTimer) {
    clearTimeout(ctx.checkInFlightTimer);
    ctx.checkInFlightTimer = null;
  }
  ctx.checkInFlight = false;
  ctx.checkBtn.textContent = '☑ Check';
  ctx.checkBtn.style.opacity = '1';
  ctx.checkBtn.style.pointerEvents = 'auto';
}

// CQ16: Extracted from createCheckButton closure
function doRunCheck(ctx: CheckButtonCtx): void {
  let checkPromise;
  try {
    checkPromise = runCheck();
  } catch(syncErr) {
    logError('Manual Check sync error', '' + (syncErr as Error).message);
    resetCheckButtonState(ctx);
    return;
  }

  if (checkPromise && typeof checkPromise.then === 'function') {
    checkPromise.then(function() {
      log('Manual Check completed successfully', 'success');
    }).catch(function(err: Error) {
      logError('Manual Check failed', '' + (err && err.message ? err.message : String(err)));
    }).then(function() {
      // finally equivalent
      resetCheckButtonState(ctx);
    });
  } else {
    resetCheckButtonState(ctx);
  }
}

/**
 * Create the Check button with cooldown, auth resolution, and runCheck logic.
 */
export function createCheckButton(deps: CheckButtonDeps): CheckButtonResult {
  const { btnStyle, updateAuthBadge } = deps;

  const checkBtn = document.createElement('button');
  checkBtn.textContent = '☑ Check';
  checkBtn.title = 'One-shot credit check';
  checkBtn.style.cssText = btnStyle + 'background:' + cBtnCheckGrad + ';color:#fff;box-shadow:' + cBtnCheckGlow + ';border:1px solid rgba(255,255,255,0.08);';
  checkBtn.onmouseenter = function() { checkBtn.style.filter = 'brightness(1.12)'; checkBtn.style.boxShadow = '0 2px 8px rgba(232,71,95,0.4), inset 0 1px 0 rgba(255,255,255,0.2)'; };
  checkBtn.onmouseleave = function() { checkBtn.style.filter = ''; checkBtn.style.boxShadow = cBtnCheckGlow; };
  checkBtn.onmousedown = function() { checkBtn.style.filter = 'brightness(0.92)'; checkBtn.style.boxShadow = '0 0 4px rgba(232,71,95,0.2)'; };

  const ctx: CheckButtonCtx = {
    checkInFlight: false,
    checkInFlightTimer: null,
    checkBtn: checkBtn,
    updateAuthBadge: updateAuthBadge,
  };

  checkBtn.onclick = function() { _handleCheckClick(ctx); };

  return { checkBtn, resetCheckButtonState: () => resetCheckButtonState(ctx) };
}

function _handleCheckClick(ctx: CheckButtonCtx): void {
  const { checkBtn, updateAuthBadge } = ctx;
  if (ctx.checkInFlight) {
    log('Check cooldown: already in flight', 'warn');
    return;
  }
  if (state.isDelegating) {
    log('Check blocked: move/delegation in progress', 'warn');
    checkBtn.style.opacity = '0.5';
    setTimeout(function() { checkBtn.style.opacity = '1'; }, 500);
    return;
  }

  if (!isOnProjectPage()) {
    log('Manual Check: ⚠️ Not on a project page — XPath detection will likely fail', 'warn');
    showToast('⚠️ Navigate to a project page first for Check to work', 'warn');
  }

  ctx.checkInFlight = true;
  checkBtn.style.opacity = '0.6';
  checkBtn.style.pointerEvents = 'none';

  ctx.checkInFlightTimer = setTimeout(function() {
    if (ctx.checkInFlight) {
      log('Manual Check timeout (15s) — auto-resetting button state', 'warn');
      resetCheckButtonState(ctx);
    }
  }, 15000);

  const existingToken = resolveToken();
  if (existingToken) {
    log('Manual Check: ✅ Token already available (' + getLastTokenSource() + ') — skipping bridge wait', 'success');
    updateAuthBadge(true, getLastTokenSource());
    checkBtn.textContent = '⏳ Checking…';
    doRunCheck(ctx);
  } else {
    checkBtn.textContent = '⏳ Auth…';
    log('Manual Check: Step 0 — resolving auth token from extension bridge...', 'check');
    refreshBearerTokenFromBestSource(function(authToken: string, authSource: string) {
      if (authToken) {
        log('Manual Check: ✅ Auth resolved from ' + authSource + ' (' + authToken.substring(0, 8) + '...)', 'success');
        updateAuthBadge(true, authSource);
      } else {
        log('Manual Check: ⚠️ No auth token — workspace/credit fetch may fail', 'warn');
        updateAuthBadge(false, 'none');
        showToast('⚠️ No auth token — check may be incomplete', 'warn');
      }
      checkBtn.textContent = '⏳ Checking…';
      doRunCheck(ctx);
    });
  }
}
