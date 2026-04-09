/**
 * DOM Helper Functions — Extracted from macro-looping.ts (Step 2)
 * Phase 6: for-of conversions, newline-before-return, curly braces (CQ13–CQ16)
 *
 * DOM inspection utilities extracted from the IIFE closure.
 * Functions that need state access receive it via parameters.
 *
 * @see spec/06-coding-guidelines/02-typescript-immutability-standards.md
 */

import { CONFIG, TIMING, loopCreditState } from './shared-state';
import { log, logSub } from './logging';
import { pollUntil } from './async-utils';

import { ML_ELEMENTS, findElement, getAllByXPath, getByXPath, reactClick } from './xpath-utils';
import { logError } from './error-utils';

/**
 * Check if current page is a supported project/preview page (not settings/login/signup).
 */
export function isOnProjectPage(): boolean {
  try {
    const parsed = new URL(window.location.href);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    const isSupportedHost = (
      host === 'localhost'
      || host.endsWith('.localhost')
      || host === 'lovable.dev'
      || host.endsWith('.lovable.dev')
      || host.endsWith('.lovable.app')
      || host.endsWith('.lovableproject.com')
    );

    if (!isSupportedHost) {
      return false;
    }

    const isSettings = path.includes('/settings');
    const isProjectPath = path.includes('/projects/');
    const isPreviewHost = host.endsWith('.lovable.app') || host.endsWith('.lovableproject.com');

    return (isProjectPath || isPreviewHost) && !isSettings;
  } catch {
    return false;
  }
}

/**
 * Check if user is actively typing in the prompt area.
 */
export function isUserTypingInPrompt(): boolean {
  const promptXpath = CONFIG.PROMPT_ACTIVE_XPATH;
  const isDisabled = !promptXpath || promptXpath.indexOf('__') === 0;

  if (isDisabled) {
    return false;
  }

  try {
    const promptEl = getByXPath(promptXpath);

    if (!promptEl) {
      return false;
    }

    const activeEl = document.activeElement;

    if (!activeEl) {
      return false;
    }

    const isInPrompt = promptEl.contains(activeEl) || promptEl === activeEl;

    if (isInPrompt) {
      logSub('User is typing in prompt area — skipping dialog open', 1);
    }

    return isInPrompt;
  } catch (e) {
    logError('isPromptArea', 'Prompt area detection failed', e);
    return false;
  }
}

/**
 * Check if system is busy (progress bar visible) — indicates free credit.
 */
export function checkSystemBusy(): boolean {
  const progressEl = findElement(ML_ELEMENTS.PROGRESS);

  if (!progressEl) {
    logSub('Progress bar element NOT found in DOM', 1);

    return false;
  }

  const rect = progressEl.getBoundingClientRect();
  const isVisible = rect.width > 0 && rect.height > 0;
  const computedStyle = window.getComputedStyle(progressEl);
  const isHidden = computedStyle.display === 'none' || computedStyle.visibility === 'hidden' || computedStyle.opacity === '0';
  const hasContent = (progressEl.textContent || '').trim().length > 0 || progressEl.children.length > 0;

  logSub('Progress bar check: visible=' + isVisible + ', hidden=' + isHidden + ', hasContent=' + hasContent + ', rect=' + Math.round(rect.width) + 'x' + Math.round(rect.height), 1);

  if (isHidden) {
    logSub('Progress bar exists but is HIDDEN (display/visibility/opacity) — treating as NO credit', 1);

    return false;
  }

  if (!isVisible) {
    logSub('Progress bar exists but has 0 size — treating as NO credit', 1);

    return false;
  }

  logSub('Progress bar is VISIBLE and has content — FREE CREDIT detected', 1);

  return true;
}

/**
 * Poll for Main Progress Bar (dialog ready signal).
 * Returns a Promise that resolves when the dialog is ready (or times out).
 */
export function pollForDialogReady(): Promise<void> {
  const mainXpath = CONFIG.MAIN_PROGRESS_XPATH;
  const isNotConfigured = !mainXpath || mainXpath.indexOf('__') === 0;

  if (isNotConfigured) {
    log('MainProgressXPath not configured — falling back to fixed DialogWaitMs wait', 'warn');
    return new Promise<void>(function(resolve) {
      setTimeout(resolve, TIMING.DIALOG_WAIT || 2000);
    });
  }

  const pollInterval = 200;
  const maxWait = TIMING.DIALOG_WAIT || 3000;

  log('Polling for main progress bar (every ' + pollInterval + 'ms, max ' + maxWait + 'ms)...', 'check');

  return new Promise<void>(function(resolve) {
    pollUntil(
      function () {
        const mainEl = getByXPath(mainXpath);

        if (!mainEl) {
          return null;
        }

        const rect = (mainEl as Element).getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;

        return isVisible ? mainEl : null;
      },
      {
        intervalMs: pollInterval,
        timeoutMs: maxWait,
        onFound: function (elapsedMs) {
          log('Main progress bar FOUND after ' + elapsedMs + 'ms — waiting 500ms for dialog to fully render...', 'success');
          setTimeout(function () {
            log('Dialog settle delay complete — proceeding', 'check');
            resolve();
          }, 500);
        },
        onTimeout: function () {
          log('Main progress bar NOT found after ' + maxWait + 'ms — proceeding anyway (timeout)', 'warn');
          resolve();
        },
      },
    );
  });
}

/**
 * Close project dialog (toggle close if open).
 */
export function closeProjectDialog(): void {
  let btn = getByXPath(CONFIG.PROJECT_BUTTON_XPATH);

  if (!btn) {
    const fallbackBtn = findElement(ML_ELEMENTS.PROJECT_BUTTON);

    if (fallbackBtn) {
      btn = fallbackBtn;
    }
  }

  if (btn) {
    const isExpanded = (btn as Element).getAttribute('aria-expanded') === 'true' || (btn as Element).getAttribute('data-state') === 'open';

    if (isExpanded) {
      logSub('Closing project dialog', 1);
      reactClick(btn as Element, CONFIG.PROJECT_BUTTON_XPATH);
      reactClick(btn as Element, CONFIG.PROJECT_BUTTON_XPATH);
    }
  }
}

/**
 * Ensure project dialog is OPEN (not toggled closed).
 * Returns true if dialog is confirmed open, false if button not found.
 */
export function ensureProjectDialogOpen(): boolean {
  const hasNoWorkspaces = !loopCreditState.perWorkspace || loopCreditState.perWorkspace.length === 0;

  if (hasNoWorkspaces) {
    log('Project dialog blocked — workspaces not loaded yet', 'warn');

    return false;
  }

  log('Ensuring project dialog is OPEN...', 'check');
  log('Using XPath: ' + CONFIG.PROJECT_BUTTON_XPATH, 'check');

  let buttons = getAllByXPath(CONFIG.PROJECT_BUTTON_XPATH);
  const hasNoButtons = buttons.length === 0;

  if (hasNoButtons) {
    log('XPath returned 0 matches, trying multi-method fallback...', 'warn');
    const fallbackBtn = findElement(ML_ELEMENTS.PROJECT_BUTTON);

    if (fallbackBtn) {
      buttons = [fallbackBtn];
    } else {
      logError('PROJECT', 'BUTTON NOT FOUND via XPath or fallback!');
      log('Please update the XPath in the panel below or in config.ini', 'warn');

      return false;
    }
  }

  for (const [buttonIndex, btn] of buttons.entries()) {
    const clickResult = tryClickVisibleButton(btn as Element, buttonIndex);
    if (clickResult !== null) return clickResult;
  }

  logError('PROJECT', 'BUTTON NOT FOUND! (\' + buttons.length + \' matches but none are valid)');

  return false;
}

/** Try to click a single button if visible. Returns true/false on attempt, null if not visible. */
function tryClickVisibleButton(btn: Element, buttonIndex: number): boolean | null {
  const rect = btn.getBoundingClientRect();
  const computedStyle = window.getComputedStyle(btn);
  const isVisible = rect.width > 0 && rect.height > 0 &&
                  computedStyle.visibility !== 'hidden' &&
                  computedStyle.display !== 'none';

  if (!isVisible) {
    log('Button ' + buttonIndex + ' is not visible, skipping...', 'skip');
    return null;
  }

  let btnInfo = 'Button: ' + btn.tagName;
  if (btn.textContent) {
    btnInfo += ', text: "' + btn.textContent.substring(0, 30) + '"';
  }
  log(btnInfo, 'check');

  const isExpanded = btn.getAttribute('aria-expanded') === 'true' || btn.getAttribute('data-state') === 'open';
  if (isExpanded) {
    log('Dialog is ALREADY OPEN (aria-expanded=true) — skipping click', 'success');
    return true;
  }

  log('Dialog is CLOSED — clicking to open', 'check');
  highlightElement(btn as HTMLElement, '#6ee7b7');

  try {
    reactClick(btn);
    log('Clicked Project Button successfully — dialog should now be opening', 'success');
    return true;
  } catch (e) {
    logError('unknown', 'Click failed on button ' + buttonIndex + ': ' + (e as Error).message);
    return null;
  }
}

/**
 * Legacy alias for ensureProjectDialogOpen.
 */
export function clickProjectButton(): boolean {
  return ensureProjectDialogOpen();
}

/**
 * Highlight an element with a temporary CSS outline.
 */
export function highlightElement(el: HTMLElement, color: string): void {
  if (!el) {
    return;
  }

  el.style.outline = '3px solid ' + (color || '#ec4899');
  el.style.outlineOffset = '2px';
  el.style.boxShadow = '0 0 10px ' + (color || '#ec4899');

  setTimeout(function () {
    el.style.outline = '';
    el.style.outlineOffset = '';
    el.style.boxShadow = '';
  }, 3000);
}
