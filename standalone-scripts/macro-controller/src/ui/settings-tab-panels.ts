/**
 * MacroLoop Controller — Settings Tab Panel Builders
 *
 * Individual panel builders for each settings tab: XPaths, Timing,
 * Task Next, Logging, Config (DB), and General.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { taskNextState } from './task-next-ui';
import { getBackdropOpacity, setBackdropOpacity } from './panel-layout';
import type { ExtensionResponse, ResolvedPromptsConfig } from '../types';
import { getLogConfig, resetLogConfig, type LogManagerConfig } from '../log-manager';
import {
  CONFIG,
  TIMING,
  VERSION,
  cPanelBgAlt,
  cPanelBorder,
  cPanelText,
  cPrimary,
  cPrimaryLight,
  cSectionHeader,
  cWarning,
  state,
} from '../shared-state';
import type { SettingsDeps, MakeFieldFn } from './settings-ui';
import { CssFragment } from '../types';
// ── Panel Results ──

export interface XPathPanelResult {
  panel: HTMLElement;
  inputs: Record<string, HTMLInputElement>;
}

export interface TimingPanelResult {
  panel: HTMLElement;
  inputs: Record<string, HTMLInputElement>;
}

export interface TaskNextPanelResult {
  panel: HTMLElement;
  inputs: Record<string, HTMLInputElement>;
}

export interface LoggingPanelResult {
  panel: HTMLElement;
  logToggles: Record<string, HTMLInputElement>;
  levelToggles: Record<string, HTMLInputElement>;
  masterFields: Array<{ key: string; label: string; value: boolean }>;
  levelKeys: string[];
}

export interface ConfigDbPanelResult {
  panel: HTMLElement;
  configInputs: Array<{ section: string; key: string; input: HTMLInputElement; valueType: string }>;
}

export interface GeneralPanelResult {
  panel: HTMLElement;
  inputs: Record<string, HTMLInputElement>;
}

// ── XPaths Panel ──

export function buildXPathsPanel(makeField: MakeFieldFn): XPathPanelResult {
  const panel = document.createElement('div');
  const fields = [
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
  const inputs: Record<string, HTMLInputElement> = {};
  fields.forEach(function(f) {
    const field = makeField(f.label, String(CONFIG[f.key] || ''));
    inputs[f.key] = field.input;
    panel.appendChild(field.row);
  });
  return { panel, inputs };
}

// ── Timing Panel ──

export function buildTimingPanel(makeField: MakeFieldFn): TimingPanelResult {
  const panel = document.createElement('div');
  const fields = [
    { key: 'LOOP_INTERVAL', label: 'Loop Interval (ms)', hint: 'Time between each cycle' },
    { key: 'COUNTDOWN_INTERVAL', label: 'Countdown Interval (ms)' },
    { key: 'FIRST_CYCLE_DELAY', label: 'First Cycle Delay (ms)' },
    { key: 'POST_COMBO_DELAY', label: 'Post Combo Delay (ms)' },
    { key: 'PAGE_LOAD_DELAY', label: 'Page Load Delay (ms)' },
    { key: 'DIALOG_WAIT', label: 'Dialog Wait (ms)' },
    { key: 'WS_CHECK_INTERVAL', label: 'Workspace Check Interval (ms)', hint: 'How often credit status refreshes' },
    { key: 'REDOCK_POLL_INTERVAL', label: 'Re-Dock Poll Interval (ms)', hint: 'How often to check for XPath target when floating' },
    { key: 'REDOCK_MAX_ATTEMPTS', label: 'Re-Dock Max Attempts', hint: 'Max polls before staying in floating mode' },
  ];
  const inputs: Record<string, HTMLInputElement> = {};
  fields.forEach(function(f) {
    const field = makeField(f.label, String(TIMING[f.key] || 0), { type: 'number', hint: f.hint });
    inputs[f.key] = field.input;
    panel.appendChild(field.row);
  });
  return { panel, inputs };
}

// ── Task Next Panel ──

export function buildTaskNextPanel(makeField: MakeFieldFn): TaskNextPanelResult {
  const panel = document.createElement('div');
  const fields = [
    { key: 'preClickDelayMs', label: 'Pre-Click Delay (ms)', hint: 'Wait before clicking Add To Tasks' },
    { key: 'postClickDelayMs', label: 'Post-Click Delay (ms)', hint: 'Wait between each task iteration' },
    { key: 'retryCount', label: 'Retry Count', hint: 'Number of retries if button not found' },
    { key: 'retryDelayMs', label: 'Retry Delay (ms)' },
    { key: 'buttonXPath', label: 'Add To Tasks Button XPath' },
    { key: 'promptSlug', label: 'Prompt Slug', hint: 'Slug of the "next tasks" prompt' }
  ];
  const inputs: Record<string, HTMLInputElement> = {};
  fields.forEach(function(f) {
    const isNum = f.key !== 'buttonXPath' && f.key !== 'promptSlug';
    const field = makeField(f.label, String(taskNextState.settings[f.key] || ''), { type: isNum ? 'number' : 'text', hint: f.hint });
    inputs[f.key] = field.input;
    panel.appendChild(field.row);
  });
  return { panel, inputs };
}

// ── Logging Panel ──

// eslint-disable-next-line max-lines-per-function
export function buildLoggingPanel(deps: SettingsDeps): LoggingPanelResult {
  const { btnStyle, showToast } = deps;
  const panel = document.createElement('div');
  const logCfg = getLogConfig();

  const makeToggle = function(label: string, checked: boolean): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid ' + cPanelBorder + ';';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:11px;color:' + cPanelText + ';';
    lbl.textContent = label;
    const sw = document.createElement('input');
    sw.type = 'checkbox';
    sw.checked = checked;
    sw.style.cssText = 'width:16px;height:16px;cursor:pointer;accent-color:' + cPrimary + ';';
    row.appendChild(lbl);
    row.appendChild(sw);
    return row;
  };

  const masterTitle = document.createElement('div');
  masterTitle.style.cssText = CssFragment.FontSize11pxFontWeight700Color + cSectionHeader + ';margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;';
  masterTitle.textContent = 'Master Controls';
  panel.appendChild(masterTitle);

  const logToggles: Record<string, HTMLInputElement> = {};
  const masterFields = [
    { key: 'enabled', label: 'Logging Enabled', value: logCfg.enabled },
    { key: 'consoleOutput', label: 'Console Output', value: logCfg.consoleOutput },
    { key: 'persistLogs', label: 'Persist to Storage', value: logCfg.persistLogs },
    { key: 'activityLogUi', label: 'Activity Log Panel', value: logCfg.activityLogUi },
  ];
  masterFields.forEach(function(f) {
    const row = makeToggle(f.label, f.value);
    const inp = row.querySelector('input') as HTMLInputElement;
    logToggles[f.key] = inp;
    panel.appendChild(row);
  });

  const levelTitle = document.createElement('div');
  levelTitle.style.cssText = CssFragment.FontSize11pxFontWeight700Color + cSectionHeader + ';margin-top:14px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;';
  levelTitle.textContent = 'Log Levels';
  panel.appendChild(levelTitle);

  const levelKeys = ['debug', 'info', 'warn', 'error', 'success', 'delegate', 'check', 'skip', 'sub'];
  const levelToggles: Record<string, HTMLInputElement> = {};
  levelKeys.forEach(function(key) {
    const row = makeToggle(key.charAt(0).toUpperCase() + key.slice(1), logCfg.levels[key] !== false);
    const inp = row.querySelector('input') as HTMLInputElement;
    levelToggles[key] = inp;
    panel.appendChild(row);
  });

  const resetLogBtn = document.createElement('button');
  resetLogBtn.textContent = '↺ Reset Logging Defaults';
  resetLogBtn.style.cssText = btnStyle + 'background:' + cWarning + ';color:#1e1e2e;padding:5px 12px;font-size:11px;margin-top:12px;';
  resetLogBtn.onclick = function() {
    resetLogConfig();
    const fresh = getLogConfig();
    masterFields.forEach(function(f) { logToggles[f.key].checked = Boolean(fresh[f.key as keyof LogManagerConfig]); });
    levelKeys.forEach(function(k) { levelToggles[k].checked = fresh.levels[k] !== false; });
    showToast('Logging reset to defaults', 'info');
  };
  panel.appendChild(resetLogBtn);

  return { panel, logToggles, levelToggles, masterFields, levelKeys };
}

// ── Config (DB) Panel ──

export function buildConfigDbPanel(
  deps: SettingsDeps,
  makeField: MakeFieldFn,
): ConfigDbPanelResult {
  const { sendToExtension } = deps;
  const panel = document.createElement('div');
  const configInputs: Array<{ section: string; key: string; input: HTMLInputElement; valueType: string }> = [];

  const loading = document.createElement('div');
  loading.style.cssText = 'color:#64748b;font-size:11px;padding:12px 0;';
  loading.textContent = '⏳ Loading config from database...';
  panel.appendChild(loading);

  sendToExtension('PROJECT_CONFIG_READ', { project: 'macro-controller' }).then(function(resp: ExtensionResponse) {
    loading.remove();
    const rows = resp.rows as Array<{ section: string; key: string; value: string; valueType: string }> | undefined;
    if (!resp || !resp.isOk || !rows || rows.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#64748b;font-size:11px;padding:12px 0;';
      empty.textContent = 'No config found in database. Config will be seeded on next injection.';
      panel.appendChild(empty);
      return;
    }

    const sections: Record<string, Array<{ key: string; value: string; valueType: string }>> = {};
    for (const row of rows) {
      if (!sections[row.section]) sections[row.section] = [];
      sections[row.section].push({ key: row.key, value: row.value, valueType: row.valueType });
    }

    for (const [sectionName, entries] of Object.entries(sections)) {
      renderConfigSection(panel, sectionName, entries, makeField, configInputs);
    }

    const configInfo = document.createElement('div');
    configInfo.style.cssText = 'margin-top:12px;padding:8px;background:' + cPanelBgAlt + ';border-radius:6px;font-size:9px;color:#64748b;';
    configInfo.textContent = rows.length + ' config entries loaded from project SQLite DB. Changes saved here persist across sessions.';
    panel.appendChild(configInfo);
  });

  return { panel, configInputs };
}

function renderConfigSection(
  panel: HTMLElement,
  sectionName: string,
  entries: Array<{ key: string; value: string; valueType: string }>,
  makeField: MakeFieldFn,
  configInputs: ConfigDbPanelResult['configInputs'],
): void {
  const sectionTitle = document.createElement('div');
  sectionTitle.style.cssText = CssFragment.FontSize11pxFontWeight700Color + cSectionHeader + ';margin-top:12px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;';
  sectionTitle.textContent = sectionName;
  panel.appendChild(sectionTitle);

  for (const entry of entries) {
    const isMultiline = entry.valueType === 'object' || entry.valueType === 'array' || entry.value.length > 80;
    const fieldOpts: { type?: string; hint?: string; multiline?: boolean } = {};
    if (isMultiline) fieldOpts.multiline = true;
    if (entry.valueType === 'number') fieldOpts.type = 'number';
    if (entry.valueType === 'boolean') fieldOpts.type = 'text';
    fieldOpts.hint = entry.valueType;

    const field = makeField(entry.key, entry.value, fieldOpts);
    panel.appendChild(field.row);
    configInputs.push({ section: sectionName, key: entry.key, input: field.input, valueType: entry.valueType });
  }
}

// ── General Panel ──

export function buildGeneralPanel(
  makeField: MakeFieldFn,
  getPromptsConfig: () => ResolvedPromptsConfig,
): GeneralPanelResult {
  const panel = document.createElement('div');
  const promptsCfg = getPromptsConfig();

  // Custom display name field
  const displayNameField = makeField('Custom Display Name', state.customDisplayName || '', {
    hint: 'Override the project name shown in the title bar. Leave empty to auto-detect.',
  });

  const fields = [
    { key: 'pasteTargetXPath', label: 'Chatbox / Paste Target XPath', value: promptsCfg.pasteTargetXPath || '' },
    { key: 'pasteTargetSelector', label: 'Chatbox CSS Selector (fallback)', value: promptsCfg.pasteTargetSelector || '' }
  ];
  const inputs: Record<string, HTMLInputElement> = {};

  // Add custom display name as first input
  inputs['customDisplayName'] = displayNameField.input;
  panel.appendChild(displayNameField.row);

  fields.forEach(function(f) {
    const field = makeField(f.label, f.value);
    inputs[f.key] = field.input;
    panel.appendChild(field.row);
  });

  panel.appendChild(_buildBackdropSlider());
  panel.appendChild(_buildVersionInfo());

  return { panel, inputs };
}

/** Builds the backdrop opacity slider row. */
function _buildBackdropSlider(): HTMLDivElement {
  const currentBackdropOpacity = getBackdropOpacity();
  const bdRow = document.createElement('div');
  bdRow.style.cssText = 'margin-top:14px;margin-bottom:10px;';
  const bdLabel = document.createElement('div');
  bdLabel.style.cssText = 'font-size:10px;color:' + cSectionHeader + ';margin-bottom:3px;font-weight:600;';
  bdLabel.textContent = 'Backdrop Opacity';
  bdRow.appendChild(bdLabel);

  const bdSliderRow = document.createElement('div');
  bdSliderRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

  const bdSlider = document.createElement('input');
  bdSlider.type = 'range';
  bdSlider.min = '0';
  bdSlider.max = '100';
  bdSlider.value = String(Math.round(currentBackdropOpacity * 100));
  bdSlider.style.cssText = 'flex:1;height:6px;accent-color:' + cPrimary + ';cursor:pointer;';

  const bdValueLabel = document.createElement('span');
  bdValueLabel.style.cssText = 'font-size:11px;color:' + cPanelText + ';min-width:36px;text-align:right;font-family:monospace;';
  bdValueLabel.textContent = bdSlider.value + '%';

  bdSlider.oninput = function() {
    const pct = parseInt(bdSlider.value, 10);
    bdValueLabel.textContent = pct + '%';
    setBackdropOpacity(pct / 100);
  };

  bdSliderRow.appendChild(bdSlider);
  bdSliderRow.appendChild(bdValueLabel);
  bdRow.appendChild(bdSliderRow);

  const bdHint = document.createElement('div');
  bdHint.style.cssText = 'font-size:9px;color:#64748b;margin-top:2px;';
  bdHint.textContent = 'Dark overlay behind the floating panel. 0% = transparent, 100% = opaque.';
  bdRow.appendChild(bdHint);

  return bdRow;
}

/** Builds the version info footer. */
function _buildVersionInfo(): HTMLDivElement {
  const verInfo = document.createElement('div');
  verInfo.style.cssText = 'margin-top:16px;padding:10px;background:' + cPanelBgAlt + ';border-radius:6px;font-size:10px;color:#64748b;';
  verInfo.innerHTML = '<strong style="color:' + cPrimaryLight + '">MacroLoop</strong> v' + VERSION + '<br>Changes are saved to the running instance. For permanent changes, update the config JSON or extension settings.';
  return verInfo;
}
