/**
 * Marco Controller — Type Definitions
 *
 * Extracted from 01-macro-looping.js for Phase 1 of TypeScript migration.
 * These types mirror the runtime shapes from:
 *   - window.__MARCO_CONFIG__  (02-macro-controller-config.json)
 *   - window.__MARCO_THEME__   (04-macro-theme.json)
 *   - Internal controller state
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
/*  Controller State                                                   */
/* ================================================================== */

export interface ControllerState {
  isRunning: boolean;
  isPaused: boolean;
  direction: "up" | "down";
  cycleCount: number;
  currentWorkspace: string;
  currentProject: string;
  loopInterval: number;
  countdownSeconds: number;
  creditBalance: number | null;
  lastError: string | null;
  lastCycleTimestamp: string | null;
  workspaceFromApi: boolean;
}

/* ================================================================== */
/*  Prompt Types                                                       */
/* ================================================================== */

export interface PromptEntry {
  name: string;
  text: string;
  category?: string;
  isFavorite?: boolean;
}

/* ================================================================== */
/*  API Response Types                                                 */
/* ================================================================== */

export interface WorkspaceInfo {
  id: string;
  name: string;
  plan: string;
  credits?: CreditInfo;
}

export interface CreditInfo {
  available: number;
  bonus: number;
  billing: number;
  rollover: number;
  daily: number;
  total: number;
}

export interface ProjectInfo {
  id: string;
  name: string;
  workspace_id: string;
}

/* ================================================================== */
/*  Window Augmentation                                                */
/* ================================================================== */

declare global {
  interface Window {
    __MARCO_PROMPTS__?: PromptEntry[];
    __comboForceInject?: boolean;
    marco?: Record<string, unknown>;
  }
}

export {};
