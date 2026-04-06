/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Auto-Attach File Automation
 * Step 03f: Extracted from createUI() closure
 *
 * Resolves auto-attach config, clicks XPath elements, inserts text,
 * and runs file-attachment groups with configurable delays.
 */

import { log } from '../logging';

/** Mutable state */
export const autoAttachState = {
  running: false,
};

export interface AutoAttachConfig {
  plusXPath: string;
  attachXPath: string;
  chatBoxXPath: string;
  timing: { stepDelayMs?: number; preDialogDelayMs?: number; preFileDialogDelayMs?: number };
  groups: any[];
}

/**
 * Resolve auto-attach config from window.__MARCO_CONFIG__ or fallback.
 */
export function resolveAutoAttachConfig(autoAttachCfg?: any): AutoAttachConfig {
  const rawCfg = (window.__MARCO_CONFIG__ || {}).autoAttach;
  const liveCfg = (rawCfg && typeof rawCfg === 'object')
    ? rawCfg
    : ((autoAttachCfg && typeof autoAttachCfg === 'object') ? autoAttachCfg : {});

  const timing = (liveCfg.timing && typeof liveCfg.timing === 'object') ? liveCfg.timing : {};
  const groups = Array.isArray(liveCfg.groups) ? liveCfg.groups : [];

  return {
    plusXPath: liveCfg.plusButtonXPath || '',
    attachXPath: liveCfg.attachButtonXPath || '',
    chatBoxXPath: liveCfg.chatBoxXPath || '',
    timing: timing,
    groups: groups,
  };
}

function autoAttachDelay(ms: number) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

export function clickByXPath(xpath: string, label: string): boolean {
  if (!xpath) { log('Auto-Attach: No XPath for ' + label, 'warn'); return false; }
  let el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (!el) { log('Auto-Attach: Element not found for ' + label + ': ' + xpath, 'warn'); return false; }
  (el as HTMLElement).click();
  log('Auto-Attach: Clicked ' + label, 'info');
  return true;
}

export function insertTextIntoElement(xpath: string, text: string, label: string): boolean {
  if (!xpath || !text) return false;
  let el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as HTMLElement;
  if (!el) { log('Auto-Attach: Element not found for ' + label + ': ' + xpath, 'warn'); return false; }
  el.focus();
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') ||
                                Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    if (nativeInputValueSetter && nativeInputValueSetter.set) {
      nativeInputValueSetter.set.call(el, text);
    } else {
      (el as HTMLInputElement).value = text;
    }
  } else {
    el.textContent = text;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  log('Auto-Attach: Inserted text into ' + label + ' (' + text.length + ' chars)', 'success');
  return true;
}

export async function runAutoAttachGroup(
  group: any,
  autoAttachCfg: any,
  showToast: (msg: string, type: string) => void,
) {
  const aaCfg = resolveAutoAttachConfig(autoAttachCfg);
  const stepDelay = aaCfg.timing.stepDelayMs || 200;
  const preDialogDelay = aaCfg.timing.preDialogDelayMs || 800;
  const preFileDialogDelay = aaCfg.timing.preFileDialogDelayMs || 1000;
  const files = group.files || [];

  if (autoAttachState.running) {
    showToast('Auto-Attach already running', 'warn');
    return;
  }

  autoAttachState.running = true;
  log('Auto-Attach: Starting group "' + group.name + '" with ' + files.length + ' file(s)', 'info');

  if (group.prompt && aaCfg.chatBoxXPath) {
    insertTextIntoElement(aaCfg.chatBoxXPath, group.prompt, 'chatBox');
    await autoAttachDelay(stepDelay);
  }

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i];
    log('Auto-Attach: Attaching file ' + (i + 1) + '/' + files.length + ': ' + filePath, 'info');
    showToast('Attaching file ' + (i + 1) + '/' + files.length + '...', 'info');

    if (!clickByXPath(aaCfg.plusXPath, 'Plus button')) {
      log('Auto-Attach: Failed to click Plus button — aborting', 'error');
      break;
    }
    await autoAttachDelay(preDialogDelay);

    if (!clickByXPath(aaCfg.attachXPath, 'Attach button')) {
      log('Auto-Attach: Failed to click Attach button — aborting', 'error');
      break;
    }
    await autoAttachDelay(preFileDialogDelay);

    try {
      await navigator.clipboard.writeText('AUTO_ATTACH_FILE:' + filePath);
      log('Auto-Attach: File path written to clipboard for AHK: ' + filePath, 'info');
    } catch (e: any) {
      log('Auto-Attach: Clipboard write failed: ' + (e?.message || e), 'warn');
    }

    await autoAttachDelay(preFileDialogDelay + 500);
    await autoAttachDelay(stepDelay);
  }

  autoAttachState.running = false;
  log('Auto-Attach: Group "' + group.name + '" complete (' + files.length + ' files)', 'success');
  showToast('Auto-Attach complete: ' + group.name + ' (' + files.length + ' files)', 'success');
}
