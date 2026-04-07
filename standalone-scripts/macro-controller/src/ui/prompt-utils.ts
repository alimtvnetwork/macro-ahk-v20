 
import { toErrorMessage } from '../error-utils';
/**
 * MacroLoop Controller — Prompt Utility Functions
 * Step 03d: Extracted from createUI() closure
 *
 * Pure/near-pure functions for prompt loading, parsing, pasting.
 */

import { log, logSub } from '../logging';
import type { PromptEntry, PromptsCfg } from '../types';

// ── Prompt entry normalization ──
export function normalizePromptEntries(entries: Partial<PromptEntry & { order?: number }>[]): PromptEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: PromptEntry[] = [];
  let droppedCount = 0;
  for (const p of entries) {
    const raw = p || {};
    const name = typeof raw.name === 'string' ? raw.name : '';
    const text = typeof raw.text === 'string' ? raw.text : '';

    if (name && text) {
      const entry: PromptEntry = { name, text };

      if (raw.id) { entry.id = raw.id; }
      if (raw.slug) { entry.slug = raw.slug; }
      if (raw.category) { entry.category = raw.category; }
      if (raw.isFavorite) { entry.isFavorite = true; }
      if (raw.isDefault !== undefined) { entry.isDefault = raw.isDefault; }

      out.push(entry);
    } else {
      droppedCount++;
      console.warn('[normalizePromptEntries] ⚠️ Dropped entry — name="' + (name || '(empty)') + '", text.length=' + text.length + ', id=' + (raw.id || '—') + ', slug=' + (raw.slug || '—') + '. Reason: ' + (!name ? 'missing name' : 'missing text'));
    }
  }
  if (droppedCount > 0) {
    console.warn('[normalizePromptEntries] ⚠️ Dropped ' + droppedCount + '/' + entries.length + ' entries due to missing name or text');
  }
  return out;
}

/** Normalize excessive blank lines: collapse 3+ consecutive newlines to 2 (one blank line).
 *  Also normalizes \r\n to \n and collapses lines containing only whitespace. */
export function normalizeNewlines(text: string): string {
  return text
    .replace(/\r\n/g, '\n')                    // Normalize Windows line endings
    .replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n')     // Collapse blank-ish lines (whitespace-only between newlines)
    .replace(/\n{3,}/g, '\n\n')                  // Collapse 3+ consecutive newlines to 2
    .trim();
}

// ── JSON parse with truncation recovery ──
export function parseWithRecovery(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch (e) {
    const trimmed = String(content || '').trim();
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace > 0) {
      let repaired = trimmed.substring(0, lastBrace + 1);
      if (trimmed.charAt(0) === '[') {
        repaired += ']';
      }
      try {
        return JSON.parse(repaired);
      } catch (_repairErr) { logSub('JSON repair also failed: ' + (_repairErr instanceof Error ? _repairErr.message : String(_repairErr)), 1); }
    }
    throw e;
  }
}

// ── Paste toast (lightweight, no dependency on main toast system) ──
export function showPasteToast(message: string, isError: boolean): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'padding:10px 20px;border-radius:8px;font-size:13px;z-index:1000000;' +
    'color:#fff;font-family:system-ui,sans-serif;pointer-events:none;' +
    'transition:opacity .3s;opacity:0;' +
    (isError ? 'background:#dc2626;' : 'background:#16a34a;');
  document.body.appendChild(toast);
  requestAnimationFrame(function() { toast.style.opacity = '1'; });
  setTimeout(function() {
    toast.style.opacity = '0';
    setTimeout(function() { toast.remove(); }, 300);
  }, isError ? 4000 : 2500);
}

// ── Find editor paste target via XPath/CSS selectors ──
export function findPasteTarget(promptsCfg: PromptsCfg, getByXPath: (xpath: string) => Element | null): Element | null {
  let el: Element | null = null;
  if (promptsCfg.pasteTargetXPath) {
    el = getByXPath(promptsCfg.pasteTargetXPath);
    if (el) return el;
  }
  if (promptsCfg.pasteTargetSelector) {
    el = document.querySelector(promptsCfg.pasteTargetSelector);
    if (el) return el;
  }
  const selectors = [
    'form textarea[placeholder]',
    'div[contenteditable="true"]',
    'textarea.ProseMirror',
    '[data-testid="prompt-input"]'
  ];
  for (const sel of selectors) {
    el = document.querySelector(sel);

    if (el) { return el; }
  }
  return null;
}

// ── Paste/append text into editor element ──
/** Paste into a textarea or input element using native setter. */
function pasteIntoTextarea(target: HTMLElement, text: string): void {
  const currentVal = (target as HTMLInputElement).value || '';
  const newVal = currentVal + (currentVal.length > 0 ? '\n' : '') + text;
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') ||
                     Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  if (nativeSetter?.set) {
    nativeSetter.set.call(target, newVal);
  } else {
    (target as HTMLInputElement).value = newVal;
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Paste into a contenteditable element using execCommand or DataTransfer fallback. */
function pasteIntoContentEditable(target: HTMLElement, text: string): boolean {
  // Move cursor to end
  const sel = window.getSelection();
  if (sel) {
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const existingText = (target.textContent || '').trim();
  const prefix = existingText.length > 0 ? '\n' : '';
  const fullText = prefix + text;

  const execResult = document.execCommand('insertText', false, fullText);
  if (execResult) {
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: fullText }));
    return true;
  }

  // Fallback: DataTransfer paste
  log('Prompt inject: execCommand failed, trying DataTransfer paste', 'warn');
  const dt = new DataTransfer();
  dt.setData('text/plain', fullText);
  const pasteEvent = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  const pasteHandled = target.dispatchEvent(pasteEvent);

  if (pasteHandled) {
    target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: fullText }));
    return true;
  }

  // Last resort: clipboard
  log('Prompt inject: DataTransfer paste also failed, using clipboard API', 'warn');
  navigator.clipboard.writeText(text).then(function() {
    showPasteToast('📋 Copied to clipboard — paste with Ctrl+V', false);
  });
  return false;
}

export function pasteIntoEditor(rawText: string, promptsCfg: PromptsCfg, getByXPath: (xpath: string) => Element | null): boolean {
  const text = normalizeNewlines(rawText);
  const target = findPasteTarget(promptsCfg, getByXPath) as HTMLElement | null;
  if (!target) {
    log('Prompt paste: No editor target found — copying to clipboard instead', 'warn');
    navigator.clipboard.writeText(text).then(function() {
      log('Prompt copied to clipboard (no paste target)', 'success');
      showPasteToast('📋 Copied to clipboard — paste manually with Ctrl+V', false);
    }).catch(function() {
      showPasteToast('❌ Could not paste or copy — editor target not found', true);
    });
    return false;
  }

  log('Prompt inject: target found (' + target.tagName + ', contentEditable=' + target.contentEditable + '), text length=' + text.length, 'info');

  try {
    target.focus();
    const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';

    if (isTextInput) {
      pasteIntoTextarea(target, text);
    } else {
      const ok = pasteIntoContentEditable(target, text);
      if (!ok) return false;
    }

    log('Prompt injected: "' + text.substring(0, 80) + '..." (' + text.length + ' total chars)', 'success');
    showPasteToast('✓ Prompt injected (' + text.length + ' chars)', false);
    return true;
  } catch (e: unknown) {
    const errMsg = toErrorMessage(e);
    log('Prompt inject failed: ' + errMsg, 'error');
    navigator.clipboard.writeText(text).then(function() {
      showPasteToast('⚠️ Inject failed — copied to clipboard, try Ctrl+V', true);
    }).catch(function() {
      showPasteToast('❌ Inject and clipboard both failed', true);
    });
    return false;
  }
}
