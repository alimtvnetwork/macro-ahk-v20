/**
 * Macro Controller — UI, Prompt & Misc Type Definitions
 *
 * Phase 5E: Extracted from types.ts.
 * Contains UI element interfaces, prompt types, logging types,
 * toast, auth diagnostics, and Window augmentation.
 */

/* ================================================================== */
/*  Activity Log                                                       */
/* ================================================================== */

export interface ActivityLogEntry {
  time: string;
  msg: string;
  level: string;
  indent: number;
}

/* ================================================================== */
/*  Toast                                                              */
/* ================================================================== */

export interface ToastEntry {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warn';
  element: HTMLElement;
  dismissTimer: ReturnType<typeof setTimeout> | null;
}

/* ================================================================== */
/*  Auth Diagnostics                                                   */
/* ================================================================== */

export interface RefreshOutcome {
  success: boolean;
  time: string;
  source: string;
  error?: string;
}

/* ================================================================== */
/*  Prompt Types                                                       */
/* ================================================================== */

export interface PromptEntry {
  name: string;
  text: string;
  id?: string;
  slug?: string;
  category?: string;
  isFavorite?: boolean;
  isDefault?: boolean;
}

export interface PromptsCfg {
  pasteTargetXPath?: string;
  pasteTargetSelector?: string;
}

/** Resolved prompts config returned by getPromptsConfig(). */
export interface ResolvedPromptsConfig extends PromptsCfg {
  entries: PromptEntry[];
}

/* ================================================================== */
/*  Persisted Log Entry                                                */
/* ================================================================== */

export interface PersistedLogEntry {
  t: string;
  l: string;
  m: string;
  url: string;
}

/* ================================================================== */
/*  Extension Message Response (for sendToExtension callbacks)          */
/* ================================================================== */

export interface ExtensionCallbackResponse {
  isOk?: boolean;
  errorMessage?: string;
  tables?: Array<{ name?: string; TableName?: string; ColumnDefs?: string; rowCount?: number }>;
  rows?: Record<string, string | number | boolean | null>[];
  count?: number;
  status?: string;
  message?: string;
}

/* ================================================================== */
/*  DOM Elements                                                       */
/* ================================================================== */

/** HTMLElement with __cleanupDrag for draggable dialogs. */
export interface DraggableElement extends HTMLElement {
  __cleanupDrag?: () => void;
}

export interface HTMLElementWithHandlers extends HTMLElement {
  _wsDelegateHandler?: (e: MouseEvent) => void;
  _wsDblHandler?: (e: MouseEvent) => void;
  _wsCtxHandler?: (e: MouseEvent) => void;
  _wsHoverHandler?: (e: MouseEvent) => void;
  _wsOutHandler?: (e: MouseEvent) => void;
}

/* ================================================================== */
/*  Collapsible Section Options                                        */
/* ================================================================== */

export interface CollapsibleSectionOpts {
  defaultCollapsed?: boolean;
  headerExtra?: HTMLElement;
}

/* ================================================================== */
/*  Auto-Attach Group (runtime shape from config)                      */
/* ================================================================== */

export interface AutoAttachGroupRuntime {
  name?: string;
  files?: string[];
  prompt?: string;
}

/* ================================================================== */
/*  Window Augmentation                                                */
/* ================================================================== */

declare global {
  interface Window {
    __MARCO_PROMPTS__?: PromptEntry[];
    __comboForceInject?: boolean;
    // marco type is defined in globals.d.ts — do not redeclare here
  }
}

export {};
