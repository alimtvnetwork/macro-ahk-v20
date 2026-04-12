/**
 * MacroLoop Controller — Startup Waterfall Visualization
 *
 * Renders a horizontal bar chart of startup timing entries
 * with animated reveals, color-coded status, and skeleton loading.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { getTimingEntries, getTimingSinceLoadMs } from '../startup-timing';
import { createSkeletonBar } from './skeleton';
import { cPanelFgDim } from '../shared-state';

const CSS_FONT_SIZE_9PX_COLOR = 'font-size:9px;color:';

const STATUS_COLORS: Record<string, string> = {
  ok: '#4ade80',
  warn: '#fbbf24',
  error: '#f87171',
  pending: '#60a5fa',
};

/** Build the waterfall container with header and refresh button. */
export function buildWaterfallSection(): { waterfallContainer: HTMLElement; renderWaterfall: () => void } {
  const waterfallContainer = document.createElement('div');
  waterfallContainer.style.cssText = 'margin-top:6px;padding:4px 6px;background:rgba(0,0,0,.25);border-radius:4px;';

  const waterfallHeader = document.createElement('div');
  waterfallHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;';

  const waterfallTitle = document.createElement('span');
  waterfallTitle.style.cssText = 'font-size:9px;font-weight:bold;color:' + cPanelFgDim + ';';
  waterfallTitle.textContent = '⏱ Startup Waterfall';

  const refreshWfBtn = document.createElement('button');
  refreshWfBtn.style.cssText = 'padding:1px 5px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:3px;font-size:9px;cursor:pointer;opacity:0.7;transition:opacity 0.15s;line-height:1;color:' + cPanelFgDim + ';';
  refreshWfBtn.textContent = '🔄';
  refreshWfBtn.title = 'Refresh waterfall';
  refreshWfBtn.onmouseenter = function () { refreshWfBtn.style.opacity = '1'; };
  refreshWfBtn.onmouseleave = function () { refreshWfBtn.style.opacity = '0.7'; };

  waterfallHeader.appendChild(waterfallTitle);
  waterfallHeader.appendChild(refreshWfBtn);
  waterfallContainer.appendChild(waterfallHeader);

  const waterfallBody = document.createElement('div');
  waterfallBody.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
  waterfallContainer.appendChild(waterfallBody);

  const renderWaterfall = function(): void {
    const entries = getTimingEntries();
    const totalMs = getTimingSinceLoadMs();
    const hasNoEntries = entries.length === 0;

    if (hasNoEntries) {
      renderWaterfallSkeletons(waterfallBody);
      return;
    }

    renderWaterfallEntries(waterfallBody, entries, totalMs);
  };

  refreshWfBtn.onclick = function (e: MouseEvent) { e.stopPropagation(); renderWaterfall(); };

  return { waterfallContainer, renderWaterfall };
}

/** Get formatted waterfall text for clipboard export. */
export function getWaterfallClipboardLines(): string[] {
  const lines: string[] = [];
  const entries = getTimingEntries();

  for (const timingEntry of entries) {
    const milliseconds = timingEntry.endMs - timingEntry.startMs;
    const durationText = milliseconds < 1000 ? milliseconds + 'ms' : (milliseconds / 1000).toFixed(1) + 's';
    lines.push(
      timingEntry.label.padEnd(22) + durationText.padStart(8) + '  [' + timingEntry.status + ']'
      + (timingEntry.detail ? '  ' + timingEntry.detail : ''),
    );
  }

  lines.push('Total: ' + (getTimingSinceLoadMs() / 1000).toFixed(1) + 's');
  return lines;
}

// ── Skeletons ──

function renderWaterfallSkeletons(waterfallBody: HTMLElement): void {
  waterfallBody.innerHTML = '';

  for (let i = 0; i < 4; i++) {
    const skelRow = document.createElement('div');
    skelRow.style.cssText = 'display:flex;align-items:center;gap:4px;height:16px;';
    const skelLabel = createSkeletonBar({ width: (50 + i * 12) + 'px', height: '8px' });
    const skelBar = createSkeletonBar({ width: (60 + i * 20) + 'px', height: '10px' });
    skelBar.style.flex = '1';
    skelBar.style.maxWidth = (60 + i * 20) + 'px';
    skelRow.appendChild(skelLabel);
    skelRow.appendChild(skelBar);
    waterfallBody.appendChild(skelRow);
  }
}

// ── Entry Rendering ──

function renderWaterfallEntries(
  waterfallBody: HTMLElement,
  entries: ReturnType<typeof getTimingEntries>,
  totalMs: number,
): void {
  let maxEnd = 0;

  for (const entry of entries) {
    const isLarger = entry.endMs > maxEnd;
    if (isLarger) {
      maxEnd = entry.endMs;
    }
  }

  const isMaxTooSmall = maxEnd < 100;
  if (isMaxTooSmall) {
    maxEnd = 100;
  }

  waterfallBody.innerHTML = '';

  for (const [entryIndex, entry] of entries.entries()) {
    const row = buildWaterfallRow(entry, maxEnd, entryIndex);
    waterfallBody.appendChild(row);
  }

  const totalRow = document.createElement('div');
  totalRow.style.cssText = CSS_FONT_SIZE_9PX_COLOR + cPanelFgDim + ';text-align:right;margin-top:2px;border-top:1px solid rgba(255,255,255,0.08);padding-top:2px;';
  const isUnderOneSecond = totalMs < 1000;
  totalRow.textContent = 'Total: ' + (isUnderOneSecond ? totalMs + 'ms' : (totalMs / 1000).toFixed(1) + 's');
  waterfallBody.appendChild(totalRow);
}

function buildWaterfallRow(
  entry: { label: string; detail?: string; startMs: number; endMs: number; status: string },
  maxEnd: number,
  index: number,
): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:4px;height:16px;opacity:0;transition:opacity 0.35s ease-in;';
  setTimeout(function () { row.style.opacity = '1'; }, 60 * index);

  const label = document.createElement('span');
  label.style.cssText = CSS_FONT_SIZE_9PX_COLOR + cPanelFgDim + ';min-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
  label.textContent = entry.label;
  label.title = entry.detail || '';

  const barTrack = document.createElement('div');
  barTrack.style.cssText = 'flex:1;height:10px;background:rgba(255,255,255,0.05);border-radius:2px;position:relative;overflow:hidden;';

  const barFill = document.createElement('div');
  const leftPct = (entry.startMs / maxEnd * 100).toFixed(1);
  const widthPct = Math.max(((entry.endMs - entry.startMs) / maxEnd * 100), 1).toFixed(1);
  const color = STATUS_COLORS[entry.status] || '#60a5fa';
  barFill.style.cssText = 'position:absolute;top:0;bottom:0;left:' + leftPct + '%;width:' + widthPct + '%;background:' + color + ';border-radius:2px;opacity:0.8;';

  const isPending = entry.status === 'pending';
  if (isPending) {
    barFill.style.animation = 'pulse 1.5s ease-in-out infinite';
  }

  barTrack.appendChild(barFill);

  const durationMs = entry.endMs - entry.startMs;
  const dur = document.createElement('span');
  dur.style.cssText = CSS_FONT_SIZE_9PX_COLOR + color + ';min-width:36px;text-align:right;white-space:nowrap;';
  const isUnderOneSecond = durationMs < 1000;
  dur.textContent = isUnderOneSecond ? durationMs + 'ms' : (durationMs / 1000).toFixed(1) + 's';

  row.appendChild(label);
  row.appendChild(barTrack);
  row.appendChild(dur);

  return row;
}
