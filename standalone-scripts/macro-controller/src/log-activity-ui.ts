/**
 * MacroLoop Controller — Activity Log UI
 *
 * Manages the in-panel activity log: adding entries, rendering HTML,
 * incremental DOM updates, and toggle visibility.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { activityLogLines, getActivityLogVisible, maxActivityLines, setActivityLogVisible, cLogDefault, cLogError, cLogInfo, cLogSuccess, cLogDebug, cLogWarn, cLogDelegate, cLogCheck, cLogTimestamp, tFont, tFontSm } from './shared-state';
import type { ActivityLogEntry } from './types';

const CSS_SPAN_STYLE_COLOR = '<span style="color:';

// CQ11: Encapsulate rendered count in singleton
class LogRenderState {
  private _count = 0;

  get count(): number {
    return this._count;
  }

  set count(v: number) {
    this._count = v;
  }
}

const logRenderState = new LogRenderState();

export function addActivityLog(time: string | null, level: string, message: string, indent: number): void {
  const timestamp = time || new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
  const indentLevel = indent || 0;
  const entry = { time: timestamp, level: level, msg: message, indent: indentLevel };

  activityLogLines.push(entry);
  let didTrim = false;
  if (activityLogLines.length > maxActivityLines) {
    activityLogLines.shift();
    didTrim = true;
  }

  updateActivityLogUI(didTrim);
}

function _buildLogEntryHtml(entry: ActivityLogEntry): string {
  let color = cLogDefault;
  if (entry.level === 'ERROR' || entry.level === 'error') {
    color = cLogError;
  }
  else if (entry.level === 'INFO') color = cLogInfo;
  else if (entry.level === 'success') color = cLogSuccess;
  else if (entry.level === 'DEBUG') color = cLogDebug;
  else if (entry.level === 'WARN' || entry.level === 'warn') color = cLogWarn;
  else if (entry.level === 'delegate') color = cLogDelegate;
  else if (entry.level === 'check') color = cLogCheck;

  const indentPx = (entry.indent || 0) * 12;
  let html = '<div style="font-size:' + tFontSm + ';font-family:' + tFont + ';padding:2px 0;color:' + color + ';margin-left:' + indentPx + 'px;">';
  if (entry.indent && entry.indent > 0) {
    html += CSS_SPAN_STYLE_COLOR + cLogTimestamp + ';">' + entry.time + '</span> ';
  } else {
    html += CSS_SPAN_STYLE_COLOR + cLogTimestamp + ';">[' + entry.time + ']</span> ';
    html += CSS_SPAN_STYLE_COLOR + cLogDefault + ';">[' + entry.level + ']</span> ';
  }
  html += entry.msg;
  html += '</div>';
  return html;
}

export function updateActivityLogUI(didTrim: boolean): void {
  const logContainer = document.getElementById('loop-activity-log-content');
  if (!logContainer) {
    return;
  }

  const total = activityLogLines.length;
  if (total === 0) {
    logContainer.innerHTML = '<div style="color:' + cLogTimestamp + ';font-size:' + tFontSm + ';padding:8px;">No activity logs yet</div>';
    logRenderState.count = 0;
    return;
  }

  if (didTrim || logRenderState.count > total) {
    let html = '';
    for (let i = total - 1; i >= 0; i--) {
      html += _buildLogEntryHtml(activityLogLines[i]);
    }
    logContainer.innerHTML = html;
    logRenderState.count = total;
    return;
  }

  const newCount = total - logRenderState.count;
  if (newCount <= 0) {
    return;
  }

  const frag = document.createDocumentFragment();
  for (let j = total - 1; j >= total - newCount; j--) {
    const div = document.createElement('div');
    div.innerHTML = _buildLogEntryHtml(activityLogLines[j]);
    if (div.firstChild) {
      frag.appendChild(div.firstChild);
    }
  }
  logContainer.insertBefore(frag, logContainer.firstChild);
  logRenderState.count = total;
}

export function toggleActivityLog(): void {
  setActivityLogVisible(!getActivityLogVisible());
  const logPanel = document.getElementById('loop-activity-log-panel');
  if (logPanel) {
    logPanel.style.display = getActivityLogVisible() ? 'block' : 'none';
  }
}
