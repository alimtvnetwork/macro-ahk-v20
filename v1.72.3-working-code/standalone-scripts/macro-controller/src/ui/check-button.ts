/**
 * MacroLoop Controller — Check Button Builder
 * Step 2g: Extracted from macro-looping.ts
 */

import { log } from '../logging';
import {
  cBtnCheckGrad, cBtnCheckGlow,
  state,
} from '../shared-state';
import { showToast } from '../toast';
import { refreshBearerTokenFromBestSource, resolveToken, LAST_TOKEN_SOURCE } from '../auth';
import { isOnProjectPage } from '../dom-helpers';
import { runCheck } from '../loop-engine';

export interface CheckButtonDeps {
  btnStyle: string;
  updateAuthBadge: (ok: boolean, source: string) => void;
}

export interface CheckButtonResult {
  checkBtn: HTMLButtonElement;
  resetCheckButtonState: () => void;
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

  let checkInFlight = false;
  let checkInFlightTimer: ReturnType<typeof setTimeout> | null = null;

  function resetCheckButtonState() {
    if (checkInFlightTimer) {
      clearTimeout(checkInFlightTimer);
      checkInFlightTimer = null;
    }
    checkInFlight = false;
    checkBtn.textContent = '☑ Check';
    checkBtn.style.opacity = '1';
    checkBtn.style.pointerEvents = 'auto';
  }

  checkBtn.onclick = function() {
    if (checkInFlight) {
      log('Check cooldown: already in flight', 'warn');
      return;
    }
    if (state.isDelegating) {
      log('Check blocked: move/delegation in progress', 'warn');
      checkBtn.style.opacity = '0.5';
      setTimeout(function() { checkBtn.style.opacity = '1'; }, 500);
      return;
    }

    // v7.37: Guard — warn if not on a project page (XPath detection will fail)
    if (!isOnProjectPage()) {
      log('Manual Check: ⚠️ Not on a project page — XPath detection will likely fail', 'warn');
      showToast('⚠️ Navigate to a project page first for Check to work', 'warn');
    }

    checkInFlight = true;
    checkBtn.style.opacity = '0.6';
    checkBtn.style.pointerEvents = 'none';

    // Failsafe: never leave Check button permanently locked
    checkInFlightTimer = setTimeout(function() {
      if (checkInFlight) {
        log('Manual Check timeout (15s) — auto-resetting button state', 'warn');
        resetCheckButtonState();
      }
    }, 15000);

    // v7.37: Fast path — if token already in localStorage, skip the slow bridge entirely
    var existingToken = resolveToken();
    if (existingToken) {
      log('Manual Check: ✅ Token already available (' + LAST_TOKEN_SOURCE + ') — skipping bridge wait', 'success');
      updateAuthBadge(true, LAST_TOKEN_SOURCE);
      checkBtn.textContent = '⏳ Checking…';
      doRunCheck();
    } else {
      // Slow path — try extension bridge (up to 5s for two calls)
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
        doRunCheck();
      });
    }

    function doRunCheck() {
      let checkPromise;
      try {
        checkPromise = runCheck();
      } catch(syncErr) {
        log('Manual Check sync error: ' + (syncErr as Error).message, 'error');
        resetCheckButtonState();
        return;
      }

      if (checkPromise && typeof checkPromise.then === 'function') {
        checkPromise.then(function() {
          log('Manual Check completed successfully', 'success');
        }).catch(function(err: Error) {
          log('Manual Check failed: ' + (err && err.message ? err.message : String(err)), 'error');
        }).then(function() {
          // finally equivalent
          resetCheckButtonState();
        });
      } else {
        resetCheckButtonState();
      }
    }
  };

  return { checkBtn, resetCheckButtonState };
}
