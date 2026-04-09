/**
 * JS Executor — Extracted from macro-looping.ts (Step 2)
 *
 * Provides a JS console inside the macro controller overlay.
 */

import { VERSION, IDS, cPanelFg, cPanelFgDim } from '../shared-state';
import { log, logSub } from '../logging';
import { logError } from '../error-utils';

const CSS_SPAN_STYLE_COLOR = '<span style="color:';

// === Module-level state ===
const loopJsHistory: Array<{time: string, code: string, success: boolean, result: string}> = [];
// CQ11: Singleton for JS history navigation index
class JsHistoryState {
  private _index = -1;

  get index(): number {
    return this._index;
  }

  set index(v: number) {
    this._index = v;
  }
}

const jsHistoryState = new JsHistoryState();
const LOOP_JS_HISTORY_MAX = 20;

export function addLoopJsHistoryEntry(code: string, success: boolean, resultText: string): void {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const entry = { time: timeStr, code: code, success: success, result: resultText };
  const isDuplicate = loopJsHistory.length > 0 && loopJsHistory[0].code === code;
  if (!isDuplicate) {
    loopJsHistory.unshift(entry);
    if (loopJsHistory.length > LOOP_JS_HISTORY_MAX) loopJsHistory.pop();
    logSub('JS history updated: ' + loopJsHistory.length + ' entries');
  }
  jsHistoryState.index = -1;
  renderLoopJsHistory();
}

export function renderLoopJsHistory(): void {
  const el = document.getElementById('loop-js-history');
  if (!el) return;
  if (loopJsHistory.length === 0) {
    el.innerHTML = '<span style="color:#64748b;font-size:10px;">No commands yet</span>';
    return;
  }
  let html = '';
  for (const [histIndex, e] of loopJsHistory.entries()) {
    const statusColor = e.success ? '#4ade80' : '#ef4444';
    const statusIcon = e.success ? '✓' : '✗';
    html += '<div class="loop-js-hist-item" data-hist-idx="' + histIndex + '" style="display:flex;gap:4px;align-items:flex-start;padding:3px 4px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.05);font-size:10px;font-family:monospace;"'
      + ' onmouseover="(this as HTMLElement).style.background=\'rgba(139,92,246,0.15)\'"'
      + ' onmouseout="(this as HTMLElement).style.background=\'transparent\'">'
      + CSS_SPAN_STYLE_COLOR + statusColor + ';font-size:10px;">' + statusIcon + '</span>'
      + CSS_SPAN_STYLE_COLOR + cPanelFgDim + ';font-size:9px;min-width:40px;">' + e.time + '</span>'
      + CSS_SPAN_STYLE_COLOR + cPanelFg + ';flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + e.code.substring(0, 60) + '</span>'
      + '</div>';
  }
  el.innerHTML = html;
  // Bind click events for recall
  const items = el.querySelectorAll('.loop-js-hist-item');
  for (const [histIdx, item] of Array.from(items).entries()) {
    (item as HTMLElement).onclick = (function(idx: number) {
      return function() {
        const ta = document.getElementById(IDS.JS_EXECUTOR) as HTMLTextAreaElement | null;
        if (ta && loopJsHistory[idx]) {
          ta.value = loopJsHistory[idx].code;
          ta.focus();
          log('Recalled JS command #' + idx, 'success');
        }
      };
    })(histIdx);
  }
}

export function navigateLoopJsHistory(direction: string): void {
  const ta = document.getElementById(IDS.JS_EXECUTOR) as HTMLTextAreaElement | null;
  if (!ta || loopJsHistory.length === 0) return;
  if (direction === 'up') {
    if (jsHistoryState.index < loopJsHistory.length - 1) {
      jsHistoryState.index++;
      ta.value = loopJsHistory[jsHistoryState.index].code;
    }
  } else {
    if (jsHistoryState.index > 0) {
      jsHistoryState.index--;
      ta.value = loopJsHistory[jsHistoryState.index].code;
    } else {
      jsHistoryState.index = -1;
      ta.value = '';
    }
  }
}

export function executeJs(): void {
  const textbox = document.getElementById(IDS.JS_EXECUTOR);
  if (!textbox) {
    logError('unknown', 'JS textbox element not found');
    return;
  }
  const code = (textbox as HTMLTextAreaElement).value.trim();
  if (!code) {
    log('No code to execute', 'warn');
    return;
  }

  log('Executing custom JS code...');
  try {
    const result = new Function(code)();
    const resultStr = result !== undefined ? String(result) : '(undefined)';
    if (result !== undefined) {
      console.log('[MacroLoop v' + VERSION + '] Result:', result);
    }
    log('JS execution completed successfully', 'success');
    addLoopJsHistoryEntry(code, true, resultStr.substring(0, 100));
  } catch(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logError('JS execution error', '' + msg);
    addLoopJsHistoryEntry(code, false, msg);
  }
}
