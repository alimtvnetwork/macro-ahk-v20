/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Prompt Utility Functions
 * Step 03d: Extracted from createUI() closure
 *
 * Pure/near-pure functions for prompt loading, parsing, pasting.
 */

import { log } from '../logging';

// ── Prompt entry normalization ──
export function normalizePromptEntries(entries: any[]): any[] {
  if (!Array.isArray(entries)) return [];
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const p = entries[i] || {};
    const name = typeof p.name === 'string' ? p.name : '';
    const text = typeof p.text === 'string' ? p.text : '';
    if (name && text) {
      const entry: any = { name: name, text: text };
      if (p.category) entry.category = p.category;
      if (p.isDefault) entry.isDefault = true;
      if (p.isFavorite) entry.isFavorite = true;
      if (typeof p.order === 'number') entry.order = p.order;
      out.push(entry);
    }
  }
  return out;
}

// ── JSON parse with truncation recovery ──
export function parseWithRecovery(content: string): any {
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
      } catch (_) {}
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
export function findPasteTarget(promptsCfg: any, getByXPath: (xpath: string) => Element | null): Element | null {
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
  for (let s = 0; s < selectors.length; s++) {
    el = document.querySelector(selectors[s]);
    if (el) return el;
  }
  return null;
}

// ── Paste/append text into editor element ──
export function pasteIntoEditor(text: string, promptsCfg: any, getByXPath: (xpath: string) => Element | null): boolean {
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

    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      const currentVal = (target as HTMLInputElement).value || '';
      const newVal = currentVal + (currentVal.length > 0 ? '\n' : '') + text;
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value') ||
                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (nativeSetter && nativeSetter.set) {
        nativeSetter.set.call(target, newVal);
      } else {
        (target as HTMLInputElement).value = newVal;
      }
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      // For contenteditable (ProseMirror/React editors):
      // Using execCommand or clipboard API to work with the editor's internal state
      // instead of raw DOM manipulation which breaks on subsequent injections.

      // Strategy 1: Move cursor to end, then use execCommand('insertText')
      const sel = window.getSelection();
      if (sel) {
        // Move cursor to end of content
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }

      // Add newline if editor already has content
      const existingText = (target.textContent || '').trim();
      const prefix = existingText.length > 0 ? '\n' : '';
      const fullText = prefix + text;

      // Try execCommand first — works with most contenteditable editors
      const execResult = document.execCommand('insertText', false, fullText);

      if (!execResult) {
        // Fallback: use DataTransfer + paste event simulation
        log('Prompt inject: execCommand failed, trying DataTransfer paste', 'warn');
        const dt = new DataTransfer();
        dt.setData('text/plain', fullText);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        const pasteHandled = target.dispatchEvent(pasteEvent);

        if (!pasteHandled) {
          // Last resort: clipboard write + programmatic paste
          log('Prompt inject: DataTransfer paste also failed, using clipboard API', 'warn');
          navigator.clipboard.writeText(text).then(function() {
            showPasteToast('📋 Copied to clipboard — paste with Ctrl+V', false);
          });
          return false;
        }
      }

      // Dispatch input event so React/ProseMirror picks up the change
      target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: fullText }));
    }

    log('Prompt injected: "' + text.substring(0, 80) + '..." (' + text.length + ' total chars)', 'success');
    showPasteToast('✓ Prompt injected (' + text.length + ' chars)', false);
    return true;
  } catch (e: any) {
    log('Prompt inject failed: ' + (e?.message || e), 'error');
    navigator.clipboard.writeText(text).then(function() {
      showPasteToast('⚠️ Inject failed — copied to clipboard, try Ctrl+V', true);
    }).catch(function() {
      showPasteToast('❌ Inject and clipboard both failed', true);
    });
    return false;
  }
}
