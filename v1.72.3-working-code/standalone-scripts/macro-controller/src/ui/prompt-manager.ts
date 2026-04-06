/**
 * MacroLoop Controller — Prompt Manager
 * Step 2e: Extracted from macro-looping.ts
 *
 * Contains: DEFAULT_PROMPTS, loadPromptsFromJson, getPromptsConfig,
 * renderPromptsDropdown, sendToExtension, openPromptCreationModal
 *
 * Uses a PromptContext object passed from createUI() to access DOM elements.
 * v1.59: Added IndexedDB cache-first loading with background revalidation.
 */

import { log } from '../logging';
import {
  cPanelBg, cPanelBgAlt, cPanelFg, cPanelFgDim, cPanelFgMuted,
  cPrimary, cPrimaryLight, cPrimaryLighter, cPrimaryBorderA, cPrimaryHL,
  cBtnMenuHover,
  lDropdownRadius, lDropdownShadow,
  tFontTiny,
} from '../shared-state';
import {
  normalizePromptEntries, showPasteToast, pasteIntoEditor,
} from './prompt-utils';
import {
  readPromptCache, writePromptCache, clearPromptCache, computePromptHash,
} from './prompt-cache';
import type { CachedPromptEntry } from './prompt-cache';
import {
  loadTaskNextSettings, setupTaskNextCancelHandler,
  runTaskNextLoop, openTaskNextSettingsModal,
} from './task-next-ui';
import { showToast } from '../toast';
import { resolveToken, refreshBearerTokenFromBestSource, LAST_TOKEN_SOURCE } from '../auth';
import { getByXPath } from '../xpath-utils';

// ============================================
// Context type for DOM refs from createUI()
// ============================================
export interface PromptContext {
  promptsDropdown: HTMLElement;
}

// ============================================
// Fallback prompts
// ============================================
export const DEFAULT_PROMPTS = [
  { name: 'Start Prompt', text: 'Write a readme.txt text file with 3 words with no context at all "let\'s start now {date:dd-MMM-YYYY} {time:12 hr clock format exact time now for malaysia}"' },
  { name: 'Start Prompt v2', text: 'Write a readme.txt text file with 3 words with no context at all "let\'s start now {date:dd-MMM-YYYY} {time:12 hr clock format exact time now for malaysia}"\n\nUh, try to write a file to the Git system. I\'m not sure what you are doing. I\'m asking you to write the text file in the read.txt file, readme.txt file with the date and time, and you are not doing it. You are not doing a Git, uh, update. Are you stupid?' },
  { name: 'Rejog the Memory v1', text: 'Read and synthesize existing repository context from the memory folder and the full specification set, then produce a reliability risk report before any implementation work begins. Do not implement anything. Only produce a report and specification-side artifacts for memory, suggestions, and planning.' },
  { name: 'Unified AI Prompt v4', text: 'Read and synthesize existing repository context from the memory folder and the full specification set. Follow the Required Execution Order: scan repo, read memory, read specs, reconstruct context, produce reliability report, propose corrections, update memory, update plan, ask user which task to implement next.' },
  { name: 'Issues Tracking', text: 'Do not implement any code changes. Update specifications and documentation only. Enforce a strict workflow so the same mistakes do not repeat, and ensure every fix is recorded in a standardized issue write-up file and reflected in memory.' },
  { name: 'Unit Test Failing', text: 'Fix failing tests: 1) Check code, 2) Check actual method implementation, 3) Check logical implementation of the test, 4) Check test case, 5) Fix logically either the implementation or the test. Document at /spec/05-failing-tests/{seq}-failing-test-name.md with root cause and solution.' },
  { name: 'Audit Spec v1', text: 'Perform a comprehensive audit of every specification file. Score each spec on Completeness, Consistency, Implementation Alignment, Clarity, Maintainability, and Test Coverage (1-10 scale). Produce a scorecard, detailed findings for specs below 8.0, cross-spec dependency map, and priority fix list. Write report to .memory/audit/spec-audit-report.md.' },
  { name: 'Minor Bump', text: 'Bump all Minor versions for all', category: 'versioning' },
  { name: 'Major Bump', text: 'Bump all Major versions for all', category: 'versioning' },
  { name: 'Patch Bump', text: 'Bump all Patch versions for all', category: 'versioning' }
];

export const DEFAULT_PASTE_XPATH = '/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[3]/div/div/div/div';

// ============================================
// Module state
// ============================================
let _loadedJsonPrompts: Array<Record<string, unknown>> | null = null;
let _jsonPromptsLoading = false;
let _promptCategoryFilter: string | null = null;

/** Invalidate prompt cache (e.g. after save/delete) */
export function invalidatePromptCache(): void {
  _loadedJsonPrompts = null;
  clearPromptCache().then(function() {
    log('[PromptCache] Cache cleared (invalidated)', 'info');
  });
}

/** Check if prompts are already loaded in memory — see spec/02-app-issues/64-prompts-loading-when-cached.md */
export function isPromptsCached(): boolean {
  return _loadedJsonPrompts !== null && _loadedJsonPrompts.length > 0;
}

// ============================================
// Extension messaging
// ============================================
declare const chrome: any;

/**
 * Send a message to the extension via chrome.runtime or window.postMessage relay.
 */
export function sendToExtension(type: string, payload: any, callback?: Function): void {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      const msg = Object.assign({ type: type }, payload);
      chrome.runtime.sendMessage(msg, function(resp: any) {
        if (chrome.runtime.lastError) {
          log('Extension message error: ' + (chrome.runtime.lastError.message || ''), 'warn');
          if (callback) callback({ isOk: false, errorMessage: chrome.runtime.lastError.message || 'runtime error' });
          return;
        }
        if (callback) callback(resp);
      });
      return;
    } catch(e) { /* fall through to relay */ }
  }

  // Relay via window.postMessage (content script bridge)
  const requestId = 'pr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  let settled = false;

  function finish(resp: any): void {
    if (settled) return;
    settled = true;
    window.removeEventListener('message', onResponse);
    clearTimeout(timeout);
    if (callback) callback(resp);
  }

  function onResponse(event: MessageEvent): void {
    if (event.data && event.data.source === 'marco-extension' && event.data.requestId === requestId) {
      finish(event.data.payload);
    }
  }

  const timeout = setTimeout(function() {
    log('Extension relay timed out for ' + type, 'warn');
    finish({ isOk: false, errorMessage: 'Extension relay timeout' });
  }, 5000);

  window.addEventListener('message', onResponse);
  window.postMessage({ source: 'marco-controller', requestId: requestId, ...(payload || {}), type: type }, '*');
}

// ============================================
// Prompt loading
// ============================================

function tryLoadByMessage(type: string, onDone: Function): void {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ type: type }, function(response: any) {
        const runtimeErr = chrome.runtime && chrome.runtime.lastError;
        if (runtimeErr) { onDone(null); return; }
        const prompts = normalizePromptEntries(response && response.prompts);
        onDone(prompts.length > 0 ? prompts : null);
      });
      return;
    } catch(_) { /* fall through to relay */ }
  }
  // Relay fallback
  const relayId = 'pl-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
  let relayTimeout: ReturnType<typeof setTimeout> | null = null;
  function onRelayResponse(event: MessageEvent) {
    if (event.data && event.data.source === 'marco-extension' && event.data.requestId === relayId) {
      window.removeEventListener('message', onRelayResponse);
      if (relayTimeout) clearTimeout(relayTimeout);
      const payload = event.data.payload || {};
      const prompts = normalizePromptEntries(payload.prompts);
      onDone(prompts.length > 0 ? prompts : null);
    }
  }
  window.addEventListener('message', onRelayResponse);
  window.postMessage({ source: 'marco-controller', type: type, requestId: relayId }, '*');
  relayTimeout = setTimeout(function() {
    window.removeEventListener('message', onRelayResponse);
    log('Prompt load via relay timed out for ' + type, 'warn');
    onDone(null);
  }, 5000);
}

/**
 * Load prompts with cache-first, background-revalidate pattern (v1.59).
 *
 * Flow:
 * 1. If in-memory cache exists → use immediately
 * 2. Check IndexedDB cache → show instantly if available
 * 3. Background: fetch from extension bridge → compare hash → update if changed
 * 4. Fallback: __MARCO_PROMPTS__ preamble → hardcoded DEFAULT_PROMPTS
 */

// Track active revalidation context for re-render
let _revalidateCtx: { ctx: any; taskNextDeps: any } | null = null;

export function setRevalidateContext(ctx: any, taskNextDeps: any): void {
  _revalidateCtx = { ctx, taskNextDeps };
}

export function loadPromptsFromJson(callback?: Function): void {
  function finish(prompts: any, source: string) {
    _jsonPromptsLoading = false;
    if (prompts && prompts.length > 0) {
      _loadedJsonPrompts = prompts;
      log('Loaded ' + prompts.length + ' prompts from ' + source, 'success');
      // Write to IndexedDB cache in background
      writePromptCache(prompts as CachedPromptEntry[]).then(function() {
        log('[PromptCache] Cached ' + prompts.length + ' prompts to IndexedDB', 'info');
      });
      callback!(_loadedJsonPrompts);
      return;
    }
    callback!(null);
  }

  // 1. In-memory cache
  if (_loadedJsonPrompts) { callback!(_loadedJsonPrompts); return; }
  if (_jsonPromptsLoading) { callback!(null); return; }
  _jsonPromptsLoading = true;

  // 2. Try IndexedDB cache first (instant)
  readPromptCache().then(function(cached) {
    if (cached && cached.entries && cached.entries.length > 0) {
      _loadedJsonPrompts = cached.entries as any;
      _jsonPromptsLoading = false;
      log('[PromptCache] Loaded ' + cached.entries.length + ' prompts from IndexedDB cache (age=' + Math.round((Date.now() - cached.fetchedAt) / 1000) + 's)', 'success');
      callback!(_loadedJsonPrompts);

      // 3. Background revalidation — fetch from extension and compare
      _backgroundRevalidate(cached.hash);
      return;
    }

    // No cache — fetch directly from extension
    log('[PromptCache] No IndexedDB cache — fetching from extension...', 'info');
    _fetchFromExtension(function(prompts: any) {
      if (prompts && prompts.length > 0) {
        finish(prompts, 'extension bridge GET_PROMPTS (SQLite)');
        return;
      }
      if (window.__MARCO_PROMPTS__ && Array.isArray(window.__MARCO_PROMPTS__) && window.__MARCO_PROMPTS__.length > 0) {
        finish(normalizePromptEntries(window.__MARCO_PROMPTS__), '__MARCO_PROMPTS__ preamble (fallback)');
        return;
      }
      log('No prompts from bridge or preamble — using hardcoded defaults', 'warn');
      finish(DEFAULT_PROMPTS, 'hardcoded DEFAULT_PROMPTS');
    });
  }).catch(function() {
    // IndexedDB unavailable — fall through to direct fetch
    _fetchFromExtension(function(prompts: any) {
      if (prompts && prompts.length > 0) {
        finish(prompts, 'extension bridge GET_PROMPTS (direct)');
        return;
      }
      log('No prompts from bridge — using hardcoded defaults', 'warn');
      finish(DEFAULT_PROMPTS, 'hardcoded DEFAULT_PROMPTS');
    });
  });
}

function _fetchFromExtension(onDone: (prompts: any) => void): void {
  tryLoadByMessage('GET_PROMPTS', function(bridgePrompts: any) {
    onDone(bridgePrompts);
  });
}

function _backgroundRevalidate(cachedHash: string): void {
  _fetchFromExtension(function(freshPrompts: any) {
    if (!freshPrompts || freshPrompts.length === 0) {
      log('[PromptCache] Background revalidation: no data from extension (using cache)', 'info');
      return;
    }
    const freshHash = computePromptHash(freshPrompts as CachedPromptEntry[]);
    if (freshHash === cachedHash) {
      log('[PromptCache] Background revalidation: cache is fresh ✅', 'info');
      return;
    }
    // Data changed — update cache and re-render
    log('[PromptCache] Background revalidation: data changed — updating cache and re-rendering', 'info');
    _loadedJsonPrompts = freshPrompts;
    writePromptCache(freshPrompts as CachedPromptEntry[]).then(function() {
      log('[PromptCache] Updated IndexedDB cache with fresh data (' + freshPrompts.length + ' prompts)', 'success');
    });
    // Re-render dropdown if it's currently visible
    if (_revalidateCtx) {
      try {
        renderPromptsDropdown(_revalidateCtx.ctx, _revalidateCtx.taskNextDeps);
        log('[PromptCache] Dropdown re-rendered with fresh data', 'info');
      } catch (e) {
        // Dropdown may have been closed — ignore
      }
    }
  });
}

/**
 * Resolve prompts config from multiple sources.
 */
export function getPromptsConfig(): any {
  const promptsCfg = (window.__MARCO_CONFIG__ || {} as any).prompts || {};
  let entries = promptsCfg.entries || promptsCfg.prompts || [];
  if (!Array.isArray(entries) && typeof entries === 'object') {
    entries = entries.entries || [];
  }

  if (_loadedJsonPrompts && Array.isArray(_loadedJsonPrompts) && _loadedJsonPrompts.length > 0) {
    const merged = _loadedJsonPrompts.slice();
    const seen: Record<string, boolean> = {};
    for (let i = 0; i < merged.length; i++) {
      seen[((merged[i] as Record<string, unknown>).name as string || '').toLowerCase()] = true;
    }
    if (Array.isArray(entries)) {
      for (let j = 0; j < entries.length; j++) {
        const p = entries[j] || {};
        const n = typeof p.name === 'string' ? p.name : '';
        const t = typeof p.text === 'string' ? p.text : '';
        const key = n.toLowerCase();
        if (n && t && !seen[key]) {
          const extra: Record<string, any> = { name: n, text: t };
          if (p.id) extra.id = p.id;
          if (p.category) extra.category = p.category;
          if (p.isDefault) extra.isDefault = true;
          merged.push(extra);
          seen[key] = true;
        }
      }
    }
    entries = merged;
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    entries = DEFAULT_PROMPTS;
  }

  return {
    entries: entries,
    pasteTargetXPath: promptsCfg.pasteTargetXPath || (promptsCfg.pasteTarget && promptsCfg.pasteTarget.xpath) || DEFAULT_PASTE_XPATH,
    pasteTargetSelector: promptsCfg.pasteTargetSelector || (promptsCfg.pasteTarget && promptsCfg.pasteTarget.selector) || ''
  };
}

// ============================================
// Prompt dropdown rendering
// ============================================

/**
 * Render the prompts dropdown with categories, Task Next submenu, and prompt items.
 * @param ctx - PromptContext with DOM refs from createUI()
 * @param taskNextDeps - Dependencies for Task Next UI
 */
export function renderPromptsDropdown(ctx: PromptContext, taskNextDeps: any): void {
  const promptsDropdown = ctx.promptsDropdown;
  const promptsCfg = getPromptsConfig();
  let entries = promptsCfg.entries;
  if (!entries.length) entries = [{ name: 'No prompts configured', text: '' }];
  promptsDropdown.innerHTML = '';

  // Collect unique categories
  const categories: string[] = [];
  const catSeen: Record<string, boolean> = {};
  for (let c = 0; c < entries.length; c++) {
    const cat = ((entries[c] as any).category || '').trim();
    if (cat && !catSeen[cat.toLowerCase()]) {
      categories.push(cat);
      catSeen[cat.toLowerCase()] = true;
    }
  }

  // Header
  const header = document.createElement('div');
  header.style.cssText = 'padding:4px 8px;font-size:9px;color:' + cPrimaryLight + ';border-bottom:1px solid #7c3aed;';
  header.textContent = '📋 Click to paste · 📋 icon to copy';
  promptsDropdown.appendChild(header);

  // ── Task Next sub-menu ──
  const taskNextItem = document.createElement('div');
  taskNextItem.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:pointer;font-size:11px;color:' + cPrimaryLight + ';border-bottom:1px solid rgba(124,58,237,0.3);font-weight:600;';
  taskNextItem.textContent = '⏭ Task Next';
  const taskNextArrow = document.createElement('span');
  taskNextArrow.textContent = '▸';
  taskNextArrow.style.cssText = 'font-size:10px;margin-left:4px;';
  taskNextItem.appendChild(taskNextArrow);

  const taskNextSub = document.createElement('div');
  taskNextSub.setAttribute('data-task-next-sub', '1');
  taskNextSub.style.cssText = 'display:none;position:fixed;min-width:180px;background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:' + lDropdownRadius + ';z-index:100010;box-shadow:' + lDropdownShadow + ';';
  document.body.appendChild(taskNextSub);
  taskNextSub.onmouseover = function() { taskNextSub.style.display = 'block'; };
  taskNextSub.onmouseout = function() { taskNextSub.style.display = 'none'; };

  function positionTaskNextSub() {
    const rect = taskNextItem.getBoundingClientRect();
    const subW = 180;
    if (rect.right + subW > window.innerWidth) {
      taskNextSub.style.left = (rect.left - subW) + 'px';
    } else {
      taskNextSub.style.left = rect.right + 'px';
    }
    taskNextSub.style.top = rect.top + 'px';
  }

  taskNextItem.onmouseover = function() { (this as HTMLElement).style.background = cBtnMenuHover; positionTaskNextSub(); taskNextSub.style.display = 'block'; };
  taskNextItem.onmouseout = function() {
    const self = this as unknown as HTMLElement;
    setTimeout(function() {
      if (!taskNextSub.matches(':hover') && !self.matches(':hover')) {
        self.style.background = 'transparent';
        taskNextSub.style.display = 'none';
      }
    }, 100);
  };

  const presetCounts = [1, 2, 3, 5, 7, 10, 12, 15, 20, 30, 40];
  for (let pc = 0; pc < presetCounts.length; pc++) {
    (function(n: number) {
      const subItem = document.createElement('div');
      subItem.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:10px;color:' + cPanelFg + ';';
      subItem.textContent = 'Next ' + n + ' task' + (n > 1 ? 's' : '');
      subItem.onmouseover = function() { (this as HTMLElement).style.background = cBtnMenuHover; };
      subItem.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };
      subItem.onclick = function(e: Event) {
        e.stopPropagation();
        promptsDropdown.style.display = 'none';
        taskNextSub.style.display = 'none';
        runTaskNextLoop(taskNextDeps, n);
      };
      taskNextSub.appendChild(subItem);
    })(presetCounts[pc]);
  }

  // Custom count input
  const customRow = document.createElement('div');
  customRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 12px;border-top:1px solid rgba(124,58,237,0.2);';
  const customLabel = document.createElement('span');
  customLabel.textContent = 'Custom:';
  customLabel.style.cssText = 'font-size:10px;color:' + cPrimaryLight + ';';
  customRow.appendChild(customLabel);
  const customInput = document.createElement('input');
  customInput.type = 'number'; customInput.min = '1'; customInput.max = '999'; customInput.placeholder = '#';
  customInput.style.cssText = 'width:50px;padding:3px 5px;background:rgba(0,0,0,0.3);border:1px solid rgba(124,58,237,0.3);border-radius:4px;color:' + cPanelFg + ';font-size:10px;';
  customInput.onclick = function(e: Event) { e.stopPropagation(); };
  customRow.appendChild(customInput);
  const goBtn = document.createElement('span');
  goBtn.textContent = '▶'; goBtn.title = 'Go';
  goBtn.style.cssText = 'cursor:pointer;font-size:11px;color:' + cPrimary + ';';
  goBtn.onclick = function(e: Event) {
    e.stopPropagation();
    const n = parseInt(customInput.value);
    if (!n || n < 1 || n > 999) { showPasteToast('⚠️ Enter 1–999', true); return; }
    promptsDropdown.style.display = 'none';
    taskNextSub.style.display = 'none';
    runTaskNextLoop(taskNextDeps, n);
  };
  customInput.onkeydown = function(e: KeyboardEvent) { if (e.key === 'Enter') { e.stopPropagation(); goBtn.click(); } };
  customRow.appendChild(goBtn);
  taskNextSub.appendChild(customRow);

  // Settings button
  const settingsItem = document.createElement('div');
  settingsItem.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:10px;color:' + cPrimaryLight + ';border-top:1px solid rgba(124,58,237,0.2);';
  settingsItem.textContent = '⚙ Settings';
  settingsItem.onmouseover = function() { (this as HTMLElement).style.background = cBtnMenuHover; };
  settingsItem.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };
  settingsItem.onclick = function(e: Event) {
    e.stopPropagation();
    promptsDropdown.style.display = 'none';
    taskNextSub.style.display = 'none';
    openTaskNextSettingsModal(taskNextDeps);
  };
  taskNextSub.appendChild(settingsItem);
  promptsDropdown.appendChild(taskNextItem);

  // Category filter bar
  if (categories.length > 0) {
    const filterBar = document.createElement('div');
    filterBar.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;padding:6px 8px;border-bottom:1px solid rgba(124,58,237,0.2);';

    function makeFilterChip(label: string, value: string) {
      const chip = document.createElement('span');
      chip.textContent = label;
      const isActive = _promptCategoryFilter === value;
      chip.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:9px;cursor:pointer;transition:all .15s;' +
        (isActive ? 'background:' + cPrimary + ';color:#fff;' : 'background:' + cPrimaryHL + ';color:' + cPrimaryLight + ';');
      chip.onclick = function(e: Event) {
        e.stopPropagation();
        _promptCategoryFilter = isActive ? null : value;
        renderPromptsDropdown(ctx, taskNextDeps);
      };
      return chip;
    }

    filterBar.appendChild(makeFilterChip('All', ''));
    for (let f = 0; f < categories.length; f++) {
      filterBar.appendChild(makeFilterChip(categories[f], categories[f].toLowerCase()));
    }
    promptsDropdown.appendChild(filterBar);
  }

  // Filter entries by category
  let filtered = entries;
  if (_promptCategoryFilter) {
    filtered = [];
    for (let fi = 0; fi < entries.length; fi++) {
      if ((entries[fi].category || '').trim().toLowerCase() === _promptCategoryFilter) {
        filtered.push(entries[fi]);
      }
    }
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:12px 8px;text-align:center;color:' + cPanelFgDim + ';font-size:11px;';
      empty.textContent = 'No prompts in this category';
      promptsDropdown.appendChild(empty);
    }
  }

  for (let i = 0; i < filtered.length; i++) {
    (function(p: any, idx: number) {
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 8px;cursor:pointer;font-size:10px;color:#c9a8ef;border-bottom:1px solid rgba(124,58,237,0.15);';
      item.onmouseover = function() { (this as HTMLElement).style.background = cBtnMenuHover; };
      item.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };

      const badge = document.createElement('span');
      badge.textContent = String(idx + 1);
      badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:3px;background:' + cPrimary + ';color:' + cPanelFg + ';font-size:8px;font-weight:700;margin-right:6px;flex-shrink:0;';
      item.appendChild(badge);

      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      nameSpan.title = p.text || '';
      item.appendChild(nameSpan);

      const actions = document.createElement('span');
      actions.style.cssText = 'display:flex;align-items:center;gap:2px;margin-left:4px;flex-shrink:0;';

      if (p.text) {
        // Edit button
        const editIcon = document.createElement('span');
        editIcon.textContent = '✏️'; editIcon.title = 'Edit prompt';
        editIcon.style.cssText = 'cursor:pointer;font-size:10px;opacity:0.6;';
        editIcon.onmouseover = function() { (this as HTMLElement).style.opacity = '1'; };
        editIcon.onmouseout = function() { (this as HTMLElement).style.opacity = '0.6'; };
        editIcon.onclick = function(e: Event) {
          e.stopPropagation();
          promptsDropdown.style.display = 'none';
          openPromptCreationModal(ctx, taskNextDeps, { id: p.id, name: p.name, text: p.text, category: p.category, isDefault: p.isDefault });
        };
        actions.appendChild(editIcon);

        // Delete button
        if (!p.isDefault) {
          const delIcon = document.createElement('span');
          delIcon.textContent = '🗑️'; delIcon.title = 'Delete prompt';
          delIcon.style.cssText = 'cursor:pointer;font-size:10px;opacity:0.6;';
          delIcon.onmouseover = function() { (this as HTMLElement).style.opacity = '1'; };
          delIcon.onmouseout = function() { (this as HTMLElement).style.opacity = '0.6'; };
          delIcon.onclick = function(e: Event) {
            e.stopPropagation();
            if (!confirm('Delete prompt "' + p.name + '"?')) return;
            sendToExtension('DELETE_PROMPT', { promptId: p.id }, function(resp: Record<string, unknown>) {
              if (resp && resp.isOk) {
                log('Deleted prompt: ' + p.name, 'success');
                _loadedJsonPrompts = null;
                loadPromptsFromJson(function() { renderPromptsDropdown(ctx, taskNextDeps); });
              } else {
                log('Failed to delete prompt: ' + p.name, 'error');
              }
            });
          };
          actions.appendChild(delIcon);
        }

        // Copy button
        const copyIcon = document.createElement('span');
        copyIcon.textContent = '📋'; copyIcon.title = 'Copy to clipboard';
        copyIcon.style.cssText = 'cursor:pointer;font-size:11px;opacity:0.7;';
        copyIcon.onmouseover = function() { (this as HTMLElement).style.opacity = '1'; };
        copyIcon.onmouseout = function() { (this as HTMLElement).style.opacity = '0.7'; };
        copyIcon.onclick = function(e: Event) {
          e.stopPropagation();
          navigator.clipboard.writeText(p.text).then(function() {
            log('Prompt copied: ' + p.name, 'success');
            copyIcon.textContent = '✅';
            setTimeout(function() { copyIcon.textContent = '📋'; }, 1500);
          });
        };
        actions.appendChild(copyIcon);

        item.onclick = function(e: Event) {
          if (actions.contains(e.target as Node)) return;
          log('Prompt clicked: "' + p.name + '" (' + p.text.length + ' chars)', 'info');
          pasteIntoEditor(p.text, promptsCfg, getByXPath as any);
          promptsDropdown.style.display = 'none';
        };
      }
      item.appendChild(actions);
      promptsDropdown.appendChild(item);
    })(filtered[i], i);
  }

  // ➕ Add New Prompt button
  const addBtn = document.createElement('div');
  addBtn.style.cssText = 'display:flex;align-items:center;justify-content:center;padding:8px;cursor:pointer;font-size:11px;color:' + cPrimaryLight + ';border-top:1px solid rgba(124,58,237,0.3);';
  addBtn.textContent = '➕ Add New Prompt';
  addBtn.onmouseover = function() { (this as HTMLElement).style.background = 'rgba(139,92,246,0.2)'; };
  addBtn.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };
  addBtn.onclick = function(e: Event) {
    e.stopPropagation();
    promptsDropdown.style.display = 'none';
    openPromptCreationModal(ctx, taskNextDeps, undefined as any);
  };
  promptsDropdown.appendChild(addBtn);
}

// ============================================
// Prompt creation/edit modal
// ============================================

/**
 * Open the prompt creation/edit modal.
 * @param editPrompt — existing prompt object for editing (has .id)
 * @param prefillData — pre-fill data for new prompt (no .id, not edit mode)
 */
export function openPromptCreationModal(ctx: PromptContext, taskNextDeps: any, editPrompt: any, prefillData?: { name?: string; text?: string; category?: string }): void {
  let existing = document.getElementById('marco-prompt-modal');
  if (existing) existing.remove();

  const isEdit = !!(editPrompt && editPrompt.id);
  const initialData = isEdit ? editPrompt : (prefillData || {});
  const overlay = document.createElement('div');
  overlay.id = 'marco-prompt-modal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:1000010;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;';

  const modal = document.createElement('div');
  modal.style.cssText = 'background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:12px;width:520px;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.8);';

  // Header
  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid rgba(124,58,237,0.3);';
  const titleEl = document.createElement('span');
  titleEl.textContent = isEdit ? '✏️ Edit Prompt' : '➕ Add New Prompt';
  titleEl.style.cssText = 'font-size:15px;font-weight:600;color:' + cPanelFg + ';';
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:#9ca3af;font-size:18px;cursor:pointer;padding:0 4px;';
  closeBtn.onclick = function() { overlay.remove(); };
  headerEl.appendChild(titleEl);
  headerEl.appendChild(closeBtn);
  modal.appendChild(headerEl);

  // Body
  const body = document.createElement('div');
  body.style.cssText = 'padding:16px 20px;overflow-y:auto;flex:1;';

  // Title input
  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Prompt Title';
  titleLabel.style.cssText = 'display:block;font-size:11px;color:' + cPrimaryLight + ';margin-bottom:4px;font-weight:600;';
  body.appendChild(titleLabel);
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.placeholder = 'e.g. Code Review Prompt';
  titleInput.value = initialData.name || '';
  titleInput.style.cssText = 'width:100%;padding:8px 12px;background:' + cPanelBg + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:6px;color:' + cPanelFg + ';font-size:13px;margin-bottom:12px;outline:none;box-sizing:border-box;';
  titleInput.onfocus = function() { (this as HTMLElement).style.borderColor = cPrimary; };
  titleInput.onblur = function() { (this as HTMLElement).style.borderColor = 'rgba(124,58,237,0.4)'; };
  body.appendChild(titleInput);

  // Content textarea
  const contentLabel = document.createElement('label');
  contentLabel.textContent = 'Prompt Content (Markdown supported)';
  contentLabel.style.cssText = 'display:block;font-size:11px;color:' + cPrimaryLight + ';margin-bottom:4px;font-weight:600;';
  body.appendChild(contentLabel);
  const contentArea = document.createElement('textarea');
  contentArea.placeholder = 'Enter your prompt text here…\n\nSupports {{date}}, {{time}} variables.';
  contentArea.value = initialData.text || '';
  contentArea.style.cssText = 'width:100%;height:200px;padding:10px 12px;background:' + cPanelBg + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:6px;color:' + cPanelFg + ';font-size:12px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;resize:vertical;outline:none;box-sizing:border-box;line-height:1.5;';
  contentArea.onfocus = function() { (this as HTMLElement).style.borderColor = cPrimary; };
  contentArea.onblur = function() { (this as HTMLElement).style.borderColor = 'rgba(124,58,237,0.4)'; };
  body.appendChild(contentArea);

  // Character count
  const charCount = document.createElement('div');
  charCount.style.cssText = 'text-align:right;font-size:10px;color:' + cPanelFgDim + ';margin-top:2px;margin-bottom:8px;';
  charCount.textContent = '0 chars';
  contentArea.oninput = function() { charCount.textContent = contentArea.value.length + ' chars'; };
  if (initialData.text) charCount.textContent = contentArea.value.length + ' chars';
  body.appendChild(charCount);

  // Category dropdown with custom option
  const catLabel = document.createElement('label');
  catLabel.textContent = 'Category (optional)';
  catLabel.style.cssText = 'display:block;font-size:11px;color:' + cPrimaryLight + ';margin-bottom:4px;font-weight:600;';
  body.appendChild(catLabel);

  // Gather existing categories from loaded prompts
  const promptsCfg = getPromptsConfig();
  const existingEntries = promptsCfg.entries || [];
  const existingCats: string[] = [];
  const catSeen: Record<string, boolean> = {};
  for (let ci = 0; ci < existingEntries.length; ci++) {
    const ec = ((existingEntries[ci] as any).category || '').trim();
    if (ec && !catSeen[ec.toLowerCase()]) {
      existingCats.push(ec);
      catSeen[ec.toLowerCase()] = true;
    }
  }

  const catWrap = document.createElement('div');
  catWrap.style.cssText = 'position:relative;margin-bottom:12px;';

  const catSelect = document.createElement('select');
  catSelect.style.cssText = 'width:100%;padding:8px 12px;background:' + cPanelBg + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:6px;color:' + cPanelFg + ';font-size:13px;outline:none;box-sizing:border-box;appearance:auto;cursor:pointer;';
  catSelect.onfocus = function() { (this as HTMLElement).style.borderColor = cPrimary; };
  catSelect.onblur = function() { (this as HTMLElement).style.borderColor = 'rgba(124,58,237,0.4)'; };

  // Options: None, existing categories, Custom
  const noneOpt = document.createElement('option');
  noneOpt.value = '';
  noneOpt.textContent = '— No category —';
  catSelect.appendChild(noneOpt);

  for (let ci = 0; ci < existingCats.length; ci++) {
    const opt = document.createElement('option');
    opt.value = existingCats[ci];
    opt.textContent = existingCats[ci];
    catSelect.appendChild(opt);
  }

  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = '✏️ Custom category…';
  catSelect.appendChild(customOpt);

  // Custom input (hidden by default)
  const catCustomInput = document.createElement('input');
  catCustomInput.type = 'text';
  catCustomInput.placeholder = 'Type custom category name…';
  catCustomInput.style.cssText = 'display:none;width:100%;padding:8px 12px;background:' + cPanelBg + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:6px;color:' + cPanelFg + ';font-size:13px;outline:none;box-sizing:border-box;margin-top:6px;';
  catCustomInput.onfocus = function() { (this as HTMLElement).style.borderColor = cPrimary; };
  catCustomInput.onblur = function() { (this as HTMLElement).style.borderColor = 'rgba(124,58,237,0.4)'; };

  catSelect.onchange = function() {
    if (catSelect.value === '__custom__') {
      catCustomInput.style.display = 'block';
      catCustomInput.focus();
    } else {
      catCustomInput.style.display = 'none';
      catCustomInput.value = '';
    }
  };

  // Set initial value
  const initialCat = (initialData.category || '').trim();
  if (initialCat) {
    const matchIdx = existingCats.findIndex(function(c) { return c.toLowerCase() === initialCat.toLowerCase(); });
    if (matchIdx !== -1) {
      catSelect.value = existingCats[matchIdx];
    } else {
      catSelect.value = '__custom__';
      catCustomInput.style.display = 'block';
      catCustomInput.value = initialCat;
    }
  }

  catWrap.appendChild(catSelect);
  catWrap.appendChild(catCustomInput);
  body.appendChild(catWrap);

  // Helper to get the final category value
  function getSelectedCategory(): string {
    if (catSelect.value === '__custom__') return catCustomInput.value.trim();
    return catSelect.value;
  }

  // File drop zone
  const dropZone = document.createElement('div');
  dropZone.style.cssText = 'border:2px dashed ' + cPrimaryBorderA + ';border-radius:8px;padding:16px;text-align:center;color:' + cPanelFgDim + ';font-size:11px;margin-bottom:12px;transition:all .2s;cursor:pointer;';
  dropZone.innerHTML = '📁 Drop <b>.md</b>, <b>.txt</b>, or <b>.prompt</b> file here<br><span style="font-size:10px;color:#4b5563;">or click to browse</span>';
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = '.md,.txt,.prompt'; fileInput.style.display = 'none';
  dropZone.onclick = function() { fileInput.click(); };

  function handleFile(file: any) {
    if (!file) return;
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (!['md', 'txt', 'prompt'].includes(ext)) { showPasteToast('❌ Unsupported file type: .' + ext, true); return; }
    if (file.size > 50 * 1024) { showPasteToast('❌ File too large (max 50KB)', true); return; }
    const reader = new FileReader();
    reader.onload = function(e: ProgressEvent<FileReader>) {
      const content = e.target?.result as string;
      contentArea.value = content;
      charCount.textContent = content.length + ' chars';
      if (!titleInput.value.trim()) {
        titleInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      }
      dropZone.style.borderColor = '#16a34a';
      dropZone.innerHTML = '✅ Loaded: <b>' + file.name + '</b> (' + content.length + ' chars)';
      setTimeout(function() { dropZone.style.borderColor = 'rgba(124,58,237,0.3)'; }, 2000);
      log('File loaded into prompt editor: ' + file.name, 'success');
    };
    reader.readAsText(file);
  }

  fileInput.onchange = function() { handleFile(fileInput.files![0]); };
  dropZone.addEventListener('dragover', function(e: Event) { e.preventDefault(); e.stopPropagation(); (this as HTMLElement).style.borderColor = cPrimary; (this as HTMLElement).style.background = 'rgba(124,58,237,0.1)'; });
  dropZone.addEventListener('dragleave', function(e: Event) { e.preventDefault(); (this as HTMLElement).style.borderColor = 'rgba(124,58,237,0.3)'; (this as HTMLElement).style.background = 'transparent'; });
  dropZone.addEventListener('drop', function(e: DragEvent) {
    e.preventDefault(); e.stopPropagation();
    (this as HTMLElement).style.borderColor = 'rgba(124,58,237,0.3)'; (this as HTMLElement).style.background = 'transparent';
    if (e.dataTransfer && e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
  });
  body.appendChild(dropZone);
  body.appendChild(fileInput);

  // Variable reference
  const varToggle = document.createElement('div');
  varToggle.style.cssText = 'cursor:pointer;font-size:11px;color:' + cPrimaryLight + ';margin-bottom:4px;user-select:none;';
  varToggle.textContent = '▸ Template Variables';
  const varList = document.createElement('div');
  varList.style.cssText = 'display:none;padding:6px 10px;background:rgba(124,58,237,0.08);border-radius:6px;font-size:10px;color:#9ca3af;margin-bottom:12px;line-height:1.8;';
  varList.innerHTML = '<code style="color:#c4b5fd;">{{date}}</code> — current date<br><code style="color:#c4b5fd;">{{time}}</code> — current time<br><code style="color:#c4b5fd;">{{date:FORMAT}}</code> — e.g. dd-MMM-YYYY<br><code style="color:#c4b5fd;">{{time:FORMAT}}</code> — e.g. 12 hr clock';
  varToggle.onclick = function() {
    const isOpen = varList.style.display !== 'none';
    varList.style.display = isOpen ? 'none' : 'block';
    varToggle.textContent = (isOpen ? '▸' : '▾') + ' Template Variables';
  };
  body.appendChild(varToggle);
  body.appendChild(varList);
  modal.appendChild(body);

  // Footer
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid rgba(124,58,237,0.3);';

  // Paste Test button
  const testBtn = document.createElement('button');
  testBtn.textContent = '📋 Paste Test';
  testBtn.style.cssText = 'padding:8px 14px;background:' + cPanelBgAlt + ';border:1px solid ' + cPrimaryBorderA + ';border-radius:6px;color:#c4b5fd;font-size:12px;cursor:pointer;';
  testBtn.onmouseover = function() { (this as HTMLElement).style.background = '#2d3348'; };
  testBtn.onmouseout = function() { (this as HTMLElement).style.background = '#252a36'; };
  testBtn.onclick = function() {
    let text = contentArea.value.trim();
    if (!text) { showPasteToast('❌ No content to paste', true); return; }
    const now = new Date();
    text = text.replace(/\{\{date\}\}/gi, now.toLocaleDateString());
    text = text.replace(/\{\{time\}\}/gi, now.toLocaleTimeString());
    const pCfg = getPromptsConfig();
    pasteIntoEditor(text, pCfg, getByXPath as any);
  };
  footer.appendChild(testBtn);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.textContent = isEdit ? '💾 Update' : '💾 Save';
  saveBtn.style.cssText = 'padding:8px 18px;background:' + cPrimary + ';border:none;border-radius:6px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;';
  saveBtn.onmouseover = function() { (this as HTMLElement).style.background = '#6d28d9'; };
  saveBtn.onmouseout = function() { (this as HTMLElement).style.background = '#7c3aed'; };
  saveBtn.onclick = function() {
    const name = titleInput.value.trim();
    const text = contentArea.value.trim();
    if (!name) { showPasteToast('❌ Title is required', true); titleInput.focus(); return; }
    if (!text) { showPasteToast('❌ Content is required', true); contentArea.focus(); return; }
    if (text.length > 50 * 1024) { showPasteToast('❌ Content exceeds 50KB limit', true); return; }

    (saveBtn as HTMLButtonElement).disabled = true;
    saveBtn.textContent = '⏳ Saving…';

    const category = getSelectedCategory();
    const promptPayload: Record<string, any> = { name: name, text: text, source: 'user' };
    if (category) promptPayload.category = category;
    if (isEdit && editPrompt.id) promptPayload.id = editPrompt.id;

    sendToExtension('SAVE_PROMPT', { prompt: promptPayload }, function(resp: Record<string, unknown>) {
      (saveBtn as HTMLButtonElement).disabled = false;
      saveBtn.textContent = isEdit ? '💾 Update' : '💾 Save';
      if (resp && resp.isOk) {
        showPasteToast('✓ Prompt saved: ' + name, false);
        log('Prompt saved: ' + name, 'success');
        _loadedJsonPrompts = null;
        overlay.remove();
      } else {
        const errMsg = (resp && resp.errorMessage as string) || 'Save failed — extension may not be connected';
        showPasteToast('❌ ' + errMsg, true);
        log('Prompt save failed: ' + errMsg, 'error');
      }
    });
  };
  footer.appendChild(saveBtn);

  modal.appendChild(footer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.onclick = function(e: Event) { if (e.target === overlay) overlay.remove(); };
  function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); } }
  document.addEventListener('keydown', onEsc);
  titleInput.focus();
}
