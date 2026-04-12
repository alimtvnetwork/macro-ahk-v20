 
import { toErrorMessage , logError } from './error-utils';
/**
 * MacroLoop Controller — XPath Utilities Module
 * Step 2e: Extracted from macro-looping.ts
 *
 * Contains: getByXPath, getAllByXPath, findElement, ML_ELEMENTS,
 * reactClick, hasXPathUtils init, XPathUtils logger setup.
 */

import { CONFIG } from './shared-state';
import { log, logSub } from './logging';
import { domCache } from './dom-cache';

const LOG_XPATHUTILS = '[XPathUtils.';

// ============================================
// XPathUtils integration
// ============================================
// CQ11: Singleton for XPathUtils detection state
class XPathUtilsState {
  private _detected = typeof window.XPathUtils !== 'undefined';

  get detected(): boolean {
    return this._detected;
  }

  set detected(v: boolean) {
    this._detected = v;
  }
}

const xpathUtilsState = new XPathUtilsState();
export const hasXPathUtils = (): boolean => xpathUtilsState.detected;

export function initXPathUtils(): void {
  if (hasXPathUtils()) {
    window.XPathUtils.setLogger(
      function(fn: string, msg: string) { log(LOG_XPATHUTILS + fn + '] ' + msg, 'check'); },
      function(_fn: string, msg: string) { logSub(msg); },
      function(fn: string, msg: string) { log(LOG_XPATHUTILS + fn + '] WARN: ' + msg, 'warn'); }
    );
    log('XPathUtils v' + window.XPathUtils.version + ' detected — using shared utilities', 'success');
  } else {
    log('XPathUtils NOT found — using inline fallback', 'warn');
    setTimeout(function() {
      if (typeof window.XPathUtils !== 'undefined' && !hasXPathUtils()) {
        xpathUtilsState.detected = true;
        window.XPathUtils.setLogger(
          function(fn: string, msg: string) { log(LOG_XPATHUTILS + fn + '] ' + msg, 'check'); },
          function(_fn: string, msg: string) { logSub(msg); },
          function(fn: string, msg: string) { log(LOG_XPATHUTILS + fn + '] WARN: ' + msg, 'warn'); }
        );
        log('XPathUtils detected on deferred retry (500ms)', 'success');
      }
    }, 500);
  }
}

// ============================================
// React-compatible click: delegates to XPathUtils if available
// ============================================
export function reactClick(el: Element, callerXpath?: string): void {
  if (hasXPathUtils()) {
    window.XPathUtils.reactClick(el, callerXpath);
    return;
  }
  // Fallback: inline implementation
  const fn = 'reactClick';
  const tag = '<' + el.tagName.toLowerCase() + ((el as HTMLElement).id ? '#' + (el as HTMLElement).id : '') + '>';
  log('[' + fn + '] Clicking ' + tag + ' | XPath: ' + (callerXpath || '(no xpath)') + ' [FALLBACK]', 'check');
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const opts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy };
  const pointerOpts = { view: window, bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: cx, clientY: cy, pointerId: 1, pointerType: 'mouse' as const, isPrimary: true };
  el.dispatchEvent(new PointerEvent('pointerdown', pointerOpts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', pointerOpts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  logSub('All 5 events dispatched [FALLBACK]');
}

// ============================================
// Core XPath Functions
// ============================================
export function getByXPath(xpath: string): Node | null {
  if (!xpath) {
    logError('XPath', 'is empty or undefined');
    return null;
  }
  return domCache.getByXPath(xpath);
}

export function getAllByXPath(xpath: string): Node[] {
  if (!xpath) {
    logError('XPath', 'is empty or undefined');
    return [];
  }
  return domCache.getAllByXPath(xpath);
}

// ============================================
// S-001: Generic findElement() with multi-method fallback
// descriptor: { name, xpath, textMatch, tag, selector, role, ariaLabel }
// ============================================
interface ElementDescriptor {
  name?: string;
  xpath?: string;
  textMatch?: string | string[];
  tag?: string;
  selector?: string | string[];
  role?: string;
  ariaLabel?: string | string[];
}

/** Try finding element via configured XPath. */
function findViaXPath(desc: ElementDescriptor): Element | null {
  if (!desc.xpath) {
    return null;
  }
  log('  Method 1 (XPath) for ' + desc.name + ': ' + desc.xpath, 'check');
  const result = getByXPath(desc.xpath);
  if (result) {
    log('  ' + desc.name + ' FOUND via XPath: ' + desc.xpath, 'success');
    return result as Element;
  }
  log('  ' + desc.name + ' XPath failed: ' + desc.xpath + ' — trying fallbacks', 'warn');
  return null;
}

/** Try finding element via text content matching. */
function findViaTextScan(desc: ElementDescriptor): Element | null {
  if (!desc.textMatch) {
    return null;
  }
  const tag = desc.tag || 'button';
  const texts = Array.isArray(desc.textMatch) ? desc.textMatch : [desc.textMatch];
  log('  Method 2 (text scan): looking in <' + tag + '> for ' + JSON.stringify(texts), 'check');
  for (const tagEl of document.querySelectorAll(tag)) {
    const elText = (tagEl.textContent || '').trim();
    for (const text of texts) {
      if (elText === text || elText.indexOf(text) !== -1) {
        log('  ' + desc.name + ' FOUND via text: "' + elText.substring(0, 40) + '"', 'success');
        return tagEl;
      }
    }
  }
  return null;
}

/** Try finding element via CSS selectors. */
function findViaCssSelector(desc: ElementDescriptor): Element | null {
  if (!desc.selector) {
    return null;
  }
  const selectors = Array.isArray(desc.selector) ? desc.selector : [desc.selector];
  log('  Method 3 (CSS selector): trying ' + selectors.length + ' selectors', 'check');
  for (const [sIdx, sel] of selectors.entries()) {
    try {
      log('    [' + (sIdx + 1) + '/' + selectors.length + '] querySelector("' + sel + '")', 'check');
      const result = document.querySelector(sel);
      if (result) {
        log('    ✅ FOUND via selector [' + (sIdx + 1) + ']: ' + sel + ' → <' + result.tagName.toLowerCase() + '>', 'success');
        return result;
      }
      log('    ❌ Not found', 'warn');
    } catch (e: unknown) {
      logError('unknown', '    ❌ Invalid selector: ' + toErrorMessage(e));
    }
  }
  return null;
}

/** Try finding element via ARIA label attributes. */
function findViaAriaLabel(desc: ElementDescriptor): Element | null {
  if (!desc.ariaLabel) {
    return null;
  }
  const labels = Array.isArray(desc.ariaLabel) ? desc.ariaLabel : [desc.ariaLabel];
  for (const label of labels) {
    try {
      const result = document.querySelector('[aria-label*="' + label + '" i], [title*="' + label + '" i]');
      if (result) {
        log('  ' + desc.name + ' FOUND via ARIA: ' + label, 'success');
        return result;
      }
    } catch (_e) { logSub('ARIA label query skipped for "' + label + '": ' + toErrorMessage(_e), 1); }
  }
  return null;
}

/** Try finding element via role attribute. */
function findViaRole(desc: ElementDescriptor): Element | null {
  if (!desc.role) {
    return null;
  }
  const result = document.querySelector('[role="' + desc.role + '"]');
  if (result) {
    log('  ' + desc.name + ' FOUND via role: ' + desc.role, 'success');
    return result;
  }
  return null;
}

/** Try finding element via ARIA labels or role attributes. */
function findViaAria(desc: ElementDescriptor): Element | null {
  if (!desc.ariaLabel && !desc.role) {
    return null;
  }
  log('  Method 4 (ARIA/role)', 'check');
  return findViaAriaLabel(desc) || findViaRole(desc);
}

export function findElement(descriptor: ElementDescriptor): Element | null {
  const name = descriptor.name || 'unknown';
  log('findElement: Searching for "' + name + '"', 'check');

  return findViaXPath(descriptor)
    || findViaTextScan(descriptor)
    || findViaCssSelector(descriptor)
    || findViaAria(descriptor)
    || (logError('unknown', '  All methods failed for "\' + name + \'"'), null);
}

// ============================================
// S-001: Element descriptors for MacroLoop XPath elements
// ============================================
export const ML_ELEMENTS: Record<string, ElementDescriptor> = {
  PROJECT_BUTTON: {
    name: 'Project Button',
    xpath: CONFIG.PROJECT_BUTTON_XPATH,
    selector: ['nav button', 'nav div button', '[data-testid="project-button"]'],
    ariaLabel: ['project', 'Project'],
    tag: 'button'
  },
  PROGRESS: {
    name: 'Progress Bar',
    xpath: CONFIG.PROGRESS_XPATH,
    selector: ['[role="progressbar"]', '.progress-bar', '[class*="progress"]'],
    role: 'progressbar'
  },
  // S-012: CSS fallback selectors for workspace name inside project dialog
  WORKSPACE_NAME: {
    name: 'Workspace Name (in dialog)',
    xpath: CONFIG.WORKSPACE_XPATH,
    selector: [
      '[data-testid="workspace-name"]',
      '[data-testid*="workspace"]',
      '[class*="workspace"] span',
      '[class*="workspace"] p',
      'nav [class*="sidebar"] span',
      '[role="dialog"] h2',
      '[role="dialog"] h3',
      '[role="dialog"] [class*="title"]',
      '[data-state="open"] [class*="workspace"]',
      '[data-radix-popper-content-wrapper] span'
    ],
    tag: 'span'
  }
};

// ============================================
// Update XPath from UI (Step 2f: moved from macro-looping.ts)
// ============================================
export function updateProjectButtonXPath(newXPath: string): boolean {
  if (newXPath && newXPath.trim()) {
    CONFIG.PROJECT_BUTTON_XPATH = newXPath.trim();
    ML_ELEMENTS.PROJECT_BUTTON.xpath = newXPath.trim();
    log('Project Button XPath updated to: ' + CONFIG.PROJECT_BUTTON_XPATH, 'success');
    return true;
  }
  return false;
}

export function updateProgressXPath(newXPath: string): boolean {
  if (newXPath && newXPath.trim()) {
    CONFIG.PROGRESS_XPATH = newXPath.trim();
    ML_ELEMENTS.PROGRESS.xpath = newXPath.trim();
    log('Progress Bar XPath updated to: ' + CONFIG.PROGRESS_XPATH, 'success');
    return true;
  }
  return false;
}

export function updateWorkspaceXPath(newXPath: string): boolean {
  if (newXPath && newXPath.trim()) {
    CONFIG.WORKSPACE_XPATH = newXPath.trim();
    log('Workspace XPath updated to: ' + CONFIG.WORKSPACE_XPATH, 'success');
    return true;
  }
  return false;
}
