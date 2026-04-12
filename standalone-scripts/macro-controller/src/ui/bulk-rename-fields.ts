/**
 * MacroLoop Controller — Bulk Rename Field Builders
 *
 * DOM helper functions for the bulk rename dialog:
 * input rows, template row, start number inputs, token row, and ETA formatting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import {
  cPanelBg,
  cPrimary,
  cPrimaryLight,
  cPrimaryLighter,
  cPrimaryBgA,
  cPrimaryBorderA,
  cInputBg,
  cInputBorder,
  cInputFg,
} from '../shared-state';
import { log } from '../logging';
import { showToast } from '../toast';
import {
  resolveToken,
  refreshBearerTokenFromBestSource,
  getLastTokenSource,
} from '../auth';

const CSS_BORDER_RADIUS_3PX_BACKGROUND = ';border-radius:3px;background:';

// ── Types ──

export interface InputRowResult {
  row: HTMLElement;
  input: HTMLInputElement;
  cb: HTMLInputElement | null;
}

export interface PresetRowResult {
  row: HTMLElement;
  select: HTMLSelectElement;
  deleteBtn: HTMLButtonElement;
  saveBtn: HTMLButtonElement;
}

// ── Preset Row ──

// eslint-disable-next-line max-lines-per-function -- DOM builder with select, save, delete buttons
export function buildPresetRow(
  presetNames: string[],
  activePresetName: string,
  onSwitch: (name: string) => void,
  onNew: () => void,
  onDelete: (name: string) => void,
  onSave: () => void,
): PresetRowResult {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid rgba(124,58,237,0.15);';

  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:9px;color:#94a3b8;min-width:40px;';
  lbl.textContent = 'Preset';
  row.appendChild(lbl);

  const select = document.createElement('select');
  select.id = 'rename-preset-select';
  select.style.cssText = 'flex:1;padding:3px 5px;border:1px solid ' + cInputBorder + CSS_BORDER_RADIUS_3PX_BACKGROUND + cInputBg + ';color:' + cInputFg + ';font-size:10px;outline:none;font-family:monospace;cursor:pointer;';

  for (const name of presetNames) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === activePresetName) { opt.selected = true; }
    select.appendChild(opt);
  }
  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '+ New...';
  newOpt.style.color = '#22d3ee';
  select.appendChild(newOpt);

  select.onchange = function () {
    if (select.value === '__new__') {
      onNew();
      // Reset to previous selection if new was cancelled
      if (select.value === '__new__') {
        select.value = activePresetName;
      }
    } else {
      onSwitch(select.value);
    }
  };
  row.appendChild(select);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾';
  saveBtn.title = 'Save preset';
  saveBtn.style.cssText = 'padding:2px 6px;background:' + cPrimaryBgA + ';color:' + cPrimaryLighter + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;font-size:10px;cursor:pointer;';
  saveBtn.onclick = function () { onSave(); };
  row.appendChild(saveBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑';
  deleteBtn.title = 'Delete preset';
  deleteBtn.style.cssText = 'padding:2px 6px;background:rgba(239,68,68,0.15);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:3px;font-size:10px;cursor:pointer;';
  deleteBtn.onclick = function () { onDelete(select.value); };
  row.appendChild(deleteBtn);

  return { row, select, deleteBtn: deleteBtn as HTMLButtonElement, saveBtn: saveBtn as HTMLButtonElement };
}

// ── ETA Formatting ──

export function formatEta(ms: number): string {
  if (ms < 1000) {
    return ms + 'ms';
  }
  const secs = Math.ceil(ms / 1000);
  if (secs < 60) {
    return secs + 's';
  }
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  return mins + 'm ' + (remSecs > 0 ? remSecs + 's' : '');
}

// ── Input Row ──

export function buildInputRow(
  label: string,
  inputId: string,
  placeholder: string,
  withCheckbox: boolean,
): InputRowResult {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  let cb: HTMLInputElement | null = null;
  if (withCheckbox) {
    cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = inputId + '-cb';
    cb.style.cssText = 'width:12px;height:12px;accent-color:' + cPrimaryLight + ';';
    row.appendChild(cb);
  }
  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:9px;color:#94a3b8;min-width:40px;';
  lbl.textContent = label;
  row.appendChild(lbl);
  const input = document.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.placeholder = placeholder;
  input.style.cssText = 'flex:1;padding:3px 5px;border:1px solid ' + cInputBorder + CSS_BORDER_RADIUS_3PX_BACKGROUND + cInputBg + ';color:' + cInputFg + ';font-size:10px;outline:none;font-family:monospace;';
  row.appendChild(input);
  return { row, input, cb };
}

// ── Template Row ──

export function buildTemplateRow(): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:9px;color:#94a3b8;min-width:52px;';
  lbl.textContent = 'Template';
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'rename-template';
  input.placeholder = 'e.g. Exp $$$$$ D3  or  P## or  Item***';
  input.style.cssText = 'flex:1;padding:3px 5px;border:1px solid ' + cInputBorder + CSS_BORDER_RADIUS_3PX_BACKGROUND + cInputBg + ';color:' + cInputFg + ';font-size:10px;outline:none;font-family:monospace;';
  row.appendChild(lbl);
  row.appendChild(input);
  return { row, input };
}

// ── Start Number Input (returns HTML string) ──

export function buildStartNumInput(
  symbol: string,
  id: string,
  value: number,
  color: string,
): string {
  return '<label style="display:flex;align-items:center;gap:3px;font-size:9px;color:' + color + ';">' + symbol + ' <input type="number" id="' + id + '" value="' + value + '" min="0" style="width:50px;padding:2px 4px;border:1px solid ' + cPrimary + CSS_BORDER_RADIUS_3PX_BACKGROUND + cPanelBg + ';color:' + color + ';font-size:9px;font-family:monospace;"></label>';
}

// ── Token Row ──

export function buildTokenRow(): HTMLElement {
  const tokenRow = document.createElement('div');
  tokenRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:8px;';
  const tokenLabel = document.createElement('span');
  tokenLabel.style.cssText = 'font-size:8px;color:#64748b;';
  tokenLabel.textContent = 'Auth: ' + (getLastTokenSource() || 'none');
  tokenLabel.id = 'rename-auth-label';
  const tokenRefreshBtn = document.createElement('button');
  tokenRefreshBtn.textContent = '🔄 Refresh Token';
  tokenRefreshBtn.style.cssText = 'padding:2px 6px;background:' + cPrimaryBgA + ';color:' + cPrimaryLighter + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:3px;font-size:8px;cursor:pointer;';
  tokenRefreshBtn.onclick = function () {
    (tokenRefreshBtn as HTMLButtonElement).disabled = true;
    tokenRefreshBtn.style.opacity = '0.7';
    refreshBearerTokenFromBestSource(function (token: string, source: string) {
      if (token) {
        log('[Rename] Token refreshed via ' + source + ': ' + token.substring(0, 12) + '...', 'success');
        showToast('Token refreshed via ' + source, 'success');
      } else {
        log('[Rename] Token refresh failed (bridge + cookie fallback)', 'warn');
        showToast('No session token found — login may be required', 'warn');
      }
      resolveToken();
      const lbl = document.getElementById('rename-auth-label');
      if (lbl) {
        lbl.textContent = 'Auth: ' + getLastTokenSource();
      }
      (tokenRefreshBtn as HTMLButtonElement).disabled = false;
      tokenRefreshBtn.style.opacity = '1';
    });
  };
  tokenRow.appendChild(tokenLabel);
  tokenRow.appendChild(tokenRefreshBtn);
  return tokenRow;
}
