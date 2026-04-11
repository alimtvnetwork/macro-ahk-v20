/**
 * Macro Controller — Config & Theme Type Definitions
 *
 * Phase 5E: Extracted from types.ts.
 * Contains all configuration interfaces (MacroControllerConfig tree),
 * theme interfaces (MacroThemeRoot tree), and runtime config dictionaries.
 */

/* ================================================================== */
/*  Config Types (from 02-macro-controller-config.json)                */
/* ================================================================== */

export interface MacroControllerConfig {
  schemaVersion?: number;
  description?: string;
  comboSwitch?: ComboSwitchConfig;
  macroLoop?: MacroLoopConfig;
  creditStatus?: CreditStatusConfig;
  general?: GeneralConfig;
  autoAttach?: AutoAttachConfig;
  prompts?: PromptsConfig;
  authBridge?: AuthBridgeConfig;
}

/** Auth Bridge configuration — TTL-aware token management. */
export interface AuthBridgeConfig {
  /** Token freshness TTL in milliseconds (default: 120000 = 2 minutes). */
  tokenTtlMs?: number;
}

export interface PromptsConfig {
  entries?: Partial<PromptEntry>[];
  prompts?: Partial<PromptEntry>[];
  pasteTargetXPath?: string;
  pasteTargetSelector?: string;
  pasteTarget?: { xpath?: string; selector?: string };
}

export interface ComboSwitchConfig {
  xpaths?: Record<string, string>;
  fallbacks?: Record<string, ComboFallback>;
  timing?: ComboSwitchTiming;
  elementIds?: Record<string, string>;
  shortcuts?: ComboShortcuts;
}

export interface ComboFallback {
  textMatch?: string[];
  tag?: string;
  ariaLabel?: string;
  headingSearch?: string;
  selector?: string;
  role?: string;
}

export interface ComboSwitchTiming {
  pollIntervalMs?: number;
  openMaxAttempts?: number;
  waitMaxAttempts?: number;
  retryCount?: number;
  retryDelayMs?: number;
  confirmDelayMs?: number;
}

export interface ComboShortcuts {
  focusTextboxKey?: string;
  comboUpKey?: string;
  comboDownKey?: string;
  shortcutModifier?: string;
}

export interface MacroLoopConfig {
  creditBarWidthPx?: number;
  retry?: RetryConfig;
  timing?: MacroLoopTiming;
  urls?: MacroLoopUrls;
  xpaths?: MacroLoopXPaths;
  elementIds?: MacroLoopElementIds;
}

export interface RetryConfig {
  maxRetries?: number;
  backoffMs?: number;
}

export interface MacroLoopTiming {
  loopIntervalMs?: number;
  countdownIntervalMs?: number;
  firstCycleDelayMs?: number;
  postComboDelayMs?: number;
  pageLoadDelayMs?: number;
  dialogWaitMs?: number;
  workspaceCheckIntervalMs?: number;
  redockPollIntervalMs?: number;
  redockMaxAttempts?: number;
}

export interface MacroLoopUrls {
  requiredDomain?: string;
  settingsTabPath?: string;
  defaultView?: string;
}

export interface MacroLoopXPaths {
  projectButton?: string;
  mainProgress?: string;
  progress?: string;
  workspace?: string;
  workspaceNav?: string;
  controls?: string;
  promptActive?: string;
  projectName?: string;
}

export interface MacroLoopElementIds {
  scriptMarker?: string;
  container?: string;
  status?: string;
  startBtn?: string;
  stopBtn?: string;
  upBtn?: string;
  downBtn?: string;
  recordIndicator?: string;
  jsExecutor?: string;
  jsExecuteBtn?: string;
}

export interface CreditStatusConfig {
  apiBase?: string;
  endpoints?: Record<string, string>;
  refreshIntervalMs?: number;
  balance?: CreditBalanceConfigInput;
}

export interface CreditBalanceConfigInput {
  checkIntervalSeconds?: number;
  minDailyCredit?: number;
  enableApiDetection?: boolean;
  fallbackToXPath?: boolean;
}

export interface GeneralConfig {
  logLevel?: string;
  maxRetries?: number;
}

export interface AutoAttachConfig {
  timing?: AutoAttachTiming;
  groups?: AutoAttachGroup[];
}

export interface AutoAttachTiming {
  checkIntervalMs?: number;
  maxAttachAttempts?: number;
}

export interface AutoAttachGroup {
  name?: string;
  urlPattern?: string;
  scripts?: string[];
}

/* ================================================================== */
/*  Theme Types (from 04-macro-theme.json, schema v2)                  */
/* ================================================================== */

export interface MacroThemeRoot {
  schemaVersion?: number;
  description?: string;
  activePreset?: "dark" | "light";
  presets?: Record<string, ThemePreset>;
  /** Schema v1 fallback: colors at root level */
  colors?: ThemeColors;
}

export interface ThemePreset {
  label?: string;
  colors?: ThemeColors;
  animations?: ThemeAnimations;
  transitions?: ThemeTransitions;
  layout?: ThemeLayout;
  typography?: ThemeTypography;
}

export interface ThemeColors {
  panel?: PanelColors;
  primary?: PrimaryColors;
  accent?: AccentColors;
  status?: StatusColors;
  neutral?: Record<string, string>;
  creditBar?: CreditBarColors;
  workspace?: Record<string, string>;
  log?: LogColors;
  countdownBar?: Record<string, string>;
  button?: ButtonColors;
  input?: InputColors;
  modal?: ModalColors;
  section?: SectionColors;
  separator?: string;
  orange?: string;
  cyan?: string;
  cyanLight?: string;
  skyLight?: string;
  greenBright?: string;
}

export interface PanelColors {
  background?: string;
  backgroundAlt?: string;
  border?: string;
  foreground?: string;
  foregroundMuted?: string;
  foregroundDim?: string;
  textBody?: string;
}

export interface PrimaryColors {
  base?: string;
  light?: string;
  lighter?: string;
  lightest?: string;
  dark?: string;
  glow?: string;
  glowStrong?: string;
  glowSubtle?: string;
  borderAlpha?: string;
  bgAlpha?: string;
  bgAlphaLight?: string;
  bgAlphaSubtle?: string;
  highlight?: string;
}

export interface AccentColors {
  purple?: string;
  purpleLight?: string;
  pink?: string;
}

export interface StatusColors {
  success?: string;
  successLight?: string;
  successMuted?: string;
  successDark?: string;
  successDarkest?: string;
  successBg?: string;
  warning?: string;
  warningLight?: string;
  warningPale?: string;
  warningDark?: string;
  warningDarkest?: string;
  warningBg?: string;
  error?: string;
  errorLight?: string;
  errorPale?: string;
  errorDark?: string;
  errorDarkest?: string;
  errorBg?: string;
  info?: string;
  infoLight?: string;
  infoPale?: string;
  infoDark?: string;
}

export interface CreditBarColors {
  bonus?: [string, string];
  billing?: [string, string];
  rollover?: [string, string];
  daily?: [string, string];
  available?: string;
  emptyTrack?: string;
}

export interface LogColors {
  default?: string;
  error?: string;
  info?: string;
  success?: string;
  debug?: string;
  warn?: string;
  delegate?: string;
  check?: string;
  skip?: string;
  timestamp?: string;
}

export interface ButtonColors {
  check?: { bg?: string; fg?: string; gradient?: string; glow?: string };
  credits?: { bg?: string; fg?: string; gradient?: string; glow?: string };
  prompts?: { bg?: string; fg?: string; gradient?: string; glow?: string };
  startStop?: { gradient?: string; glow?: string; stopGradient?: string; stopGlow?: string };
  menu?: { bg?: string; fg?: string };
  menuHover?: string;
  utilityBg?: string;
  utilityBorder?: string;
}

export interface InputColors {
  bg?: string;
  border?: string;
  fg?: string;
}

export interface ModalColors {
  bg?: string;
  border?: string;
}

export interface SectionColors {
  bg?: string;
  headerColor?: string;
  toggleColor?: string;
}

export interface ThemeAnimations {
  pulseGlow?: boolean;
  fadeIn?: boolean;
  slideDown?: boolean;
}

export interface ThemeTransitions {
  fast?: string;
  normal?: string;
  slow?: string;
}

export interface ThemeLayout {
  panelBorderRadius?: string;
  panelPadding?: string;
  panelMinWidth?: string;
  panelFloatingWidth?: string;
  panelShadow?: string;
  panelFloatShadow?: string;
  dropdownBorderRadius?: string;
  dropdownShadow?: string;
  modalBorderRadius?: string;
  modalShadow?: string;
  aboutGradient?: string;
}

export interface ThemeTypography {
  fontFamily?: string;
  fontFamilySystem?: string;
  fontSize?: string;
  fontSizeSmall?: string;
  fontSizeTiny?: string;
  fontSizeMicro?: string;
}

/* ================================================================== */
/*  Enums                                                              */
/* ================================================================== */

/** Loop scroll direction. */
export enum LoopDirection {
  Up = 'up',
  Down = 'down',
}

/* ================================================================== */
/*  Config Dictionaries (from shared-state.ts)                         */
/* ================================================================== */

export interface TimingConfig {
  [key: string]: number;
  LOOP_INTERVAL: number;
  COUNTDOWN_INTERVAL: number;
  FIRST_CYCLE_DELAY: number;
  POST_COMBO_DELAY: number;
  PAGE_LOAD_DELAY: number;
  DIALOG_WAIT: number;
  WS_CHECK_INTERVAL: number;
  REDOCK_POLL_INTERVAL: number;
  REDOCK_MAX_ATTEMPTS: number;
}

export interface XPathConfig {
  [key: string]: string;
  PROJECT_BUTTON_XPATH: string;
  MAIN_PROGRESS_XPATH: string;
  PROGRESS_XPATH: string;
  WORKSPACE_XPATH: string;
  WORKSPACE_NAV_XPATH: string;
  CONTROLS_XPATH: string;
  PROMPT_ACTIVE_XPATH: string;
  PROJECT_NAME_XPATH: string;
  REQUIRED_DOMAIN: string;
  SETTINGS_PATH: string;
  DEFAULT_VIEW: string;
}

export interface ElementIds {
  SCRIPT_MARKER: string;
  CONTAINER: string;
  STATUS: string;
  START_BTN: string;
  STOP_BTN: string;
  UP_BTN: string;
  DOWN_BTN: string;
  RECORD_INDICATOR: string;
  JS_EXECUTOR: string;
  JS_EXECUTE_BTN: string;
}

/* ================================================================== */
/*  Controller State (actual runtime shape used by shared-state.ts)    */
/* ================================================================== */

export interface ControllerState {
  running: boolean;
  direction: LoopDirection;
  cycleCount: number;
  countdown: number;
  isIdle: boolean;
  isDelegating: boolean;
  forceDirection: LoopDirection | null;
  delegateStartTime: number;
  loopIntervalId: ReturnType<typeof setInterval> | null;
  countdownIntervalId: ReturnType<typeof setInterval> | null;
  workspaceName: string;
  /** Project name resolved from API (mark-viewed response). */
  projectNameFromApi: string;
  /** Project name resolved from DOM XPath on page load. */
  projectNameFromDom: string;
  /** Custom display name set by user in settings — highest priority for title bar. */
  customDisplayName: string;
  hasFreeCredit: boolean;
  lastStatusCheck: number;
  statusRefreshId: ReturnType<typeof setTimeout> | null;
  workspaceJustChanged: boolean;
  workspaceChangedTimer: ReturnType<typeof setTimeout> | null;
  workspaceObserverActive: boolean;
  workspaceFromApi: boolean;
  workspaceFromCache: boolean;
  isManualCheck: boolean;
  retryCount: number;
  maxRetries: number;
  retryBackoffMs: number;
  lastRetryError: string | null;
  /** Internal: true while a loop cycle fetch is in-flight. */
  __cycleInFlight: boolean;
  /** Internal: true while a retry is scheduled. */
  __cycleRetryPending: boolean;
}

// Forward import for PromptsConfig → PromptEntry dependency
import type { PromptEntry } from './ui-types';
export type { PromptEntry };
