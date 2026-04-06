/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Task Next Automation UI
 * Step 03e: Extracted from createUI() closure
 *
 * Automated multi-task prompt injection with configurable delays and retries.
 */

import { log } from '../logging';
import {
  cPanelBg, cPrimary, cPanelFg, cPrimaryLight,
} from '../shared-state';
import { showPasteToast, pasteIntoEditor } from './prompt-utils';

/** Mutable state for Task Next */
export const taskNextState = {
  settings: {
    preClickDelayMs: 500,
    postClickDelayMs: 2000,
    retryCount: 3,
    retryDelayMs: 1000,
    buttonXPath: '/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]/div/button[2]',
    promptSlug: 'next-tasks'
  },
  running: false,
  cancelled: false,
};

export interface TaskNextDeps {
  sendToExtension: (type: string, payload: any, cb?: (resp: any) => void) => void;
  getPromptsConfig: () => any;
  getByXPath: (xpath: string) => Element | null;
}

export function loadTaskNextSettings(deps: TaskNextDeps, cb?: () => void) {
  deps.sendToExtension('KV_GET', { key: 'task_next_settings', projectId: '_global' }, function(resp) {
    if (resp && resp.value) {
      try {
        var saved = JSON.parse(resp.value);
        for (var k in saved) { if (taskNextState.settings.hasOwnProperty(k)) (taskNextState.settings as Record<string, any>)[k] = saved[k]; }
      } catch(e) { /* ignore parse errors */ }
    }
    if (cb) cb();
  });
}

export function saveTaskNextSettings(deps: TaskNextDeps) {
  deps.sendToExtension('KV_SET', { key: 'task_next_settings', value: JSON.stringify(taskNextState.settings), projectId: '_global' }, function() {
    log('Task Next settings saved', 'info');
  });
}

export function findNextTasksPrompt(deps: TaskNextDeps) {
  const promptsCfg = deps.getPromptsConfig();
  const entries = promptsCfg.entries || [];
  const targetSlug = taskNextState.settings.promptSlug || 'next-tasks';

  // Priority 1: Exact slug field match (from info.json)
  for (let i = 0; i < entries.length; i++) {
    const entrySlug = (entries[i].slug || '').toLowerCase();
    if (entrySlug === targetSlug) {
      log('Task Next: Found prompt by slug field: "' + entries[i].name + '"', 'info');
      return entries[i];
    }
  }

  // Priority 2: Match by id field
  for (let i = 0; i < entries.length; i++) {
    const id = (entries[i].id || '').toLowerCase();
    if (id === targetSlug || id === 'default-' + targetSlug || id.indexOf(targetSlug) !== -1) {
      log('Task Next: Found prompt by id: "' + entries[i].name + '" (id=' + entries[i].id + ')', 'info');
      return entries[i];
    }
  }

  // Priority 3: Derive slug from name and match
  for (let i = 0; i < entries.length; i++) {
    const derivedSlug = (entries[i].name || '').toLowerCase().replace(/\s+/g, '-');
    if (derivedSlug === targetSlug) {
      log('Task Next: Found prompt by derived name slug: "' + entries[i].name + '"', 'info');
      return entries[i];
    }
  }

  // Priority 4: Broader match — any prompt with 'next' and 'task' in name
  for (let i = 0; i < entries.length; i++) {
    const name = (entries[i].name || '').toLowerCase();
    if (name.indexOf('next') !== -1 && name.indexOf('task') !== -1) {
      log('Task Next: Found prompt by name keywords: "' + entries[i].name + '"', 'info');
      return entries[i];
    }
  }

  // Last resort: use the first prompt that has text
  if (entries.length > 0 && entries[0].text) {
    log('Task Next: No "next-tasks" prompt found — using first available prompt: "' + entries[0].name + '"', 'warn');
    return entries[0];
  }
  return null;
}

export function findAddToTasksButton() {
  // Strategy 1: User-configured XPath
  try {
    const result = document.evaluate(taskNextState.settings.buttonXPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const btn = result.singleNodeValue;
    if (btn && (btn as HTMLElement).tagName && !(btn as HTMLButtonElement).disabled) return btn as HTMLElement;
  } catch(e) { /* XPath failed */ }

  // Strategy 2: Find the send/submit button in the chat form
  const sendSelectors = [
    'form button[type="submit"]',
    'form button:not([disabled]):last-of-type',
    'form button svg[data-testid="send-icon"]',
    'button[aria-label*="send" i]',
    'button[aria-label*="Send" i]',
    'button[data-testid*="send" i]',
    // Platform-specific: the send button is typically the last enabled button in the form
    'form div[role="toolbar"] button:last-child',
    'form button:nth-child(2)',
  ];

  for (let s = 0; s < sendSelectors.length; s++) {
    try {
      const el = document.querySelector(sendSelectors[s]);
      if (el) {
        // If we found an SVG, go up to the button
        const btn = el.tagName === 'BUTTON' ? el : el.closest('button');
        if (btn && !(btn as HTMLButtonElement).disabled) {
          log('Task Next: Found submit button via selector: ' + sendSelectors[s], 'info');
          return btn as HTMLElement;
        }
      }
    } catch(e) {}
  }

  return null;
}

export function runTaskNextLoop(deps: TaskNextDeps, count: number) {
  if (taskNextState.running) {
    log('Task Next: Already running', 'warn');
    return;
  }
  var prompt = findNextTasksPrompt(deps);
  if (!prompt || !prompt.text) {
    log('Task Next: "Next Tasks" prompt not found — aborting', 'error');
    showPasteToast('❌ "Next Tasks" prompt not found', true);
    return;
  }

  taskNextState.running = true;
  taskNextState.cancelled = false;
  var completed = 0;
  var promptsCfg = deps.getPromptsConfig();

  log('Task Next: Starting ' + count + ' tasks', 'info');
  showPasteToast('⏭ Task Next: Starting ' + count + ' tasks…', false);

  function doNextTask(index: number) {
    if (taskNextState.cancelled || index >= count) {
      taskNextState.running = false;
      if (taskNextState.cancelled) {
        showPasteToast('⚠️ Task Next: Stopped at ' + completed + '/' + count, true);
        log('Task Next: Cancelled at ' + completed + '/' + count, 'warn');
      } else {
        showPasteToast('✅ Task Next: All ' + count + ' tasks queued', false);
        log('Task Next: Completed all ' + count + ' tasks', 'success');
      }
      return;
    }

    var injected = pasteIntoEditor(prompt.text, promptsCfg, deps.getByXPath);
    if (!injected) {
      log('Task Next: Failed to inject prompt at task ' + (index + 1), 'error');
      showPasteToast('❌ Task Next: Injection failed at ' + (index + 1) + '/' + count, true);
      taskNextState.running = false;
      return;
    }

    setTimeout(function() {
      if (taskNextState.cancelled) { taskNextState.running = false; return; }

      var retries = 0;
      function tryClickButton() {
        var btn = findAddToTasksButton();
        if (!btn) {
          log('Task Next: "Add To Tasks" button not found — aborting', 'error');
          showPasteToast('❌ Task Next: Button not found — stopped at ' + completed + '/' + count, true);
          taskNextState.running = false;
          return;
        }

        if ((btn as HTMLButtonElement).disabled) {
          retries++;
          if (retries <= taskNextState.settings.retryCount) {
            log('Task Next: Button disabled, retry ' + retries + '/' + taskNextState.settings.retryCount, 'warn');
            setTimeout(tryClickButton, taskNextState.settings.retryDelayMs);
            return;
          } else {
            log('Task Next: Button stayed disabled after ' + taskNextState.settings.retryCount + ' retries, skipping task ' + (index + 1), 'warn');
            completed++;
            showPasteToast('⏭ Task Next: ' + completed + '/' + count + ' (skipped disabled)', false);
            setTimeout(function() { doNextTask(index + 1); }, taskNextState.settings.postClickDelayMs);
            return;
          }
        }

        btn.click();
        completed++;
        log('Task Next: Task ' + completed + '/' + count + ' queued', 'info');
        showPasteToast('⏭ Task Next: ' + completed + '/' + count + ' completed', false);

        setTimeout(function() { doNextTask(index + 1); }, taskNextState.settings.postClickDelayMs);
      }

      tryClickButton();
    }, taskNextState.settings.preClickDelayMs);
  }

  doNextTask(0);
}

// Escape key cancel handler — call once at init
export function setupTaskNextCancelHandler() {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && taskNextState.running) {
      taskNextState.cancelled = true;
      log('Task Next: Cancel requested via Escape', 'info');
    }
  });
}

export function openTaskNextSettingsModal(deps: TaskNextDeps) {
  var existing = document.getElementById('marco-tasknext-settings');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'marco-tasknext-settings';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:1000010;display:flex;align-items:center;justify-content:center;font-family:system-ui,-apple-system,sans-serif;';

  var modal = document.createElement('div');
  modal.style.cssText = 'background:' + cPanelBg + ';border:1px solid ' + cPrimary + ';border-radius:12px;width:400px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.8);';

  var title = document.createElement('div');
  title.textContent = '⚙ Task Next Settings';
  title.style.cssText = 'font-size:14px;font-weight:700;color:' + cPanelFg + ';margin-bottom:16px;';
  modal.appendChild(title);

  var fields = [
    { key: 'preClickDelayMs', label: 'Pre-click delay (ms)', type: 'number' },
    { key: 'postClickDelayMs', label: 'Post-click delay (ms)', type: 'number' },
    { key: 'retryCount', label: 'Retry count', type: 'number' },
    { key: 'retryDelayMs', label: 'Retry delay (ms)', type: 'number' },
    { key: 'buttonXPath', label: 'Button XPath', type: 'text' },
    { key: 'promptSlug', label: 'Prompt slug', type: 'text' }
  ];

  const inputs: Record<string, HTMLInputElement> = {};
  for (var f = 0; f < fields.length; f++) {
    (function(field) {
      var row = document.createElement('div');
      row.style.cssText = 'margin-bottom:10px;';
      var lbl = document.createElement('label');
      lbl.textContent = field.label;
      lbl.style.cssText = 'display:block;font-size:10px;color:' + cPrimaryLight + ';margin-bottom:3px;';
      row.appendChild(lbl);
      var inp = document.createElement('input');
      inp.type = field.type;
      inp.value = String((taskNextState.settings as Record<string, any>)[field.key]);
      inp.style.cssText = 'width:100%;padding:6px 8px;background:rgba(0,0,0,0.3);border:1px solid rgba(124,58,237,0.3);border-radius:6px;color:' + cPanelFg + ';font-size:11px;box-sizing:border-box;';
      row.appendChild(inp);
      modal.appendChild(row);
      inputs[field.key] = inp;
    })(fields[f]);
  }

  var btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px;';

  var cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid rgba(124,58,237,0.3);border-radius:6px;background:transparent;color:' + cPanelFg + ';cursor:pointer;font-size:11px;';
  cancelBtn.onclick = function() { overlay.remove(); };
  btnRow.appendChild(cancelBtn);

  var saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.cssText = 'padding:6px 16px;border:none;border-radius:6px;background:' + cPrimary + ';color:#fff;cursor:pointer;font-size:11px;font-weight:600;';
  saveBtn.onclick = function() {
    taskNextState.settings.preClickDelayMs = parseInt(inputs.preClickDelayMs.value) || 500;
    taskNextState.settings.postClickDelayMs = parseInt(inputs.postClickDelayMs.value) || 2000;
    taskNextState.settings.retryCount = parseInt(inputs.retryCount.value) || 3;
    taskNextState.settings.retryDelayMs = parseInt(inputs.retryDelayMs.value) || 1000;
    taskNextState.settings.buttonXPath = inputs.buttonXPath.value || taskNextState.settings.buttonXPath;
    taskNextState.settings.promptSlug = inputs.promptSlug.value || 'next-tasks';
    saveTaskNextSettings(deps);
    overlay.remove();
    showPasteToast('✅ Task Next settings saved', false);
  };
  btnRow.appendChild(saveBtn);
  modal.appendChild(btnRow);

  overlay.appendChild(modal);
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}
