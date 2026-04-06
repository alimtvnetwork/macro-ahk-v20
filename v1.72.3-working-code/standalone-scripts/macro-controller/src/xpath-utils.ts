/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — XPath Utilities Module
 * Step 2e: Extracted from macro-looping.ts
 *
 * Contains: getByXPath, getAllByXPath, findElement, ML_ELEMENTS,
 * reactClick, hasXPathUtils init, XPathUtils logger setup.
 */

import { CONFIG } from './shared-state';
import { log, logSub } from './logging';

// ============================================
// XPathUtils integration
// ============================================
export let hasXPathUtils = typeof window.XPathUtils !== 'undefined';

export function initXPathUtils(): void {
  if (hasXPathUtils) {
    window.XPathUtils.setLogger(
      function(fn: string, msg: string) { log('[XPathUtils.' + fn + '] ' + msg, 'check'); },
      function(_fn: string, msg: string) { logSub(msg); },
      function(fn: string, msg: string) { log('[XPathUtils.' + fn + '] WARN: ' + msg, 'warn'); }
    );
    log('XPathUtils v' + window.XPathUtils.version + ' detected — using shared utilities', 'success');
  } else {
    log('XPathUtils NOT found — using inline fallback', 'warn');
    setTimeout(function() {
      if (typeof window.XPathUtils !== 'undefined' && !hasXPathUtils) {
        hasXPathUtils = true;
        window.XPathUtils.setLogger(
          function(fn: string, msg: string) { log('[XPathUtils.' + fn + '] ' + msg, 'check'); },
          function(_fn: string, msg: string) { logSub(msg); },
          function(fn: string, msg: string) { log('[XPathUtils.' + fn + '] WARN: ' + msg, 'warn'); }
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
  if (hasXPathUtils) {
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
    log('XPath is empty or undefined', 'error');
    return null;
  }
  try {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  } catch (e: any) {
    log('XPath evaluation error: ' + (e?.message || e), 'error');
    log('Problematic XPath: ' + xpath, 'error');
    return null;
  }
}

export function getAllByXPath(xpath: string): Node[] {
  if (!xpath) {
    log('XPath is empty or undefined', 'error');
    return [];
  }
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const nodes: Node[] = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      const item = result.snapshotItem(i);
      if (item) nodes.push(item);
    }
    return nodes;
  } catch (e: any) {
    log('XPath evaluation error: ' + (e?.message || e), 'error');
    log('Problematic XPath: ' + xpath, 'error');
    return [];
  }
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

export function findElement(descriptor: ElementDescriptor): Element | null {
  const name = descriptor.name || 'unknown';
  log('findElement: Searching for "' + name + '"', 'check');

  // Method 1: Configured XPath
  if (descriptor.xpath) {
    log('  Method 1 (XPath) for ' + name + ': ' + descriptor.xpath, 'check');
    const xpathResult = getByXPath(descriptor.xpath);
    if (xpathResult) {
      log('  ' + name + ' FOUND via XPath: ' + descriptor.xpath, 'success');
      return xpathResult as Element;
    }
    log('  ' + name + ' XPath failed: ' + descriptor.xpath + ' — trying fallbacks', 'warn');
  }

  // Method 2: Text-based scan
  if (descriptor.textMatch) {
    const tag = descriptor.tag || 'button';
    const texts = Array.isArray(descriptor.textMatch) ? descriptor.textMatch : [descriptor.textMatch];
    log('  Method 2 (text scan): looking in <' + tag + '> for ' + JSON.stringify(texts), 'check');
    const allTags = document.querySelectorAll(tag);
    for (let t = 0; t < allTags.length; t++) {
      const elText = (allTags[t].textContent || '').trim();
      for (let m = 0; m < texts.length; m++) {
        if (elText === texts[m] || elText.indexOf(texts[m]) !== -1) {
          log('  ' + name + ' FOUND via text: "' + elText.substring(0, 40) + '"', 'success');
          return allTags[t];
        }
      }
    }
  }

  // Method 3: CSS selector
  if (descriptor.selector) {
    const selectors = Array.isArray(descriptor.selector) ? descriptor.selector : [descriptor.selector];
    log('  Method 3 (CSS selector): trying ' + selectors.length + ' selectors', 'check');
    for (let s = 0; s < selectors.length; s++) {
      try {
        log('    [' + (s+1) + '/' + selectors.length + '] querySelector("' + selectors[s] + '")', 'check');
        const sResult = document.querySelector(selectors[s]);
        if (sResult) {
          log('    ✅ FOUND via selector [' + (s+1) + ']: ' + selectors[s] + ' → <' + sResult.tagName.toLowerCase() + '>', 'success');
          return sResult;
        }
        log('    ❌ Not found', 'warn');
      } catch (e: any) {
        log('    ❌ Invalid selector: ' + (e?.message || e), 'error');
      }
    }
  }

  // Method 4: ARIA/role attributes
  if (descriptor.ariaLabel || descriptor.role) {
    log('  Method 4 (ARIA/role)', 'check');
    if (descriptor.ariaLabel) {
      const ariaLabels = Array.isArray(descriptor.ariaLabel) ? descriptor.ariaLabel : [descriptor.ariaLabel];
      for (let a = 0; a < ariaLabels.length; a++) {
        try {
          const ariaResult = document.querySelector('[aria-label*="' + ariaLabels[a] + '" i], [title*="' + ariaLabels[a] + '" i]');
          if (ariaResult) {
            log('  ' + name + ' FOUND via ARIA: ' + ariaLabels[a], 'success');
            return ariaResult;
          }
        } catch (_e) { /* skip */ }
      }
    }
    if (descriptor.role) {
      const roleResult = document.querySelector('[role="' + descriptor.role + '"]');
      if (roleResult) {
        log('  ' + name + ' FOUND via role: ' + descriptor.role, 'success');
        return roleResult;
      }
    }
  }

  log('  All methods failed for "' + name + '"', 'error');
  return null;
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
