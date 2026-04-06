/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Menu Helper Functions
 * Step 03b: Extracted from createUI() closure
 *
 * Pure DOM builder functions for dropdown menu items and submenus.
 */

import {
  cSeparator, cPanelBg, cPrimary,
  lDropdownRadius, lDropdownShadow,
} from '../shared-state';

/** Context holding closure-scoped menu references */
export interface MenuCtx {
  menuBtnStyle: string;
  menuDropdown: HTMLElement;
}

export function createMenuItem(ctx: MenuCtx, icon: string, label: string, title: string, onclick: () => void): HTMLElement {
  const item = document.createElement('button');
  item.style.cssText = ctx.menuBtnStyle;
  item.title = title || label;
  item.innerHTML = '<span style="font-size:12px;width:18px;text-align:center;">' + icon + '</span><span>' + label + '</span>';
  item.onmouseover = function() { item.style.background = 'rgba(139,92,246,0.2)'; };
  item.onmouseout = function() { item.style.background = 'transparent'; };
  item.onclick = function(e) {
    e.stopPropagation();
    ctx.menuDropdown.style.display = 'none';
    onclick();
  };
  return item;
}

export function createMenuSep(): HTMLElement {
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:' + cSeparator + ';margin:3px 8px;opacity:0.4;';
  return sep;
}

export function createSubmenu(ctx: MenuCtx, icon: string, label: string): { el: HTMLElement; panel: HTMLElement } {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:relative;';
  const subPanel = document.createElement('div');

  // Delayed hide to bridge the gap between trigger and body-appended subPanel.
  // Without this, moving the mouse from trigger → subPanel crosses empty space
  // and triggers mouseout, closing the panel before the user can reach it.
  // See: spec/02-app-issues/ (submenu hover gap)
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function showSub() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    var tRect = trigger.getBoundingClientRect();
    subPanel.style.top = tRect.top + 'px';
    subPanel.style.left = tRect.right + 'px';
    subPanel.style.display = 'block';
  }

  function scheduleSub() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    hideTimer = setTimeout(function() { subPanel.style.display = 'none'; }, 150);
  }

  const trigger = document.createElement('button');
  trigger.style.cssText = ctx.menuBtnStyle + 'justify-content:space-between;';
  trigger.innerHTML = '<span style="display:flex;align-items:center;gap:4px;"><span style="font-size:12px;width:18px;text-align:center;">' + icon + '</span><span>' + label + '</span></span><span style="font-size:10px;opacity:0.6;">▸</span>';
  trigger.onmouseover = function() {
    trigger.style.background = 'rgba(139,92,246,0.2)';
    showSub();
  };
  trigger.onmouseout = function() { trigger.style.background = 'transparent'; };
  trigger.onclick = function(e) { e.stopPropagation(); subPanel.style.display = subPanel.style.display === 'none' ? 'block' : 'none'; };

  subPanel.setAttribute('data-marco-submenu', label);
  subPanel.style.cssText = 'display:none;position:fixed;min-width:170px;background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:' + lDropdownRadius + ';z-index:100004;box-shadow:' + lDropdownShadow + ';padding:4px 0;';

  // Keep subPanel open while mouse is over it
  subPanel.onmouseover = function() { showSub(); };
  subPanel.onmouseout = function() { scheduleSub(); };

  wrapper.onmouseover = function() { showSub(); };
  wrapper.onmouseout = function() { scheduleSub(); };

  wrapper.appendChild(trigger);
  document.body.appendChild(subPanel);

  return { el: wrapper, panel: subPanel };
}
