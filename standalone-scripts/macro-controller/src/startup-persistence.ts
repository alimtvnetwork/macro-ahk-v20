/**
 * MacroLoop Controller — SPA Persistence Observer
 *
 * Watches for SPA navigations that remove the controller's DOM elements
 * and re-injects the UI when needed. Uses narrow MutationObserver scope
 * (childList only, no subtree) per MC-04.
 *
 * @see .lovable/memory/architecture/macro-controller/bootstrap-strategy.md
 */

import { log } from './logging';
import { nsReadTyped } from './api-namespace';
import { IDS, VERSION } from './shared-state';
import { resetRedockState } from './ui/redock-observer';

// CQ16: Extracted from setupPersistenceObserver closure
function tryReinjectUI(createUI: () => void): void {
  const isDestroyed = nsReadTyped('_internal.destroyed');

  if (isDestroyed) {
    log('Panel was destroyed by user — skipping re-injection', 'info');

    return;
  }

  const hasMarker = !!document.getElementById(IDS.SCRIPT_MARKER);
  const hasContainer = !!document.getElementById(IDS.CONTAINER);

  if (!hasMarker) {
    log('Marker removed by SPA navigation, re-placing', 'warn');
    const newMarker = document.createElement('div');
    newMarker.id = IDS.SCRIPT_MARKER;
    newMarker.style.display = 'none';
    newMarker.setAttribute('data-version', VERSION);
    document.body.appendChild(newMarker);
  }

  if (!hasContainer) {
    log('UI container removed by SPA navigation, re-creating', 'warn');
    resetRedockState();
    createUI();
  }
}

/** Install MutationObserver + visibilitychange listener for SPA persistence. */
export function setupPersistenceObserver(createUI: () => void): void {
  let reinjectDebounce: ReturnType<typeof setTimeout> | null = null;
  const REINJECT_DELAY_MS = 500;

  // MC-04 fix: Use childList-only (no subtree) on a narrow parent.
  const observer = new MutationObserver(function (_mutations: MutationRecord[]) {
    const isBothPresent = !!document.getElementById(IDS.SCRIPT_MARKER) && !!document.getElementById(IDS.CONTAINER);
    if (isBothPresent) return;

    if (reinjectDebounce) clearTimeout(reinjectDebounce);
    reinjectDebounce = setTimeout(function () {
      log('SPA navigation detected - checking UI state', 'check');
      tryReinjectUI(createUI);
    }, REINJECT_DELAY_MS);
  });

  const observeTarget = document.querySelector('main') || document.querySelector('#root') || document.body;
  observer.observe(observeTarget, { childList: true });
  log('MutationObserver installed on ' + (observeTarget === document.body ? 'document.body' : observeTarget.tagName + (observeTarget.id ? '#' + observeTarget.id : '')) + ' (childList only) for UI persistence', 'success');

  document.addEventListener('visibilitychange', function () {
    const isVisible = document.visibilityState === 'visible';
    if (isVisible) {
      const isMissing = !document.getElementById(IDS.SCRIPT_MARKER) || !document.getElementById(IDS.CONTAINER);
      if (isMissing) {
        log('visibilitychange: UI missing — re-injecting', 'check');
        tryReinjectUI(createUI);
      }
    }
  });
}
