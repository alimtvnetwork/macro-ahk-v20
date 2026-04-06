/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Save Prompt & Chatbox Prompts Button
 * Step 03g: Extracted from createUI() closure
 *
 * Injects two buttons into the chatbox toolbar:
 * 1. Save Prompt — saves chatbox content as a new prompt
 * 2. Prompts — opens a floating dropdown to paste any prompt into the editor
 */

import { log } from '../logging';
import { showPasteToast, findPasteTarget, pasteIntoEditor } from './prompt-utils';
import {
  loadPromptsFromJson, getPromptsConfig,
} from './prompt-manager';
import { runTaskNextLoop, openTaskNextSettingsModal } from './task-next-ui';
import type { TaskNextDeps } from './task-next-ui';

export interface SavePromptDeps {
  getPromptsConfig: () => any;
  getByXPath: (xpath: string) => Element | null;
  openPromptCreationModal: (data: { name: string; text: string; category: string }) => void;
  taskNextDeps?: TaskNextDeps;
}

/**
 * Convert editor HTML to simple markdown.
 */
export function htmlToMarkdown(el: HTMLElement): string {
  var md = '';
  var nodes = el.childNodes;
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.nodeType === 3) {
      md += node.textContent;
    } else if (node.nodeType === 1) {
      var tag = (node as HTMLElement).tagName.toLowerCase();
      var text = node.textContent || '';
      if (tag === 'p' || tag === 'div') {
        var inner = htmlToMarkdown(node as HTMLElement);
        md += inner + '\n\n';
      } else if (tag === 'br') {
        md += '\n';
      } else if (tag === 'strong' || tag === 'b') {
        md += '**' + text + '**';
      } else if (tag === 'em' || tag === 'i') {
        md += '*' + text + '*';
      } else if (tag === 'code') {
        md += '`' + text + '`';
      } else if (tag === 'pre') {
        var codeEl = (node as HTMLElement).querySelector('code');
        var lang = '';
        if (codeEl && codeEl.className) {
          var m = codeEl.className.match(/language-(\w+)/);
          if (m) lang = m[1];
        }
        md += '```' + lang + '\n' + (codeEl ? codeEl.textContent : text) + '\n```\n\n';
      } else if (tag === 'ul' || tag === 'ol') {
        var items = (node as HTMLElement).querySelectorAll(':scope > li');
        for (var li = 0; li < items.length; li++) {
          var prefix = tag === 'ol' ? ((li + 1) + '. ') : '- ';
          md += prefix + items[li].textContent!.trim() + '\n';
        }
        md += '\n';
      } else if (tag === 'li') {
        md += '- ' + text.trim() + '\n';
      } else if (tag === 'h1') {
        md += '# ' + text + '\n\n';
      } else if (tag === 'h2') {
        md += '## ' + text + '\n\n';
      } else if (tag === 'h3') {
        md += '### ' + text + '\n\n';
      } else if (tag === 'a') {
        md += '[' + text + '](' + ((node as HTMLAnchorElement).href || '') + ')';
      } else if (tag === 'blockquote') {
        md += '> ' + text.trim() + '\n\n';
      } else {
        md += text;
      }
    }
  }
  return md.replace(/\n{3,}/g, '\n\n').trim();
}

export function onSavePromptClick(deps: SavePromptDeps) {
  var target = findPasteTarget(deps.getPromptsConfig(), deps.getByXPath);
  if (!target) {
    showPasteToast('❌ Chatbox not found — cannot save prompt', true);
    return;
  }
  var markdown = htmlToMarkdown(target as HTMLElement);
  if (!markdown || !markdown.trim()) {
    showPasteToast('⚠️ Chatbox is empty — nothing to save', true);
    return;
  }
  var lines = markdown.split('\n').filter(function(l) { return l.trim(); });
  var rawTitle = (lines[0] || 'Untitled Prompt').trim();
  rawTitle = rawTitle.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim();
  if (rawTitle.length > 80) rawTitle = rawTitle.substring(0, 80) + '…';

  deps.openPromptCreationModal({
    name: rawTitle,
    text: markdown,
    category: ''
  });
  log('Save Prompt: Opened creation modal with chatbox content (' + markdown.length + ' chars)', 'info');
  showPasteToast('💾 Chatbox content loaded into prompt editor', false);
}

// XPath and CSS fallbacks for finding the chatbox toolbar container
var SAVE_PROMPT_XPATH = '/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]/div';
var SAVE_PROMPT_CSS_FALLBACKS = [
  'form div[class*="flex"] > div[type="button"]',
  'main form div:last-child > div:last-child',
  'form [data-state] button[aria-label]',
  'main form div.flex.items-center',
];

export function findSavePromptContainer(): Element | null {
  try {
    var xpathResult = document.evaluate(SAVE_PROMPT_XPATH, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (xpathResult) {
      log('Save Prompt: Container found via XPath', 'check');
      return xpathResult as Element;
    }
  } catch (e) { /* XPath eval error */ }

  for (var i = 0; i < SAVE_PROMPT_CSS_FALLBACKS.length; i++) {
    try {
      if (i === 2) {
        var toolbarBtn = document.querySelector(SAVE_PROMPT_CSS_FALLBACKS[i]);
        if (toolbarBtn && toolbarBtn.parentElement) {
          log('Save Prompt: Container found via CSS fallback #' + (i + 1) + ' (parent of toolbar button)', 'check');
          return toolbarBtn.parentElement;
        }
      } else {
        var el = document.querySelector(SAVE_PROMPT_CSS_FALLBACKS[i]);
        if (el) {
          log('Save Prompt: Container found via CSS fallback #' + (i + 1), 'check');
          return el;
        }
      }
    } catch (e) { /* selector error */ }
  }

  return null;
}

// ============================================
// Shared button class for toolbar buttons
// ============================================
var TOOLBAR_BTN_CLASS = 'relative box-border inline-flex min-w-fit items-center justify-center whitespace-nowrap text-sm font-normal brightness-100 transition-[background-color,opacity,color,filter] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 btn-safari-fix shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.2),inset_0_0_0_0.5px_rgba(0,0,0,0.2),0_1px_2px_0_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.2),inset_0_0_0_0.5px_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.05)] active:brightness-[0.65] disabled:brightness-100 gap-1.5 px-3 py-2 rounded-full !p-0 bg-secondary text-primary h-7 w-7';

// Floppy disk icon SVG (save)
var SAVE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 size-4" aria-hidden="true"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>';

// Clipboard/list icon SVG (prompts)
var PROMPTS_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 size-4" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>';

function addHoverEffect(btn: HTMLElement) {
  btn.addEventListener('mouseover', function() { btn.style.filter = 'brightness(0.8)'; });
  btn.addEventListener('mouseout', function() { btn.style.filter = ''; });
}

// ============================================
// Prompts floating dropdown for chatbox
// ============================================

var _promptsDropdownEl: HTMLElement | null = null;

function createPromptsDropdown(): HTMLElement {
  if (_promptsDropdownEl) return _promptsDropdownEl;

  var dropdown = document.createElement('div');
  dropdown.id = 'marco-chatbox-prompts-dropdown';
  dropdown.style.cssText = 'display:none;position:fixed;z-index:100002;min-width:260px;max-width:380px;max-height:320px;overflow-y:auto;background:#1e1e2e;border:1px solid #7c3aed;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.4);font-family:system-ui,sans-serif;';
  document.body.appendChild(dropdown);
  _promptsDropdownEl = dropdown;

  // Close on outside click
  document.addEventListener('click', function(e) {
    if (dropdown.style.display !== 'none' && !dropdown.contains(e.target as Node)) {
      dropdown.style.display = 'none';
    }
  });

  return dropdown;
}

function positionDropdownAboveButton(dropdown: HTMLElement, btn: HTMLElement) {
  var rect = btn.getBoundingClientRect();
  dropdown.style.display = 'block';
  // Position above the button
  var dropH = dropdown.offsetHeight || 200;
  dropdown.style.left = Math.max(8, rect.left - 120) + 'px';
  dropdown.style.top = Math.max(8, rect.top - dropH - 6) + 'px';
}

function renderChatboxPromptsDropdown(dropdown: HTMLElement, deps: SavePromptDeps) {
  dropdown.innerHTML = '<div style="padding:10px 14px;color:#9ca3af;font-size:12px;text-align:center;">⏳ Loading prompts…</div>';

  loadPromptsFromJson(function(loaded: any) {
    var promptsCfg = getPromptsConfig();
    var entries = promptsCfg.entries || [];
    if (!entries.length) {
      dropdown.innerHTML = '<div style="padding:10px 14px;color:#9ca3af;font-size:12px;text-align:center;">No prompts available</div>';
      return;
    }

    dropdown.innerHTML = '';
    var _editMode = false;

    // Header with edit toggle
    var header = document.createElement('div');
    header.style.cssText = 'padding:6px 12px;font-size:10px;color:#a78bfa;border-bottom:1px solid rgba(124,58,237,0.3);font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:4px;';
    var headerLeft = document.createElement('span');
    headerLeft.innerHTML = '<span>📋</span> <span>Click to paste into editor</span>';
    header.appendChild(headerLeft);

    var editToggle = document.createElement('button');
    editToggle.textContent = '✏️ Edit';
    editToggle.title = 'Toggle edit mode (Ctrl+E)';
    editToggle.style.cssText = 'padding:2px 8px;border-radius:6px;font-size:9px;cursor:pointer;border:1px solid rgba(124,58,237,0.3);background:rgba(0,0,0,0.2);color:#a78bfa;';
    editToggle.onclick = function(e) {
      e.stopPropagation();
      _editMode = !_editMode;
      editToggle.style.background = _editMode ? '#7c3aed' : 'rgba(0,0,0,0.2)';
      editToggle.style.color = _editMode ? '#fff' : '#a78bfa';
      renderItems();
    };
    header.appendChild(editToggle);
    dropdown.appendChild(header);

    // ── Task Next sub-menu (if taskNextDeps available) ──
    if (deps.taskNextDeps) {
      var tnDeps = deps.taskNextDeps;
      var taskNextItem = document.createElement('div');
      taskNextItem.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:space-between;padding:6px 12px;cursor:pointer;font-size:11px;color:#a78bfa;border-bottom:1px solid rgba(124,58,237,0.3);font-weight:600;';
      taskNextItem.textContent = '⏭ Task Next';
      var tnArrow = document.createElement('span');
      tnArrow.textContent = '▸';
      tnArrow.style.cssText = 'font-size:10px;margin-left:4px;';
      taskNextItem.appendChild(tnArrow);

      var taskNextSub = document.createElement('div');
      taskNextSub.style.cssText = 'display:none;position:fixed;min-width:180px;background:#1e1e2e;border:1px solid #7c3aed;border-radius:8px;z-index:100010;box-shadow:0 8px 24px rgba(0,0,0,0.4);';
      document.body.appendChild(taskNextSub);
      taskNextSub.onmouseover = function() { taskNextSub.style.display = 'block'; };
      taskNextSub.onmouseout = function() { taskNextSub.style.display = 'none'; };

      function positionTnSub() {
        var r = taskNextItem.getBoundingClientRect();
        if (r.right + 180 > window.innerWidth) {
          taskNextSub.style.left = (r.left - 180) + 'px';
        } else {
          taskNextSub.style.left = r.right + 'px';
        }
        taskNextSub.style.top = r.top + 'px';
      }

      taskNextItem.onmouseover = function() { (this as HTMLElement).style.background = 'rgba(124,58,237,0.15)'; positionTnSub(); taskNextSub.style.display = 'block'; };
      taskNextItem.onmouseout = function() {
        var self = this as unknown as HTMLElement;
        setTimeout(function() {
          if (!taskNextSub.matches(':hover') && !self.matches(':hover')) {
            self.style.background = 'transparent';
            taskNextSub.style.display = 'none';
          }
        }, 100);
      };

      var presetCounts = [1, 2, 3, 5, 7, 10, 12, 15, 20, 30, 40];
      for (var pc = 0; pc < presetCounts.length; pc++) {
        (function(n: number) {
          var subItem = document.createElement('div');
          subItem.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:10px;color:#e0e0e0;';
          subItem.textContent = 'Next ' + n + ' task' + (n > 1 ? 's' : '');
          subItem.onmouseover = function() { (this as HTMLElement).style.background = 'rgba(124,58,237,0.15)'; };
          subItem.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };
          subItem.onclick = function(e) {
            e.stopPropagation();
            dropdown.style.display = 'none';
            taskNextSub.style.display = 'none';
            runTaskNextLoop(tnDeps, n);
          };
          taskNextSub.appendChild(subItem);
        })(presetCounts[pc]);
      }

      // Custom count
      var customRow = document.createElement('div');
      customRow.style.cssText = 'display:flex;align-items:center;gap:4px;padding:5px 12px;border-top:1px solid rgba(124,58,237,0.2);';
      var customLabel = document.createElement('span');
      customLabel.textContent = 'Custom:';
      customLabel.style.cssText = 'font-size:10px;color:#a78bfa;';
      customRow.appendChild(customLabel);
      var customInput = document.createElement('input');
      customInput.type = 'number'; customInput.min = '1'; customInput.max = '999'; customInput.placeholder = '#';
      customInput.style.cssText = 'width:50px;padding:3px 5px;background:rgba(0,0,0,0.3);border:1px solid rgba(124,58,237,0.3);border-radius:4px;color:#e0e0e0;font-size:10px;';
      customInput.onclick = function(e) { e.stopPropagation(); };
      customRow.appendChild(customInput);
      var goBtn = document.createElement('span');
      goBtn.textContent = '▶'; goBtn.title = 'Go';
      goBtn.style.cssText = 'cursor:pointer;font-size:11px;color:#7c3aed;';
      goBtn.onclick = function(e) {
        e.stopPropagation();
        var n = parseInt(customInput.value);
        if (!n || n < 1 || n > 999) { showPasteToast('⚠️ Enter 1–999', true); return; }
        dropdown.style.display = 'none';
        taskNextSub.style.display = 'none';
        runTaskNextLoop(tnDeps, n);
      };
      customInput.onkeydown = function(e: KeyboardEvent) { if (e.key === 'Enter') { e.stopPropagation(); goBtn.click(); } };
      customRow.appendChild(goBtn);
      taskNextSub.appendChild(customRow);

      // Settings
      var settingsItem = document.createElement('div');
      settingsItem.style.cssText = 'padding:5px 12px;cursor:pointer;font-size:10px;color:#a78bfa;border-top:1px solid rgba(124,58,237,0.2);';
      settingsItem.textContent = '⚙ Settings';
      settingsItem.onmouseover = function() { (this as HTMLElement).style.background = 'rgba(124,58,237,0.15)'; };
      settingsItem.onmouseout = function() { (this as HTMLElement).style.background = 'transparent'; };
      settingsItem.onclick = function(e) {
        e.stopPropagation();
        dropdown.style.display = 'none';
        taskNextSub.style.display = 'none';
        openTaskNextSettingsModal(tnDeps);
      };
      taskNextSub.appendChild(settingsItem);
      dropdown.appendChild(taskNextItem);
    }

    // Search input
    var searchWrap = document.createElement('div');
    searchWrap.style.cssText = 'padding:6px 10px;border-bottom:1px solid rgba(124,58,237,0.15);';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔍 Search prompts…';
    searchInput.style.cssText = 'width:100%;box-sizing:border-box;padding:5px 10px;border-radius:6px;border:1px solid rgba(124,58,237,0.3);background:rgba(0,0,0,0.3);color:#e0e0e0;font-size:11px;outline:none;font-family:system-ui,sans-serif;';
    searchInput.onfocus = function() { searchInput.style.borderColor = '#7c3aed'; };
    searchInput.onblur = function() { searchInput.style.borderColor = 'rgba(124,58,237,0.3)'; };
    var searchQuery = '';
    searchInput.oninput = function() {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderItems();
    };
    searchInput.onclick = function(e) { e.stopPropagation(); };
    searchWrap.appendChild(searchInput);
    dropdown.appendChild(searchWrap);

    // Category filter chips
    var categories: string[] = [];
    var catSeen: Record<string, boolean> = {};
    for (var c = 0; c < entries.length; c++) {
      var cat = ((entries[c] as any).category || '').trim();
      if (cat && !catSeen[cat.toLowerCase()]) {
        categories.push(cat);
        catSeen[cat.toLowerCase()] = true;
      }
    }

    var activeFilter: string | null = null;
    var itemsContainer = document.createElement('div');

    if (categories.length > 0) {
      var chipBar = document.createElement('div');
      chipBar.style.cssText = 'display:flex;gap:4px;padding:6px 10px;flex-wrap:wrap;border-bottom:1px solid rgba(124,58,237,0.15);';

      var allChip = document.createElement('span');
      allChip.textContent = 'All';
      allChip.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:10px;cursor:pointer;background:#7c3aed;color:#fff;font-weight:600;';
      allChip.onclick = function(e) {
        e.stopPropagation();
        activeFilter = null;
        renderItems();
        updateChipStyles();
      };
      chipBar.appendChild(allChip);

      var chipEls: HTMLElement[] = [allChip];
      for (var ci = 0; ci < categories.length; ci++) {
        (function(catName: string) {
          var chip = document.createElement('span');
          chip.textContent = catName;
          chip.style.cssText = 'padding:2px 8px;border-radius:10px;font-size:10px;cursor:pointer;background:rgba(124,58,237,0.2);color:#a78bfa;';
          chip.onclick = function(e) {
            e.stopPropagation();
            activeFilter = catName;
            renderItems();
            updateChipStyles();
          };
          chipBar.appendChild(chip);
          chipEls.push(chip);
        })(categories[ci]);
      }

      function updateChipStyles() {
        for (var x = 0; x < chipEls.length; x++) {
          if (x === 0) {
            chipEls[x].style.background = activeFilter === null ? '#7c3aed' : 'rgba(124,58,237,0.2)';
            chipEls[x].style.color = activeFilter === null ? '#fff' : '#a78bfa';
          } else {
            var isActive = activeFilter === chipEls[x].textContent;
            chipEls[x].style.background = isActive ? '#7c3aed' : 'rgba(124,58,237,0.2)';
            chipEls[x].style.color = isActive ? '#fff' : '#a78bfa';
          }
        }
      }

      dropdown.appendChild(chipBar);
    }

    function renderItems() {
      itemsContainer.innerHTML = '';
      var filtered = entries;
      if (activeFilter) {
        filtered = entries.filter(function(e: any) {
          return (e.category || '').toLowerCase() === activeFilter!.toLowerCase();
        });
      }
      if (searchQuery) {
        filtered = filtered.filter(function(e: any) {
          var name = ((e.name || '') as string).toLowerCase();
          var text = ((e.text || '') as string).toLowerCase();
          var cat = ((e.category || '') as string).toLowerCase();
          return name.indexOf(searchQuery) !== -1 || text.indexOf(searchQuery) !== -1 || cat.indexOf(searchQuery) !== -1;
        });
      }

      for (var i = 0; i < filtered.length; i++) {
        (function(prompt: any) {
          var item = document.createElement('div');
          item.style.cssText = 'display:flex;align-items:center;gap:6px;padding:7px 12px;cursor:pointer;font-size:12px;color:#e0e0e0;transition:background 0.12s;border-bottom:1px solid rgba(255,255,255,0.04);';
          item.onmouseover = function() { item.style.background = 'rgba(124,58,237,0.15)'; };
          item.onmouseout = function() { item.style.background = 'none'; };

          var nameSpan = document.createElement('span');
          nameSpan.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
          nameSpan.textContent = prompt.name || 'Untitled';
          nameSpan.title = (prompt.text || '').substring(0, 200);

          var catBadge = document.createElement('span');
          if (prompt.category) {
            catBadge.textContent = prompt.category;
            catBadge.style.cssText = 'font-size:9px;padding:1px 5px;border-radius:6px;background:rgba(124,58,237,0.2);color:#a78bfa;white-space:nowrap;';
          }

          var copyBtn = document.createElement('span');
          copyBtn.textContent = '📋';
          copyBtn.title = 'Copy to clipboard';
          copyBtn.style.cssText = 'cursor:pointer;font-size:11px;flex-shrink:0;opacity:0.5;transition:opacity 0.15s;';
          copyBtn.onmouseover = function() { copyBtn.style.opacity = '1'; };
          copyBtn.onmouseout = function() { copyBtn.style.opacity = '0.5'; };
          copyBtn.onclick = function(e) {
            e.stopPropagation();
            navigator.clipboard.writeText(prompt.text || '').then(function() {
              showPasteToast('📋 Copied "' + (prompt.name || '') + '" to clipboard', false);
            }).catch(function() {
              showPasteToast('❌ Failed to copy', true);
            });
          };

          item.appendChild(nameSpan);
          if (prompt.category) item.appendChild(catBadge);

          // Edit button (visible in edit mode)
          if (_editMode) {
            var editBtn = document.createElement('span');
            editBtn.textContent = '✏️';
            editBtn.title = 'Edit prompt';
            editBtn.style.cssText = 'cursor:pointer;font-size:11px;flex-shrink:0;opacity:0.7;transition:opacity 0.15s;';
            editBtn.onmouseover = function() { editBtn.style.opacity = '1'; };
            editBtn.onmouseout = function() { editBtn.style.opacity = '0.7'; };
            editBtn.onclick = function(e) {
              e.stopPropagation();
              dropdown.style.display = 'none';
              deps.openPromptCreationModal({ name: prompt.name || '', text: prompt.text || '', category: prompt.category || '' });
            };
            item.appendChild(editBtn);
          }

          item.appendChild(copyBtn);

          item.onclick = function(e) {
            e.stopPropagation();
            var promptsCfg = deps.getPromptsConfig();
            pasteIntoEditor(prompt.text || '', promptsCfg, deps.getByXPath);
            dropdown.style.display = 'none';
            log('Chatbox Prompts: Pasted "' + (prompt.name || '') + '" (' + ((prompt.text || '').length) + ' chars)', 'info');
          };

          itemsContainer.appendChild(item);
        })(filtered[i]);
      }

      if (filtered.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'padding:10px 14px;color:#6b7280;font-size:11px;text-align:center;';
        empty.textContent = searchQuery ? 'No prompts matching "' + searchQuery + '"' : 'No prompts in this category';
        itemsContainer.appendChild(empty);
      }
    }

    renderItems();
    dropdown.appendChild(itemsContainer);

    // Keyboard shortcut: Ctrl+E toggles edit mode
    dropdown.addEventListener('keydown', function(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        e.stopPropagation();
        _editMode = !_editMode;
        editToggle.style.background = _editMode ? '#7c3aed' : 'rgba(0,0,0,0.2)';
        editToggle.style.color = _editMode ? '#fff' : '#a78bfa';
        renderItems();
      }
    });

    // Auto-focus search after render
    setTimeout(function() { searchInput.focus(); }, 50);
  });
}

// ============================================
// Inject both buttons into chatbox toolbar
// ============================================

/**
 * Inject Save Prompt and Prompts buttons into chatbox toolbar.
 * Retries on interval until found or timeout.
 */
export function injectSavePromptButton(deps: SavePromptDeps) {
  var injected = false;

  function tryInject() {
    if (injected) return true;
    if (document.getElementById('marco-save-prompt-btn')) { injected = true; return true; }
    try {
      var container = findSavePromptContainer();
      if (!container) return false;

      // ── Prompts button ──
      var promptsWrapper = document.createElement('div');
      promptsWrapper.setAttribute('type', 'button');
      promptsWrapper.setAttribute('data-state', 'closed');
      promptsWrapper.id = 'marco-chatbox-prompts-btn';

      var promptsBtn = document.createElement('button');
      promptsBtn.className = TOOLBAR_BTN_CLASS;
      promptsBtn.type = 'button';
      promptsBtn.setAttribute('aria-label', 'Prompts');
      promptsBtn.title = 'Browse and paste prompts into editor';
      promptsBtn.style.cssText = 'cursor:pointer;';
      promptsBtn.innerHTML = PROMPTS_ICON_SVG;

      promptsBtn.onclick = function(e) {
        e.stopPropagation();
        e.preventDefault();
        var dropdown = createPromptsDropdown();
        if (dropdown.style.display !== 'none') {
          dropdown.style.display = 'none';
          return;
        }
        renderChatboxPromptsDropdown(dropdown, deps);
        positionDropdownAboveButton(dropdown, promptsBtn);
      };

      addHoverEffect(promptsBtn);
      promptsWrapper.appendChild(promptsBtn);

      // ── Save Prompt button ──
      var saveWrapper = document.createElement('div');
      saveWrapper.setAttribute('type', 'button');
      saveWrapper.setAttribute('data-state', 'closed');
      saveWrapper.id = 'marco-save-prompt-btn';

      var saveBtn = document.createElement('button');
      saveBtn.className = TOOLBAR_BTN_CLASS;
      saveBtn.type = 'button';
      saveBtn.setAttribute('aria-label', 'Save Prompt');
      saveBtn.title = 'Save current chatbox content as a new prompt';
      saveBtn.style.cssText = 'cursor:pointer;';
      saveBtn.innerHTML = SAVE_ICON_SVG;

      saveBtn.onclick = function(e) {
        e.stopPropagation();
        e.preventDefault();
        onSavePromptClick(deps);
      };

      addHoverEffect(saveBtn);
      saveWrapper.appendChild(saveBtn);

      // Inject both — prompts first, then save
      container.prepend(saveWrapper);
      container.prepend(promptsWrapper);

      injected = true;
      log('Save Prompt + Prompts buttons injected into chatbox toolbar', 'info');
      return true;
    } catch (e) {
      return false;
    }
  }

  tryInject();
  var retryId = setInterval(function() {
    if (tryInject()) { clearInterval(retryId); }
  }, 2000);
  setTimeout(function() { clearInterval(retryId); }, 30000);
}
