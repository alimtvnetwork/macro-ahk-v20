/**
 * MacroLoop Controller — Workspace History Section
 *
 * Collapsible panel showing workspace navigation history.
 * Extracted from sections.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { cPanelFgDim, cPrimaryLight } from '../shared-state';
import { createCollapsibleSection } from './section-collapsible';

export interface WsHistoryDeps {
  getWorkspaceHistory: () => Array<Record<string, string>>;
  getDisplayProjectName: () => string;
  getWsHistoryKey: () => string;
}

export interface WsHistoryResult {
  section: HTMLElement;
  renderWsHistory: () => void;
}

// CQ16: Extracted from createWsHistorySection closure
function renderWsHistoryPanel(panel: HTMLElement, deps: WsHistoryDeps): void {
  const history = deps.getWorkspaceHistory();
  const projectName = deps.getDisplayProjectName();
  const historyKey = deps.getWsHistoryKey();
  const isEmpty = history.length === 0;

  if (isEmpty) {
    panel.innerHTML = '<div style="color:' + cPanelFgDim + ';font-size:10px;padding:4px;">No workspace changes recorded for project "' + projectName + '"</div>';

    return;
  }

  let html = buildHistoryHeader(projectName, history.length);
  html += buildHistoryEntries(history);
  html += buildClearButton(historyKey);
  panel.innerHTML = html;
}

/** Build the workspace history collapsible section. */
export function createWsHistorySection(deps: WsHistoryDeps): WsHistoryResult {
  const wsHistoryCol = createCollapsibleSection('Workspace History', 'ml_collapse_wshistory');

  const wsHistoryPanel = document.createElement('div');
  wsHistoryPanel.id = 'loop-ws-history-panel';
  wsHistoryPanel.style.cssText = 'padding:4px;background:rgba(0,0,0,.5);border:1px solid #b45309;border-radius:3px;max-height:120px;overflow-y:auto;';

  const renderWsHistory = function(): void { renderWsHistoryPanel(wsHistoryPanel, deps); };

  wsHistoryCol.body.appendChild(wsHistoryPanel);
  const origClick = wsHistoryCol.header.onclick as (() => void) | null;

  wsHistoryCol.header.onclick = function () {
    if (origClick) {
      origClick();
    }
    const isVisible = wsHistoryCol.body.style.display !== 'none';
    if (isVisible) {
      renderWsHistory();
    }
  };

  const isInitiallyVisible = wsHistoryCol.body.style.display !== 'none';
  if (isInitiallyVisible) {
    renderWsHistory();
  }

  return { section: wsHistoryCol.section, renderWsHistory };
}

function buildHistoryHeader(projectName: string, entryCount: number): string {
  return '<div style="font-size:9px;color:' + cPrimaryLight + ';padding:2px 0;margin-bottom:2px;">📁 Project: ' + projectName + ' (' + entryCount + ' entries)</div>';
}

function buildHistoryEntries(history: Array<Record<string, string>>): string {
  let html = '';

  for (const entry of [...history].reverse()) {
    html += '<div style="font-size:10px;font-family:monospace;padding:2px 0;color:#fbbf24;">';
    html += '<span style="color:' + cPanelFgDim + ';">[' + entry.display + ']</span> ';
    html += '<span style="color:#ef4444;">' + entry.from + '</span>';
    html += ' <span style="color:#9ca3af;">→</span> ';
    html += '<span style="color:#10b981;">' + entry.to + '</span>';
    html += '</div>';
  }

  return html;
}

function buildClearButton(historyKey: string): string {
  return '<div style="margin-top:4px;text-align:right;"><button onclick="(function(){try{localStorage.removeItem(\'' + historyKey + '\');document.getElementById(\'loop-ws-history-panel\').innerHTML=\'<div style=\\\'color:' + cPanelFgDim + ';font-size:10px;padding:4px;\\\'>History cleared</div>\';}catch(e){console.warn(\'[MacroLoop] Clear history failed:\',e.message||e);}})();" style="padding:2px 6px;background:#7f1d1d;color:#fca5a5;border:1px solid #991b1b;border-radius:2px;font-size:9px;cursor:pointer;">Clear History</button></div>';
}
