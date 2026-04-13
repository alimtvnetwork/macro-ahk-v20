/**
 * MacroLoop Controller — Config & Theme Validation (V2 Phase 05)
 *
 * Provides deep-merge with defaults and runtime validation for
 * window.__MARCO_CONFIG__ and window.__MARCO_THEME__.
 *
 * Validation warnings are routed to the activity log (not console spam).
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-json-config-pipeline.md
 */

import type { MacroControllerConfig, MacroThemeRoot, ThemePreset } from './types';
import { DEFAULT_GENERAL_CONFIG } from './types';

// ── Supported schema versions ──
const SUPPORTED_CONFIG_SCHEMA = 1;
const SUPPORTED_THEME_SCHEMA = 2;

// ── Validation warning collector ──
const validationWarnings: string[] = [];

/** Get and clear accumulated validation warnings. */
export function drainValidationWarnings(): string[] {
  return validationWarnings.splice(0);
}

function warn(msg: string): void {
  validationWarnings.push(msg);
}

// ── Deep merge utility ──

/**
 * Recursively merge `source` into `target`, preferring source values.
 * Arrays are replaced (not merged). Only plain objects are recursed.
 */
/** Internal record type for deep-merge key iteration. */
type MergeableRecord = Record<string, string | number | boolean | null | undefined | object>;

function deepMerge<T extends MergeableRecord>(target: T, source: Partial<T>): T {
  const result = { ...target } as MergeableRecord;

  for (const key of Object.keys(source)) {
    const srcVal = (source as MergeableRecord)[key];
    const tgtVal = result[key];

    const areBothPlainObjects = isPlainObject(srcVal) && isPlainObject(tgtVal);

    if (areBothPlainObjects) {
      result[key] = deepMerge(tgtVal as MergeableRecord, srcVal as MergeableRecord);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }

  return result as T;
}

function isPlainObject(v: string | number | boolean | object | null | undefined): v is Record<string, string | number | boolean | null | object> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── Default config (matches 02-macro-controller-config.json) ──

const DEFAULT_MACRO_LOOP = {
  creditBarWidthPx: 160,
  // retry config REMOVED per issue #88 — no retry/backoff in controller
  timing: {
    loopIntervalMs: 100000,
    countdownIntervalMs: 1000,
    firstCycleDelayMs: 200,
    postComboDelayMs: 4000,
    pageLoadDelayMs: 2500,
    dialogWaitMs: 3000,
    workspaceCheckIntervalMs: 5000,
    redockPollIntervalMs: 800,
    redockMaxAttempts: 30,
  },
  urls: {
    requiredDomain: 'https://lovable.dev/',
    settingsTabPath: '/settings?tab=project',
    defaultView: '?view=codeEditor',
  },
  xpaths: {},
  elementIds: {
    scriptMarker: 'ahk-loop-script',
    container: 'ahk-loop-container',
    status: 'ahk-loop-status',
    startBtn: 'ahk-loop-start-btn',
    stopBtn: 'ahk-loop-stop-btn',
    upBtn: 'ahk-loop-up-btn',
    downBtn: 'ahk-loop-down-btn',
    recordIndicator: 'ahk-loop-record',
    jsExecutor: 'ahk-loop-js-executor',
    jsExecuteBtn: 'ahk-loop-js-execute-btn',
  },
};

const DEFAULT_CONFIG: MacroControllerConfig = {
  schemaVersion: SUPPORTED_CONFIG_SCHEMA,
  macroLoop: DEFAULT_MACRO_LOOP as MacroControllerConfig['macroLoop'],
  general: DEFAULT_GENERAL_CONFIG,
};

// ── Default theme ──

const DEFAULT_THEME_PRESET: ThemePreset = {
  colors: {
    panel: {
      background: '#1e1e2e',
      backgroundAlt: '#252536',
      border: '#313147',
      foreground: '#e8e8e8',
      foregroundMuted: '#f5e6b8',
      foregroundDim: '#9e9e9e',
      textBody: '#d9d9d9',
    },
    primary: { base: '#007acc', light: '#3daee9' },
    status: {
      success: '#4ec9b0',
      warning: '#dcdcaa',
      error: '#f44747',
      info: '#569cd6',
    },
  },
};

const DEFAULT_THEME: MacroThemeRoot = {
  schemaVersion: SUPPORTED_THEME_SCHEMA,
  activePreset: 'dark',
  presets: { dark: DEFAULT_THEME_PRESET },
};

// ── Public API ──

/**
 * Validate and deep-merge config with defaults.
 * Warns on schema version mismatch or unexpected types.
 */
export function validateConfig(raw: Partial<MacroControllerConfig>): MacroControllerConfig {
  // Schema version check
  if (raw.schemaVersion !== undefined) {
    validateSchemaVersion('Config', raw.schemaVersion, SUPPORTED_CONFIG_SCHEMA);
  }

  // Type-check critical fields
  validateFieldType(raw as MergeableRecord, 'macroLoop', 'object', 'Config');
  validateFieldType(raw as MergeableRecord, 'general', 'object', 'Config');
  validateFieldType(raw as MergeableRecord, 'autoAttach', 'object', 'Config');

  return deepMerge(DEFAULT_CONFIG as MergeableRecord, raw as MergeableRecord) as MacroControllerConfig;
}

/**
 * Validate and deep-merge theme with defaults.
 * Warns on schema version mismatch, missing presets, or invalid activePreset.
 */
export function validateTheme(raw: Partial<MacroThemeRoot>): MacroThemeRoot {
  // Schema version check
  if (raw.schemaVersion !== undefined) {
    validateSchemaVersion('Theme', raw.schemaVersion, SUPPORTED_THEME_SCHEMA);
  }

  // Validate activePreset
  const hasActivePreset = raw.activePreset !== undefined;
  const isKnownPreset = raw.activePreset === 'dark' || raw.activePreset === 'light';
  const isUnknownPreset = hasActivePreset && !isKnownPreset;

  if (isUnknownPreset) {
    warn('Theme: activePreset "' + raw.activePreset + '" is not "dark" or "light" — falling back to "dark"');
    raw.activePreset = 'dark';
  }

  // Ensure presets object has at least the active preset
  const merged = deepMerge(DEFAULT_THEME as MergeableRecord, raw as MergeableRecord) as MacroThemeRoot;
  const activeKey = (merged.activePreset || 'dark') as string;
  const isActivePresetMissing = merged.presets && !(merged.presets as MergeableRecord)[activeKey];

  if (isActivePresetMissing) {
    warn('Theme: active preset "' + activeKey + '" not found in presets — using default');
    (merged.presets as MergeableRecord)[activeKey] = DEFAULT_THEME_PRESET;
  }

  return merged;
}

// ── Internal helpers ──

function validateSchemaVersion(label: string, version: number, supported: number): void {
  const isNewerThanSupported = version > supported;

  if (isNewerThanSupported) {
    warn(label + ': schemaVersion ' + version + ' is newer than supported (' + supported + ') — some fields may be ignored');
  }
}

function validateFieldType(
  obj: MergeableRecord,
  field: string,
  expected: string,
  label: string,
): void {
  const val = obj[field];
  if (val == null) {
    return;
  }
  const actual = Array.isArray(val) ? 'array' : typeof val;
  if (actual !== expected) {
    warn(label + '.' + field + ': expected ' + expected + ', got ' + actual + ' — using default');
    delete obj[field];
  }
}
