/**
 * MacroLoop Controller — Collapsible Section
 *
 * Reusable collapsible section with localStorage persistence.
 * Extracted from sections.ts during Phase 5 module splitting.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { cPanelBorder, cSectionBg, cSectionHeader, cSectionToggle } from '../shared-state';
import type { CollapsibleSectionOpts } from '../types';

export interface CollapsibleResult {
  section: HTMLElement;
  header: HTMLElement;
  toggle: HTMLElement;
  titleEl: HTMLElement;
  body: HTMLElement;
}

/** Create a collapsible section with localStorage-persisted expand/collapse state. */
export function createCollapsibleSection(
  title: string,
  storageKey: string,
  _opts?: CollapsibleSectionOpts,
): CollapsibleResult {
  const section = document.createElement('div');
  section.style.cssText = 'padding:4px 6px;background:' + cSectionBg + ';border:1px solid ' + cPanelBorder + ';border-radius:4px;';

  const header = buildSectionHeader();
  const toggle = buildToggleIndicator();
  const titleEl = buildTitleElement(title);

  header.appendChild(toggle);
  header.appendChild(titleEl);

  const body = document.createElement('div');
  body.style.cssText = 'margin-top:4px;';

  const isCollapsed = readCollapsedState(storageKey);
  body.style.display = isCollapsed ? 'none' : '';
  toggle.textContent = isCollapsed ? '[+]' : '[-]';

  header.onclick = function () {
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    toggle.textContent = isHidden ? '[-]' : '[+]';
    persistCollapsedState(storageKey, isHidden);
  };

  section.appendChild(header);
  section.appendChild(body);

  return { section, header, toggle, titleEl, body };
}

function buildSectionHeader(): HTMLElement {
  const header = document.createElement('div');
  header.style.cssText = 'display:flex;align-items:center;cursor:pointer;user-select:none;padding:2px 4px;border-radius:3px;transition:background-color 150ms ease;';
  header.onmouseenter = function () { header.style.backgroundColor = 'rgba(255,255,255,0.06)'; };
  header.onmouseleave = function () { header.style.backgroundColor = ''; };
  return header;
}

function buildToggleIndicator(): HTMLElement {
  const toggle = document.createElement('span');
  toggle.style.cssText = 'font-size:10px;color:' + cSectionToggle + ';margin-right:4px;';
  return toggle;
}

function buildTitleElement(title: string): HTMLElement {
  const titleEl = document.createElement('span');
  titleEl.style.cssText = 'font-size:10px;color:' + cSectionHeader + ';font-weight:bold;';
  titleEl.textContent = title;
  return titleEl;
}

function readCollapsedState(storageKey: string): boolean {
  let savedState: string | null = null;
  try { savedState = localStorage.getItem(storageKey); } catch (_e: unknown) { console.debug('[RiseupAsia] [readCollapsedState] localStorage read failed for ' + storageKey); }
  const hasSavedState = savedState !== null;
  return hasSavedState ? savedState === 'collapsed' : true;
}

function persistCollapsedState(storageKey: string, isExpanding: boolean): void {
  try { localStorage.setItem(storageKey, isExpanding ? 'expanded' : 'collapsed'); } catch (_e: unknown) { console.debug('[RiseupAsia] [persistCollapsedState] localStorage write failed for ' + storageKey); }
}
