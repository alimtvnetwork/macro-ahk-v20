/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Settings Dialog
 * Step 03i: Extracted from macro-looping.ts createUI closure
 *
 * Contains: showSettingsDialog (with switchTab, makeField helpers)
 */

import {
  VERSION, CONFIG, TIMING,
  cPanelBg, cPanelBgAlt, cPanelBorder, cPanelText, cPanelFg,
  cPrimary, cPrimaryLight, cPrimaryLighter,
  cSectionHeader, cInputBorder, cInputBg, cInputFg,
  cNeutral600, cWarning, cSuccess,
} from '../shared-state';

import { taskNextState, saveTaskNextSettings } from './task-next-ui';
import { getLogConfig, updateLogConfig, resetLogConfig, type LogManagerConfig } from '../log-manager';

// ============================================
// Dependencies injected from createUI closure
// ============================================
export interface SettingsDeps {
  btnStyle: string;
  taskNextDeps: any;
  getPromptsConfig: () => any;
  showToast: (msg: string, level?: string) => void;
  log: (msg: string, level?: string) => void;
  sendToExtension: (type: string, payload: any, cb: Function) => void;
}

// ============================================
// Helper: create labeled input field
// ============================================
function makeField(label: string, value: string, opts?: any) {
  opts = opts || {};
  const row = document.createElement('div');
  row.style.cssText = 'margin-bottom:10px;';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:10px;color:' + cSectionHeader + ';margin-bottom:3px;font-weight:600;';
  lbl.textContent = label;
  row.appendChild(lbl);
  const inp = document.createElement(opts.multiline ? 'textarea' : 'input') as HTMLInputElement;
  inp.type = opts.type || 'text';
  inp.value = value || '';
  inp.style.cssText = 'width:100%;padding:6px 8px;border:1px solid ' + cInputBorder + ';border-radius:5px;background:' + cInputBg + ';color:' + cInputFg + ';font-family:monospace;font-size:11px;box-sizing:border-box;' + (opts.multiline ? 'min-height:60px;resize:vertical;' : '');
  row.appendChild(inp);
  if (opts.hint) {
    const h = document.createElement('div');
    h.style.cssText = 'font-size:9px;color:#64748b;margin-top:2px;';
    h.textContent = opts.hint;
    row.appendChild(h);
  }
  return { row, input: inp };
}

// ============================================
// Show Settings Dialog
// ============================================
export function showSettingsDialog(deps: SettingsDeps) {
  let existing = document.getElementById('macroloop-settings-dialog');
  if (existing) { existing.remove(); return; }

  const { btnStyle, taskNextDeps, getPromptsConfig, showToast, log, sendToExtension } = deps;
  const tFontSystem = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

  const overlay = document.createElement('div');
  overlay.id = 'macroloop-settings-dialog';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  const dialog = document.createElement('div');
  dialog.style.cssText = 'background:' + cPanelBg + ';border:1px solid ' + cPanelBorder + ';border-radius:12px;padding:0;max-width:560px;width:92%;max-height:80vh;display:flex;flex-direction:column;color:' + cPanelText + ';font-family:' + tFontSystem + ';box-shadow:0 25px 60px rgba(0,0,0,0.5);';
  dialog.className = 'marco-enter';
  dialog.onclick = function(e) { e.stopPropagation(); };

  // Header
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid ' + cPanelBorder + ';flex-shrink:0;';
  const hdrTitle = document.createElement('div');
  hdrTitle.style.cssText = 'font-size:16px;font-weight:700;color:' + cPrimaryLighter + ';';
  hdrTitle.textContent = '⚙️ MacroLoop Settings';
  const hdrClose = document.createElement('span');
  hdrClose.style.cssText = 'font-size:18px;color:#64748b;cursor:pointer;padding:4px 8px;border-radius:6px;transition:all 0.15s;';
  hdrClose.textContent = '✕';
  hdrClose.onmouseenter = function() { hdrClose.style.color = '#e2e8f0'; hdrClose.style.background = 'rgba(255,255,255,0.1)'; };
  hdrClose.onmouseleave = function() { hdrClose.style.color = '#64748b'; hdrClose.style.background = 'none'; };
  hdrClose.onclick = function() { overlay.remove(); };
  hdr.appendChild(hdrTitle);
  hdr.appendChild(hdrClose);
  dialog.appendChild(hdr);

  // Tab bar
  const tabs = ['XPaths', 'Timing', 'Task Next', 'Logging', 'General'];
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;gap:0;border-bottom:1px solid ' + cPanelBorder + ';padding:0 20px;flex-shrink:0;';
  const tabPanels = document.createElement('div');
  tabPanels.style.cssText = 'flex:1;overflow-y:auto;padding:16px 20px;';
  let activeTabIdx = 0;
  const tabBtns: HTMLElement[] = [];
  const panels: HTMLElement[] = [];

  function switchTab(idx: number) {
    activeTabIdx = idx;
    tabBtns.forEach(function(b, i) {
      b.style.borderBottom = i === idx ? '2px solid ' + cPrimary : '2px solid transparent';
      b.style.color = i === idx ? cPrimaryLight : '#64748b';
    });
    panels.forEach(function(p, i) { p.style.display = i === idx ? '' : 'none'; });
  }

  tabs.forEach(function(name, i) {
    const btn = document.createElement('div');
    btn.style.cssText = 'padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;transition:color 0.15s;border-bottom:2px solid transparent;color:#64748b;';
    btn.textContent = name;
    btn.onclick = function() { switchTab(i); };
    tabBar.appendChild(btn);
    tabBtns.push(btn);
  });
  dialog.appendChild(tabBar);

  // ── Panel 1: XPaths ──
  const p1 = document.createElement('div');
  const xpFields = [
    { key: 'PROJECT_BUTTON_XPATH', label: 'Project Button XPath' },
    { key: 'MAIN_PROGRESS_XPATH', label: 'Main Progress XPath' },
    { key: 'PROGRESS_XPATH', label: 'Progress Bar XPath' },
    { key: 'WORKSPACE_XPATH', label: 'Workspace Name XPath' },
    { key: 'WORKSPACE_NAV_XPATH', label: 'Workspace Nav XPath' },
    { key: 'CONTROLS_XPATH', label: 'Controls XPath' },
    { key: 'PROMPT_ACTIVE_XPATH', label: 'Prompt Active XPath' },
    { key: 'PROJECT_NAME_XPATH', label: 'Project Name XPath' },
    { key: 'REQUIRED_DOMAIN', label: 'Required Domain' },
    { key: 'SETTINGS_PATH', label: 'Settings Path' },
    { key: 'DEFAULT_VIEW', label: 'Default View' }
  ];
  const xpInputs: Record<string, HTMLInputElement> = {};
  xpFields.forEach(function(f: { key: string; label: string }) {
    const field = makeField(f.label, (CONFIG as Record<string, any>)[f.key]);
    xpInputs[f.key] = field.input;
    p1.appendChild(field.row);
  });
  panels.push(p1);

  // ── Panel 2: Timing ──
  const p2 = document.createElement('div');
  const tmFields = [
    { key: 'LOOP_INTERVAL', label: 'Loop Interval (ms)', hint: 'Time between each cycle' },
    { key: 'COUNTDOWN_INTERVAL', label: 'Countdown Interval (ms)' },
    { key: 'FIRST_CYCLE_DELAY', label: 'First Cycle Delay (ms)' },
    { key: 'POST_COMBO_DELAY', label: 'Post Combo Delay (ms)' },
    { key: 'PAGE_LOAD_DELAY', label: 'Page Load Delay (ms)' },
    { key: 'DIALOG_WAIT', label: 'Dialog Wait (ms)' },
    { key: 'WS_CHECK_INTERVAL', label: 'Workspace Check Interval (ms)', hint: 'How often credit status refreshes' }
  ];
  const tmInputs: Record<string, HTMLInputElement> = {};
  tmFields.forEach(function(f: { key: string; label: string; hint?: string }) {
    const field = makeField(f.label, String((TIMING as Record<string, any>)[f.key] || 0), { type: 'number', hint: f.hint });
    tmInputs[f.key] = field.input;
    p2.appendChild(field.row);
  });
  panels.push(p2);

  // ── Panel 3: Task Next ──
  const p3 = document.createElement('div');
  const tnFields = [
    { key: 'preClickDelayMs', label: 'Pre-Click Delay (ms)', hint: 'Wait before clicking Add To Tasks' },
    { key: 'postClickDelayMs', label: 'Post-Click Delay (ms)', hint: 'Wait between each task iteration' },
    { key: 'retryCount', label: 'Retry Count', hint: 'Number of retries if button not found' },
    { key: 'retryDelayMs', label: 'Retry Delay (ms)' },
    { key: 'buttonXPath', label: 'Add To Tasks Button XPath' },
    { key: 'promptSlug', label: 'Prompt Slug', hint: 'Slug of the "next tasks" prompt' }
  ];
  const tnInputs: Record<string, HTMLInputElement> = {};
  tnFields.forEach(function(f: { key: string; label: string; hint?: string }) {
    const isNum = f.key !== 'buttonXPath' && f.key !== 'promptSlug';
    const field = makeField(f.label, String((taskNextState.settings as Record<string, any>)[f.key] || ''), { type: isNum ? 'number' : 'text', hint: f.hint });
    tnInputs[f.key] = field.input;
    p3.appendChild(field.row);
  });
  panels.push(p3);

  // ── Panel 4: Logging ──
  const pLog = document.createElement('div');
  const logCfg = getLogConfig();

  function makeToggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid ' + cPanelBorder + ';';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:' + cPanelText + ';';
    lbl.textContent = label;
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.checked = checked;
    sw.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:' + cPrimary + ';';
    sw.onchange = function() { onChange(sw.checked); };
    row.appendChild(lbl);
    row.appendChild(sw);
    return row;
  }

  // Section: Master toggles
  const masterTitle = document.createElement('div');
  masterTitle.style.cssText = 'font-size:11px;font-weight:700;color:' + cSectionHeader + ';margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;';
  masterTitle.textContent = 'Master Controls';
  pLog.appendChild(masterTitle);

  const logToggles: Record<string, HTMLInputElement> = {};

  const masterFields = [
    { key: 'enabled', label: 'Logging Enabled', value: logCfg.enabled },
    { key: 'consoleOutput', label: 'Console Output', value: logCfg.consoleOutput },
    { key: 'persistLogs', label: 'Persist to Storage', value: logCfg.persistLogs },
    { key: 'activityLogUi', label: 'Activity Log Panel', value: logCfg.activityLogUi },
  ];
  masterFields.forEach(function(f) {
    const row = makeToggle(f.label, f.value, function() {});
    const inp = row.querySelector('input') as HTMLInputElement;
    logToggles[f.key] = inp;
    pLog.appendChild(row);
  });

  // Section: Per-level toggles
  const levelTitle = document.createElement('div');
  levelTitle.style.cssText = 'font-size:11px;font-weight:700;color:' + cSectionHeader + ';margin-top:14px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;';
  levelTitle.textContent = 'Log Levels';
  pLog.appendChild(levelTitle);

  const levelKeys = ['debug', 'info', 'warn', 'error', 'success', 'delegate', 'check', 'skip', 'sub'];
  const levelToggles: Record<string, HTMLInputElement> = {};
  levelKeys.forEach(function(key) {
    const row = makeToggle(key.charAt(0).toUpperCase() + key.slice(1), logCfg.levels[key] !== false, function() {});
    const inp = row.querySelector('input') as HTMLInputElement;
    levelToggles[key] = inp;
    pLog.appendChild(row);
  });

  // Reset button
  const resetLogBtn = document.createElement('button');
  resetLogBtn.textContent = '↺ Reset Logging Defaults';
  resetLogBtn.style.cssText = btnStyle + 'background:' + cWarning + ';color:#1e1e2e;padding:5px 12px;font-size:11px;margin-top:12px;';
  resetLogBtn.onclick = function() {
    resetLogConfig();
    const fresh = getLogConfig();
    masterFields.forEach(function(f) { logToggles[f.key].checked = (fresh as Record<string, any>)[f.key]; });
    levelKeys.forEach(function(k) { levelToggles[k].checked = fresh.levels[k] !== false; });
    showToast('Logging reset to defaults', 'info');
  };
  pLog.appendChild(resetLogBtn);

  panels.push(pLog);

  // ── Panel 5: General ──
  const p4 = document.createElement('div');
  const promptsCfg = getPromptsConfig();
  const genFields = [
    { key: 'pasteTargetXPath', label: 'Chatbox / Paste Target XPath', value: promptsCfg.pasteTargetXPath || '' },
    { key: 'pasteTargetSelector', label: 'Chatbox CSS Selector (fallback)', value: promptsCfg.pasteTargetSelector || '' }
  ];
  const genInputs: Record<string, HTMLInputElement> = {};
  genFields.forEach(function(f: { key: string; label: string; value: string }) {
    const field = makeField(f.label, f.value);
    genInputs[f.key] = field.input;
    p4.appendChild(field.row);
  });
  // Version info
  const verInfo = document.createElement('div');
  verInfo.style.cssText = 'margin-top:16px;padding:10px;background:' + cPanelBgAlt + ';border-radius:6px;font-size:10px;color:#64748b;';
  verInfo.innerHTML = '<strong style="color:' + cPrimaryLight + '">MacroLoop</strong> v' + VERSION + '<br>Changes are saved to the running instance. For permanent changes, update the config JSON or extension settings.';
  p4.appendChild(verInfo);
  panels.push(p4);

  panels.forEach(function(p) { tabPanels.appendChild(p); });
  dialog.appendChild(tabPanels);

  // Footer with Save / Reset / Cancel
  const footer = document.createElement('div');
  footer.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;padding:12px 20px;border-top:1px solid ' + cPanelBorder + ';flex-shrink:0;';

  const cancelBtn2 = document.createElement('button');
  cancelBtn2.textContent = 'Cancel';
  cancelBtn2.style.cssText = btnStyle + 'background:' + cNeutral600 + ';color:' + cPanelFg + ';padding:6px 16px;font-size:12px;';
  cancelBtn2.onclick = function() { overlay.remove(); };

  const resetBtn = document.createElement('button');
  resetBtn.textContent = '↺ Reset';
  resetBtn.title = 'Reset fields to current running values';
  resetBtn.style.cssText = btnStyle + 'background:' + cWarning + ';color:#1e1e2e;padding:6px 16px;font-size:12px;';
  resetBtn.onclick = function() {
    for (const k in xpInputs) xpInputs[k].value = (CONFIG as Record<string, any>)[k] || '';
    for (const k in tmInputs) tmInputs[k].value = String((TIMING as Record<string, any>)[k] || 0);
    for (const k in tnInputs) tnInputs[k].value = String((taskNextState.settings as Record<string, any>)[k] || '');
    const curLog = getLogConfig();
    masterFields.forEach(function(f) { logToggles[f.key].checked = (curLog as Record<string, any>)[f.key]; });
    levelKeys.forEach(function(k) { levelToggles[k].checked = curLog.levels[k] !== false; });
    showToast('Fields reset to current values', 'info');
  };

  const saveBtn2 = document.createElement('button');
  saveBtn2.textContent = '💾 Save';
  saveBtn2.style.cssText = btnStyle + 'background:' + cSuccess + ';color:#1e1e2e;padding:6px 20px;font-size:12px;font-weight:600;';
  saveBtn2.onclick = function() {
    // Apply XPaths
    for (const k in xpInputs) {
      (CONFIG as Record<string, any>)[k] = xpInputs[k].value;
    }
    const pInp = document.getElementById('xpath-project-btn') as HTMLInputElement;
    if (pInp) pInp.value = CONFIG.PROJECT_BUTTON_XPATH;
    const prInp = document.getElementById('xpath-progress-bar') as HTMLInputElement;
    if (prInp) prInp.value = CONFIG.PROGRESS_XPATH;
    const wInp = document.getElementById('xpath-workspace-name') as HTMLInputElement;
    if (wInp) wInp.value = CONFIG.WORKSPACE_XPATH;

    // Apply Timing
    for (const k in tmInputs) {
      const val = parseInt(tmInputs[k].value, 10);
      if (!isNaN(val) && val >= 0) (TIMING as Record<string, any>)[k] = val;
    }

    // Apply Task Next settings
    for (const k in tnInputs) {
      const isNum = k !== 'buttonXPath' && k !== 'promptSlug';
      if (isNum) {
        const v = parseInt(tnInputs[k].value, 10);
        if (!isNaN(v)) (taskNextState.settings as Record<string, any>)[k] = v;
      } else {
        (taskNextState.settings as Record<string, any>)[k] = tnInputs[k].value;
      }
    }
    saveTaskNextSettings(taskNextDeps);

    // Apply Logging settings
    const logUpdate: Partial<LogManagerConfig> = {
      enabled: logToggles.enabled.checked,
      consoleOutput: logToggles.consoleOutput.checked,
      persistLogs: logToggles.persistLogs.checked,
      activityLogUi: logToggles.activityLogUi.checked,
      levels: {},
    };
    levelKeys.forEach(function(k: string) { logUpdate.levels![k] = levelToggles[k].checked; });
    updateLogConfig(logUpdate);

    // Save chatbox XPath to extension if changed
    const newChatXPath = genInputs.pasteTargetXPath.value;
    if (newChatXPath) {
      sendToExtension('KV_SET', { key: 'chatbox_xpath_override', value: newChatXPath, projectId: '_global' }, function() {});
    }

    log('Settings saved — XPaths: ' + Object.keys(xpInputs).length + ', Timing: ' + Object.keys(tmInputs).length + ', TaskNext updated', 'info');
    showToast('✅ Settings saved', 'info');
    overlay.remove();
  };

  footer.appendChild(cancelBtn2);
  footer.appendChild(resetBtn);
  footer.appendChild(saveBtn2);
  dialog.appendChild(footer);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
  switchTab(0);

  // ESC to close
  function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onEsc); } }
  document.addEventListener('keydown', onEsc);
}
