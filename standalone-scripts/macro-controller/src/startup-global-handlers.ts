/**
 * MacroLoop Controller — Global Error Handlers & Diagnostic Dump
 *
 * Installs window-level error/rejection handlers that log and stop
 * the loop on macro-related errors, plus a diagnostic dump API.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log } from './logging';
import { logError } from './error-utils';
import { nsWrite } from './api-namespace';
import { showToast } from './toast';
import { VERSION, loopCreditState, state } from './shared-state';
import { extractProjectIdFromUrl } from './workspace-detection';
import { stopLoop } from './loop-engine';
import { pushOverlayError } from './ui/error-overlay';
import type { DiagnosticDump } from './types';

/** Install global error and unhandled rejection handlers. */
export function setupGlobalErrorHandlers(): void {
  window.addEventListener('error', function (event: ErrorEvent) {
    const hasNoMessage = !event || !event.message;
    if (hasNoMessage) return;

    const isUnrelatedFile = event.filename && event.filename.indexOf('macro') === -1 && event.filename.indexOf('blob:') === -1;
    if (isUnrelatedFile) return;

    const errMsg = event.message || 'Unknown error';
    const stack = event.error && event.error.stack ? event.error.stack : (event.filename + ':' + event.lineno);
    logError('GlobalErrorHandler', 'Uncaught: ' + errMsg);

    if (state.running) {
      stopLoop();
    }

    showToast('Uncaught error: ' + errMsg, 'error', { stack: stack, noStop: true });
    pushOverlayError('error', errMsg, stack, event.filename || 'unknown');
  });

  window.addEventListener('unhandledrejection', function (event: PromiseRejectionEvent) {
    const hasNoReason = !event || !event.reason;
    if (hasNoReason) return;

    const errMsg = event.reason.message || String(event.reason);
    const stack = event.reason.stack || '';
    logError('GlobalErrorHandler', 'Unhandled promise rejection: ' + errMsg);

    if (state.running) {
      stopLoop();
    }

    showToast('Unhandled rejection: ' + errMsg, 'error', { stack: stack, noStop: true });
    pushOverlayError('error', errMsg, stack, 'unhandled-rejection');
  });
}

// CQ16: Extracted from setupDiagnosticDump closure
function buildDiagnosticDump(): DiagnosticDump {
  const diag: DiagnosticDump = {
    version: VERSION,
    workspaceName: state.workspaceName,
    workspaceFromApi: state.workspaceFromApi,
    currentWsName: loopCreditState.currentWs ? (loopCreditState.currentWs.fullName || loopCreditState.currentWs.name) : '(null)',
    currentWsId: loopCreditState.currentWs ? loopCreditState.currentWs.id : '(null)',
    wsCount: (loopCreditState.perWorkspace || []).length,
    wsByIdKeys: Object.keys(loopCreditState.wsById || {}),
    projectId: extractProjectIdFromUrl(),
    lastCheckedAt: loopCreditState.lastCheckedAt ? new Date(loopCreditState.lastCheckedAt).toLocaleTimeString() : '(never)',
    source: loopCreditState.source,
  };

  log('=== DIAGNOSTIC DUMP ===', 'warn');
  for (const k in diag) {
    const val = Array.isArray(diag[k]) ? '[' + diag[k].join(', ') + ']' : String(diag[k]);
    log('  ' + k + ': ' + val, 'check');
  }

  const perWs = loopCreditState.perWorkspace || [];
  for (const [wsIdx, ws] of perWs.entries()) {
    log('  ws[' + wsIdx + ']: id=' + ws.id + ' name="' + ws.fullName + '"', 'check');
  }

  return diag;
}

/** Register the diagnostic dump API on window + namespace. */
export function setupDiagnosticDump(): void {
  nsWrite('api.loop.diagnostics', buildDiagnosticDump);
}

// Re-export overlay API for external use
export { pushOverlayError, ensureErrorOverlay, getOverlayErrorCount, setOverlayVisible } from './ui/error-overlay';
