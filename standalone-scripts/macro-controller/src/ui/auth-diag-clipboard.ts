/**
 * MacroLoop Controller — Auth Diagnostics Clipboard & Header
 *
 * Copy-to-clipboard button and header badge for the auth diagnostics panel.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { getWaterfallClipboardLines } from './auth-diag-waterfall';
import { logError } from '../error-utils';
import { showToast } from '../toast';

/** Build the copy button and status badge for the diagnostics header. */
export function buildHeaderControls(
  cookieVal: HTMLElement,
  bridgeVal: HTMLElement,
  srcVal: HTMLElement,
  jwtVal: HTMLElement,
  jwtDetailVal: HTMLElement,
  refreshVal: HTMLElement,
): { copyButton: HTMLElement; headerBadge: HTMLElement } {
  const copyButton = document.createElement('button');
  copyButton.style.cssText = 'margin-left:auto;padding:1px 5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:3px;font-size:10px;cursor:pointer;opacity:0.7;transition:opacity 0.15s;line-height:1;';
  copyButton.textContent = '📋';
  copyButton.title = 'Copy auth diagnostics';
  copyButton.onmouseenter = function () { copyButton.style.opacity = '1'; };
  copyButton.onmouseleave = function () { copyButton.style.opacity = '0.7'; };

  copyButton.onclick = function (e: MouseEvent) {
    e.stopPropagation();
    const text = buildDiagnosticClipboardText(cookieVal, bridgeVal, srcVal, jwtVal, jwtDetailVal, refreshVal);
    navigator.clipboard.writeText(text).then(function () {
      copyButton.textContent = '✅';
      setTimeout(function () { copyButton.textContent = '📋'; }, 1500);
    }).catch(function (e) {
      logError('copyAuthDiag', 'Clipboard write failed', e);
      showToast('❌ Clipboard write failed', 'error');
      copyButton.textContent = '❌';
      setTimeout(function () { copyButton.textContent = '📋'; }, 1500);
    });
  };

  const headerBadge = document.createElement('span');
  headerBadge.style.cssText = 'font-size:11px;margin-left:4px;';

  return { copyButton, headerBadge };
}

function buildDiagnosticClipboardText(
  cookieVal: HTMLElement,
  bridgeVal: HTMLElement,
  srcVal: HTMLElement,
  jwtVal: HTMLElement,
  jwtDetailVal: HTMLElement,
  refreshVal: HTMLElement,
): string {
  const lines = [
    '=== Auth Diagnostics @ ' + new Date().toLocaleTimeString('en-US', { hour12: false }) + ' ===',
    'Cookies: ' + cookieVal.textContent + ' (' + cookieVal.title + ')',
    'Bridge:  ' + bridgeVal.textContent,
    'Source:  ' + srcVal.textContent,
    'JWT:     ' + jwtVal.textContent,
    'Detail:  ' + jwtDetailVal.textContent,
    'Refresh: ' + refreshVal.textContent,
  ];

  // Append SDK auth resolution diagnostic if available
  try {
    const authDiag = window.marco?.auth?.getLastAuthDiag?.();
    if (authDiag) {
      const bridgeTag = authDiag.bridgeOutcome === 'hit' ? '✅ bridge hit'
        : authDiag.bridgeOutcome === 'timeout' ? '⏱ bridge timeout'
        : authDiag.bridgeOutcome === 'error' ? '❌ bridge error'
        : 'bridge skipped';
      lines.push('SDK Auth: ' + authDiag.source + ' · ' + bridgeTag + ' · ' + Math.round(authDiag.durationMs) + 'ms');
    }
  } catch (e) {
    logError('buildAuthDiag', 'SDK auth diagnostics unavailable', e);
    // SDK not available
  }

  lines.push('');
  lines.push('=== Startup Waterfall ===');

  const waterfallLines = getWaterfallClipboardLines();

  for (const line of waterfallLines) {
    lines.push(line);
  }

  return lines.join('\n');
}
