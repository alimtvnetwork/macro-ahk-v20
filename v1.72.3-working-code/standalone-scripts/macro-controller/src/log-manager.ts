/**
 * MacroLoop Controller — LogManager
 *
 * Configurable logging system with:
 * - Per-level enable/disable (debug, info, warn, error, success, delegate, check, skip, sub)
 * - Global enable/disable toggle
 * - Console output toggle
 * - Persistence toggle
 * - Activity log UI toggle
 * - Settings persisted to localStorage
 *
 * All log calls flow through LogManager.shouldLog() before executing.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type LogLevel =
  | 'debug' | 'info' | 'warn' | 'error'
  | 'success' | 'delegate' | 'check' | 'skip' | 'sub'
  | 'INFO' | 'ERROR' | 'WARN' | 'DEBUG' | 'SUB';

export interface LogManagerConfig {
  /** Master switch — disables all logging when false */
  enabled: boolean;
  /** Write to browser console */
  consoleOutput: boolean;
  /** Persist logs to localStorage */
  persistLogs: boolean;
  /** Show entries in the activity log UI panel */
  activityLogUi: boolean;
  /** Per-level toggles (normalized to lowercase) */
  levels: Record<string, boolean>;
}

const STORAGE_KEY = 'marco_log_manager_config';

const DEFAULT_CONFIG: LogManagerConfig = {
  enabled: true,
  consoleOutput: true,
  persistLogs: true,
  activityLogUi: true,
  levels: {
    debug: true,
    info: true,
    warn: true,
    error: true,
    success: true,
    delegate: true,
    check: true,
    skip: true,
    sub: true,
  },
};

/* ------------------------------------------------------------------ */
/*  Singleton State                                                    */
/* ------------------------------------------------------------------ */

let _config: LogManagerConfig = { ...DEFAULT_CONFIG, levels: { ...DEFAULT_CONFIG.levels } };

/** Load persisted config from localStorage on init */
function loadConfig(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LogManagerConfig>;
      _config = {
        enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
        consoleOutput: parsed.consoleOutput ?? DEFAULT_CONFIG.consoleOutput,
        persistLogs: parsed.persistLogs ?? DEFAULT_CONFIG.persistLogs,
        activityLogUi: parsed.activityLogUi ?? DEFAULT_CONFIG.activityLogUi,
        levels: { ...DEFAULT_CONFIG.levels, ...(parsed.levels || {}) },
      };
    }
  } catch (_e) { /* ignore parse errors, use defaults */ }
}

/** Persist current config to localStorage */
function saveConfig(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_config));
  } catch (_e) { /* quota or unavailable */ }
}

// Auto-load on module init
loadConfig();

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Check if a log at the given level should be emitted */
export function shouldLog(level?: string): boolean {
  if (!_config.enabled) return false;
  if (!level) return true;
  const normalized = level.toLowerCase();
  // If the level isn't in our map, default to allowing it
  if (_config.levels[normalized] === undefined) return true;
  return _config.levels[normalized];
}

/** Check if console output is enabled */
export function shouldConsole(): boolean {
  return _config.enabled && _config.consoleOutput;
}

/** Check if log persistence is enabled */
export function shouldPersist(): boolean {
  return _config.enabled && _config.persistLogs;
}

/** Check if activity log UI should receive entries */
export function shouldActivityUi(): boolean {
  return _config.enabled && _config.activityLogUi;
}

/** Get a read-only copy of current config */
export function getLogConfig(): LogManagerConfig {
  return { ..._config, levels: { ..._config.levels } };
}

/** Update config (partial merge) and persist */
export function updateLogConfig(partial: Partial<LogManagerConfig>): void {
  if (partial.enabled !== undefined) _config.enabled = partial.enabled;
  if (partial.consoleOutput !== undefined) _config.consoleOutput = partial.consoleOutput;
  if (partial.persistLogs !== undefined) _config.persistLogs = partial.persistLogs;
  if (partial.activityLogUi !== undefined) _config.activityLogUi = partial.activityLogUi;
  if (partial.levels) {
    for (const key of Object.keys(partial.levels)) {
      _config.levels[key.toLowerCase()] = partial.levels[key];
    }
  }
  saveConfig();
}

/** Toggle a specific log level */
export function toggleLevel(level: string, enabled: boolean): void {
  _config.levels[level.toLowerCase()] = enabled;
  saveConfig();
}

/** Toggle the master switch */
export function toggleLogging(enabled: boolean): void {
  _config.enabled = enabled;
  saveConfig();
}

/** Reset to defaults */
export function resetLogConfig(): void {
  _config = { ...DEFAULT_CONFIG, levels: { ...DEFAULT_CONFIG.levels } };
  saveConfig();
}
