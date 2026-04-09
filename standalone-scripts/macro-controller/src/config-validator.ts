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
import { SUPPORTED_CONFIG_SCHEMA, SUPPORTED_THEME_SCHEMA } from './constants';

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
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;

  for (const key of Object.keys(source)) {
    const srcVal = (source as Record<string, unknown>)[key];
    const tgtVal = result[key];

    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else if (srcVal !== undefined) {
      result[key] = srcVal;
    }
  }

  return result as T;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// ── Default config (matches 02-macro-controller-config.json) ──

const DEFAULT_MACRO_LOOP = {
  creditBarWidthPx: 160,
  retry: { maxRetries: 3, backoffMs: 2000 },
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
  general: { logLevel: 'info', maxRetries: 3 },
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
export function validateConfig(raw: unknown): MacroControllerConfig {
  if (!isPlainObject(raw)) {
    warn('Config: received non-object — using all defaults');
    return { ...DEFAULT_CONFIG };
  }

  const cfg = raw as Partial<MacroControllerConfig>;

  // Schema version check
  if (cfg.schemaVersion !== undefined) {
    validateSchemaVersion('Config', cfg.schemaVersion, SUPPORTED_CONFIG_SCHEMA);
  }

  // Type-check critical fields
  validateFieldType(cfg as Record<string, unknown>, 'macroLoop', 'object', 'Config');
  validateFieldType(cfg as Record<string, unknown>, 'general', 'object', 'Config');
  validateFieldType(cfg as Record<string, unknown>, 'autoAttach', 'object', 'Config');

  return deepMerge(DEFAULT_CONFIG as Record<string, unknown>, cfg as Record<string, unknown>) as unknown as MacroControllerConfig;
}

/**
 * Validate and deep-merge theme with defaults.
 * Warns on schema version mismatch, missing presets, or invalid activePreset.
 */
export function validateTheme(raw: unknown): MacroThemeRoot {
  if (!isPlainObject(raw)) {
    warn('Theme: received non-object — using all defaults');
    return { ...DEFAULT_THEME };
  }

  const theme = raw as Partial<MacroThemeRoot>;

  // Schema version check
  if (theme.schemaVersion !== undefined) {
    validateSchemaVersion('Theme', theme.schemaVersion, SUPPORTED_THEME_SCHEMA);
  }

  // Validate activePreset
  if (theme.activePreset && theme.activePreset !== 'dark' && theme.activePreset !== 'light') {
    warn('Theme: activePreset "' + theme.activePreset + '" is not "dark" or "light" — falling back to "dark"');
    theme.activePreset = 'dark';
  }

  // Ensure presets object has at least the active preset
  const merged = deepMerge(DEFAULT_THEME as Record<string, unknown>, theme as Record<string, unknown>) as unknown as MacroThemeRoot;
  const activeKey = (merged.activePreset || 'dark') as string;
  if (merged.presets && !(merged.presets as Record<string, unknown>)[activeKey]) {
    warn('Theme: active preset "' + activeKey + '" not found in presets — using default');
    (merged.presets as Record<string, unknown>)[activeKey] = DEFAULT_THEME_PRESET;
  }

  return merged;
}

// ── Internal helpers ──

function validateSchemaVersion(label: string, version: unknown, supported: number): void {
  if (typeof version !== 'number') {
    warn(label + ': schemaVersion is not a number (got ' + typeof version + ')');
    return;
  }
  if (version > supported) {
    warn(label + ': schemaVersion ' + version + ' is newer than supported (' + supported + ') — some fields may be ignored');
  }
}

function validateFieldType(
  obj: Record<string, unknown>,
  field: string,
  expected: string,
  label: string,
): void {
  const val = obj[field];
  if (val === undefined || val === null) return;
  const actual = Array.isArray(val) ? 'array' : typeof val;
  if (actual !== expected) {
    warn(label + '.' + field + ': expected ' + expected + ', got ' + actual + ' — using default');
    delete obj[field];
  }
}
