/**
 * MacroLoop Controller — Tools & Collapsible Sections Builder
 * Step 2g: Extracted from macro-looping.ts
 *
 * Builds the collapsible tool sections:
 * - XPath Configuration (editable inputs)
 * - JS Executor (textarea + run + history)
 * - Activity Log (with download)
 * - JS Logs (copy/download/clear)
 * - Recent Errors (copy all/download)
 */

import { log } from '../logging';
import {
  getAllLogs, clearAllLogs, copyLogsToClipboard, downloadLogs,
} from '../logging';
import {
  VERSION, IDS, CONFIG,
  cPanelBgAlt, cPanelFgDim,
  cPrimary, cPrimaryLight,
  cInputBg, cInputBorder, cInputFg,
  cSectionHeader,
  trFast,
} from '../shared-state';
import { showToast, recentErrors, onRecentErrorsChange, formatRequestDetail } from '../toast';
import type { RecentError } from '../toast';
import { createCollapsibleSection } from './sections';

export interface ToolsSectionsDeps {
  btnStyle: string;
  updateProjectButtonXPath: (val: string) => void;
  updateProgressXPath: (val: string) => void;
  updateWorkspaceXPath: (val: string) => void;
  executeJs: () => void;
  navigateLoopJsHistory: (dir: string) => void;
}

export interface ToolsSectionsResult {
  xpathSection: HTMLElement;
  jsSection: HTMLElement;
  jsBody: HTMLElement;
  activitySection: HTMLElement;
  logSection: HTMLElement;
  recentErrorsSection: HTMLElement;
}

/**
 * Build all collapsible tool sections.
 */
export function buildToolsSections(deps: ToolsSectionsDeps): ToolsSectionsResult {
  const { btnStyle, updateProjectButtonXPath, updateProgressXPath, updateWorkspaceXPath, executeJs, navigateLoopJsHistory } = deps;

  // === XPath Configuration ===
  const xpathCol = createCollapsibleSection('XPath Configuration (editable)', 'ml_collapse_xpath');
  const xpathSection = xpathCol.section;
  const xpathBody = xpathCol.body;

  const projLabel = document.createElement('div');
  projLabel.style.cssText = 'font-size:9px;color:' + cSectionHeader + ';margin-bottom:1px;';
  projLabel.textContent = 'Project Button XPath:';

  const projInput = document.createElement('input');
  projInput.type = 'text';
  projInput.id = 'xpath-project-btn';
  projInput.value = CONFIG.PROJECT_BUTTON_XPATH;
  projInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-family:monospace;font-size:9px;margin-bottom:4px;box-sizing:border-box;';
  projInput.onchange = function() {
    updateProjectButtonXPath((this as HTMLInputElement || '').value);
  };

  const progLabel = document.createElement('div');
  progLabel.style.cssText = 'font-size:9px;color:' + cSectionHeader + ';margin-bottom:1px;';
  progLabel.textContent = 'Progress Bar XPath:';

  const progInput = document.createElement('input');
  progInput.type = 'text';
  progInput.id = 'xpath-progress-bar';
  progInput.value = CONFIG.PROGRESS_XPATH;
  progInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-family:monospace;font-size:9px;box-sizing:border-box;';
  progInput.onchange = function() {
    updateProgressXPath((this as HTMLInputElement || '').value);
  };

  const wsLabel = document.createElement('div');
  wsLabel.style.cssText = 'font-size:9px;color:' + cSectionHeader + ';margin-bottom:1px;margin-top:4px;';
  wsLabel.textContent = 'Workspace Name XPath:';

  const wsInput = document.createElement('input');
  wsInput.type = 'text';
  wsInput.id = 'xpath-workspace-name';
  wsInput.value = CONFIG.WORKSPACE_XPATH;
  wsInput.style.cssText = 'width:100%;padding:3px 5px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-family:monospace;font-size:9px;box-sizing:border-box;';
  wsInput.onchange = function() {
    updateWorkspaceXPath((this as HTMLInputElement || '').value);
  };

  xpathBody.appendChild(projLabel);
  xpathBody.appendChild(projInput);
  xpathBody.appendChild(progLabel);
  xpathBody.appendChild(progInput);
  xpathBody.appendChild(wsLabel);
  xpathBody.appendChild(wsInput);

  // === JS Executor ===
  const jsCol = createCollapsibleSection('JS Executor (Ctrl+Enter to run)', 'ml_collapse_jsexec');
  const jsSection = jsCol.section;
  const jsBody = jsCol.body;

  const jsRow = document.createElement('div');
  jsRow.style.cssText = 'display:flex;gap:4px;';

  const jsTextbox = document.createElement('textarea');
  jsTextbox.id = IDS.JS_EXECUTOR;
  jsTextbox.placeholder = 'JavaScript code...';
  jsTextbox.style.cssText = 'flex:1;min-height:30px;padding:4px;border:1px solid ' + cInputBorder + ';border-radius:3px;background:' + cInputBg + ';color:' + cInputFg + ';font-family:monospace;font-size:10px;resize:vertical;';
  jsTextbox.spellcheck = false;
  jsTextbox.onkeydown = function(e: KeyboardEvent) {
    const isCtrlEnter = e.ctrlKey && e.key === 'Enter';
    if (isCtrlEnter) {
      e.preventDefault();
      executeJs();
      return;
    }
    const isSingleLine = (jsTextbox.value || '').indexOf('\n') === -1;
    if (e.key === 'ArrowUp' && isSingleLine) {
      e.preventDefault();
      navigateLoopJsHistory('up');
      return;
    }
    if (e.key === 'ArrowDown' && isSingleLine) {
      e.preventDefault();
      navigateLoopJsHistory('down');
      return;
    }
  };

  const jsBtn = document.createElement('button');
  jsBtn.id = IDS.JS_EXECUTE_BTN;
  jsBtn.textContent = 'Run';
  jsBtn.style.cssText = btnStyle + 'background:#8b5cf6;color:#fff;align-self:flex-end;';
  jsBtn.onclick = executeJs;

  jsRow.appendChild(jsTextbox);
  jsRow.appendChild(jsBtn);
  jsBody.appendChild(jsRow);

  // JS Command History panel
  const jsHistLabel = document.createElement('div');
  jsHistLabel.style.cssText = 'font-size:9px;color:' + cPrimaryLight + ';margin-top:4px;';
  jsHistLabel.textContent = 'JS History (click to recall, Up/Down arrows in textbox)';
  jsBody.appendChild(jsHistLabel);

  const jsHistBox = document.createElement('div');
  jsHistBox.id = 'loop-js-history';
  jsHistBox.style.cssText = 'max-height:80px;overflow-y:auto;background:rgba(0,0,0,.3);border:1px solid ' + cPrimary + ';border-radius:3px;margin-top:2px;';
  jsHistBox.innerHTML = '<span style="color:#64748b;font-size:10px;padding:4px;">No commands yet</span>';
  jsBody.appendChild(jsHistBox);

  // === Activity Log ===
  const activityCol = createCollapsibleSection('Activity Log', 'ml_collapse_activity');
  const activitySection = activityCol.section;

  const activityDownloadBtn = document.createElement('span');
  activityDownloadBtn.textContent = '📥';
  activityDownloadBtn.title = 'Download activity log as text file';
  activityDownloadBtn.style.cssText = 'font-size:11px;cursor:pointer;margin-left:auto;padding:0 4px;opacity:0.7;transition:opacity ' + trFast + ';';
  activityDownloadBtn.onmouseover = function() { (this as HTMLElement).style.opacity = '1'; };
  activityDownloadBtn.onmouseout = function() { (this as HTMLElement).style.opacity = '0.7'; };
  activityDownloadBtn.onclick = function(e: Event) {
    e.stopPropagation();
    var logContent = activityContent.innerText || activityContent.textContent || '';
    if (!logContent || logContent.trim() === 'No activity logs yet') {
      showToast('No activity logs to download', 'warn');
      return;
    }
    var now = new Date();
    var timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    var header = '# MacroLoop Activity Log Export\n';
    header += '# Generated: ' + now.toISOString() + '\n';
    header += '# Version: v' + VERSION + '\n';
    header += '# ─────────────────────────────────\n\n';
    var blob = new Blob([header + logContent], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'activity-log-' + timestamp + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('Activity log exported (' + logContent.length + ' chars)', 'success');
    showToast('Activity log downloaded ✓', 'success');
  };
  activityCol.header.appendChild(activityDownloadBtn);

  const activityPanel = document.createElement('div');
  activityPanel.id = 'loop-activity-log-panel';
  activityPanel.style.cssText = 'padding:4px;background:rgba(0,0,0,.5);border:1px solid ' + cPrimary + ';border-radius:3px;max-height:120px;overflow-y:auto;';

  const activityContent = document.createElement('div');
  activityContent.id = 'loop-activity-log-content';
  activityContent.innerHTML = '<div style="color:' + cPanelFgDim + ';font-size:10px;padding:4px;">No activity logs yet</div>';

  activityPanel.appendChild(activityContent);
  activityCol.body.appendChild(activityPanel);

  // === JS Logs ===
  const logCol = createCollapsibleSection('JS Logs (' + getAllLogs().length + ' entries)', 'ml_collapse_jslogs');
  const logSection = logCol.section;

  const logExportRow = document.createElement('div');
  logExportRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

  const logLabel = document.createElement('span');
  logLabel.style.cssText = 'font-size:9px;color:' + cPrimaryLight + ';flex:1;';
  logLabel.textContent = 'JS Logs (' + getAllLogs().length + ' entries)';
  logLabel.id = 'loop-log-count';

  const copyLogBtn = document.createElement('button');
  copyLogBtn.textContent = 'Copy';
  copyLogBtn.style.cssText = 'padding:2px 6px;background:' + cPanelBgAlt + ';color:#c9a8ef;border:1px solid ' + cPrimary + ';border-radius:2px;font-size:9px;cursor:pointer;';
  copyLogBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    copyLogsToClipboard();
    const countEl = document.getElementById('loop-log-count');
    if (countEl) countEl.textContent = 'Copied! (' + getAllLogs().length + ' entries)';
    setTimeout(function() {
      if (countEl) countEl.textContent = 'JS Logs (' + getAllLogs().length + ' entries)';
    }, 2000);
  };

  const downloadLogBtn = document.createElement('button');
  downloadLogBtn.textContent = 'DL';
  downloadLogBtn.title = 'Download logs';
  downloadLogBtn.style.cssText = 'padding:2px 6px;background:' + cPanelBgAlt + ';color:#c9a8ef;border:1px solid ' + cPrimary + ';border-radius:2px;font-size:9px;cursor:pointer;';
  downloadLogBtn.onclick = function(e: Event) { e.preventDefault(); e.stopPropagation(); downloadLogs(); };

  const clearLogBtn = document.createElement('button');
  clearLogBtn.textContent = 'Clr';
  clearLogBtn.title = 'Clear all logs';
  clearLogBtn.style.cssText = 'padding:2px 6px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:2px;font-size:9px;cursor:pointer;';
  clearLogBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    clearAllLogs();
    const countEl = document.getElementById('loop-log-count');
    if (countEl) countEl.textContent = 'JS Logs (0 entries)';
  };

  logExportRow.appendChild(logLabel);
  logExportRow.appendChild(copyLogBtn);
  logExportRow.appendChild(downloadLogBtn);
  logExportRow.appendChild(clearLogBtn);
  logCol.body.appendChild(logExportRow);

  // === Recent Errors ===
  const errCol = createCollapsibleSection('Recent Errors (' + recentErrors.length + ')', 'ml_collapse_recent_errors');
  const recentErrorsSection = errCol.section;

  // Inline buttons on the header row (same line as title)
  const errHeaderBtns = document.createElement('span');
  errHeaderBtns.style.cssText = 'margin-left:auto;display:flex;gap:3px;align-items:center;';

  const _errBtnStyle = 'padding:1px 5px;background:' + cPanelBgAlt + ';color:#c9a8ef;border:1px solid rgba(255,255,255,0.08);border-radius:2px;font-size:9px;cursor:pointer;transition:background-color 150ms ease,filter 150ms ease;';

  const copyAllErrBtn = document.createElement('button');
  copyAllErrBtn.textContent = '📋';
  copyAllErrBtn.title = 'Copy All Errors';
  copyAllErrBtn.style.cssText = _errBtnStyle;
  copyAllErrBtn.onmouseenter = function() { copyAllErrBtn.style.filter = 'brightness(1.3)'; };
  copyAllErrBtn.onmouseleave = function() { copyAllErrBtn.style.filter = ''; };
  copyAllErrBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const text = _formatAllRecentErrors();
    navigator.clipboard.writeText(text).then(function() {
      copyAllErrBtn.textContent = '✓';
      setTimeout(function() { copyAllErrBtn.textContent = '📋'; }, 2000);
    }).catch(function() { /* fallback */ });
  };

  const dlErrBtn = document.createElement('button');
  dlErrBtn.textContent = '⬇';
  dlErrBtn.title = 'Download Errors';
  dlErrBtn.style.cssText = _errBtnStyle;
  dlErrBtn.onmouseenter = function() { dlErrBtn.style.filter = 'brightness(1.3)'; };
  dlErrBtn.onmouseleave = function() { dlErrBtn.style.filter = ''; };
  dlErrBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    const text = _formatAllRecentErrors();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'recent-errors-' + new Date().toISOString().replace(/[:.]/g, '-') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log('Downloaded recent errors file', 'success');
  };

  const clearErrBtn = document.createElement('button');
  clearErrBtn.textContent = '🗑';
  clearErrBtn.title = 'Clear Errors';
  clearErrBtn.style.cssText = _errBtnStyle + 'color:#fca5a5;';
  clearErrBtn.onmouseenter = function() { clearErrBtn.style.filter = 'brightness(1.3)'; };
  clearErrBtn.onmouseleave = function() { clearErrBtn.style.filter = ''; };
  clearErrBtn.onclick = function(e: Event) {
    e.preventDefault(); e.stopPropagation();
    recentErrors.length = 0;
    _renderRecentErrorsList(errListContainer);
    const countEl = document.getElementById('loop-recent-errors-count');
    if (countEl) countEl.textContent = '0 error(s)';
  };

  errHeaderBtns.appendChild(copyAllErrBtn);
  errHeaderBtns.appendChild(dlErrBtn);
  errHeaderBtns.appendChild(clearErrBtn);
  errCol.header.appendChild(errHeaderBtns);

  const errListContainer = document.createElement('div');
  errListContainer.id = 'loop-recent-errors-list';
  errListContainer.style.cssText = 'max-height:150px;overflow-y:auto;background:rgba(0,0,0,.4);border:1px solid ' + cPrimary + ';border-radius:3px;padding:4px;';
  _renderRecentErrorsList(errListContainer);
  errCol.body.appendChild(errListContainer);

  // Live-update when new errors arrive
  onRecentErrorsChange(function() {
    _renderRecentErrorsList(errListContainer);
    const countEl = document.getElementById('loop-recent-errors-count');
    if (countEl) countEl.textContent = recentErrors.length + ' error(s)';
  });

  return { xpathSection, jsSection, jsBody, activitySection, logSection, recentErrorsSection };
}

// ============================================
// Recent Errors helpers
// ============================================
function _renderRecentErrorsList(container: HTMLElement): void {
  if (recentErrors.length === 0) {
    container.innerHTML = '<div style="color:#64748b;font-size:10px;padding:4px;">No recent errors</div>';
    return;
  }
  let html = '';
  for (let i = 0; i < recentErrors.length; i++) {
    const err = recentErrors[i];
    const color = err.level === 'error' ? '#fca5a5' : '#fde68a';
    const icon = err.level === 'error' ? '❌' : '⚠️';
    html += '<div style="font-size:10px;font-family:monospace;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05);color:' + color + ';">';
    html += '<span style="color:#64748b;">[' + err.timestamp + ']</span> ' + icon + ' ' + _escHtml(err.message);
    if (err.requestDetail) {
      html += '<div style="font-size:9px;color:#94a3b8;margin-top:1px;margin-left:12px;">';
      if (err.requestDetail.method) html += err.requestDetail.method + ' ';
      if (err.requestDetail.url) html += _escHtml(err.requestDetail.url.substring(0, 80));
      if (err.requestDetail.status != null) html += ' → HTTP ' + err.requestDetail.status;
      html += '</div>';
    }
    html += '</div>';
  }
  container.innerHTML = html;
}

function _escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _formatAllRecentErrors(): string {
  const lines: string[] = [];
  lines.push('=== MacroLoop Recent Errors ===');
  lines.push('Exported: ' + new Date().toISOString());
  lines.push('Total: ' + recentErrors.length);
  lines.push('---');
  for (let i = 0; i < recentErrors.length; i++) {
    const err = recentErrors[i];
    lines.push('\n[' + err.timestamp + '] [' + err.level.toUpperCase() + '] ' + err.message);
    if (err.requestDetail) lines.push(formatRequestDetail(err.requestDetail));
    if (err.stack) lines.push('Stack: ' + err.stack);
  }
  return lines.join('\n');
}
