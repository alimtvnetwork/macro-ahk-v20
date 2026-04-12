/**
 * MacroLoop Controller — Floating Error Overlay
 *
 * A draggable, auto-showing overlay that captures and displays errors
 * with formatted stack traces, timestamps, and copy/dismiss controls.
 * Zero external dependencies — pure DOM manipulation.
 *
 * Integration:
 *   - Called from startup-global-handlers.ts on uncaught errors
 *   - Called from toast.ts when error-level toasts are shown
 *   - Reads theme tokens from shared-state.ts
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import {
  VERSION,
  cPanelBg,
  cPanelBorder,
  cPanelFg,
  cPanelFgDim,
  cError,
  cErrorLight,
  cWarning,
  cPrimaryLight,
  tFont,
  tFontSm,
  tFontTiny,
  lPanelRadius,
  trFast,
  trNormal,
} from '../shared-state';
import { log } from '../logging';
import { toErrorMessage } from '../error-utils';
import { sendToExtension } from './prompt-loader';

// ============================================
// Types
// ============================================

export interface OverlayError {
  readonly id: number;
  readonly timestamp: string;
  readonly level: 'error' | 'warn';
  readonly message: string;
  readonly stack?: string;
  readonly source?: string;
}

// ============================================
// State
// ============================================

const MAX_OVERLAY_ERRORS = 30;

class ErrorOverlayState {
  private _errors: OverlayError[] = [];
  private _nextId = 1;
  private _overlayEl: HTMLElement | null = null;
  private _listEl: HTMLElement | null = null;
  private _badgeEl: HTMLElement | null = null;
  private _isExpanded = true;
  private _isMinimized = false;

  // Drag state
  private _isDragging = false;
  private _dragOffsetX = 0;
  private _dragOffsetY = 0;

  get errors(): readonly OverlayError[] {
    return this._errors;
  }

  get overlayEl(): HTMLElement | null {
    return this._overlayEl;
  }

  set overlayEl(el: HTMLElement | null) {
    this._overlayEl = el;
  }

  get listEl(): HTMLElement | null {
    return this._listEl;
  }

  set listEl(el: HTMLElement | null) {
    this._listEl = el;
  }

  get badgeEl(): HTMLElement | null {
    return this._badgeEl;
  }

  set badgeEl(el: HTMLElement | null) {
    this._badgeEl = el;
  }

  get isExpanded(): boolean {
    return this._isExpanded;
  }

  set isExpanded(v: boolean) {
    this._isExpanded = v;
  }

  get isMinimized(): boolean {
    return this._isMinimized;
  }

  set isMinimized(v: boolean) {
    this._isMinimized = v;
  }

  get isDragging(): boolean {
    return this._isDragging;
  }

  set isDragging(v: boolean) {
    this._isDragging = v;
  }

  get dragOffsetX(): number {
    return this._dragOffsetX;
  }

  set dragOffsetX(v: number) {
    this._dragOffsetX = v;
  }

  get dragOffsetY(): number {
    return this._dragOffsetY;
  }

  set dragOffsetY(v: number) {
    this._dragOffsetY = v;
  }

  addError(level: 'error' | 'warn', message: string, stack?: string, source?: string): OverlayError {
    const entry: OverlayError = {
      id: this._nextId++,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      level,
      message,
      stack,
      source,
    };

    this._errors.unshift(entry);

    const isOverLimit = this._errors.length > MAX_OVERLAY_ERRORS;

    if (isOverLimit) {
      this._errors.pop();
    }

    return entry;
  }

  removeError(id: number): void {
    this._errors = this._errors.filter(e => e.id !== id);
  }

  clearAll(): void {
    this._errors = [];
  }
}

const overlayState = new ErrorOverlayState();

// ============================================
// Overlay Container ID
// ============================================

const OVERLAY_ID = 'marco-error-overlay';

// ============================================
// Styles
// ============================================

// eslint-disable-next-line max-lines-per-function -- CSS template string; splitting would hurt readability
function getOverlayStyles(): string {
  return `
    #${OVERLAY_ID} {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 420px;
      max-height: 60vh;
      background: ${cPanelBg};
      border: 1px solid ${cError};
      border-radius: ${lPanelRadius};
      box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 12px rgba(244,71,71,0.15);
      font-family: ${tFont};
      font-size: ${tFontSm};
      color: ${cPanelFg};
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transition: width ${trNormal} ease, max-height ${trNormal} ease, opacity ${trFast} ease;
      user-select: none;
    }

    #${OVERLAY_ID}.minimized {
      width: 48px;
      max-height: 48px;
      border-radius: 50%;
      cursor: pointer;
    }

    #${OVERLAY_ID} .eo-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: linear-gradient(135deg, rgba(244,71,71,0.12) 0%, rgba(244,71,71,0.04) 100%);
      border-bottom: 1px solid ${cPanelBorder};
      cursor: move;
      flex-shrink: 0;
    }

    #${OVERLAY_ID}.minimized .eo-header {
      border-bottom: none;
      padding: 0;
      justify-content: center;
      width: 48px;
      height: 48px;
    }

    #${OVERLAY_ID} .eo-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: ${tFontSm};
      color: ${cErrorLight};
    }

    #${OVERLAY_ID} .eo-badge {
      background: ${cError};
      color: #fff;
      font-size: ${tFontTiny};
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 10px;
      min-width: 18px;
      text-align: center;
    }

    #${OVERLAY_ID} .eo-controls {
      display: flex;
      gap: 4px;
    }

    #${OVERLAY_ID} .eo-btn {
      background: transparent;
      border: 1px solid ${cPanelBorder};
      color: ${cPanelFgDim};
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: ${tFontTiny};
      font-family: ${tFont};
      transition: background ${trFast} ease, color ${trFast} ease;
    }

    #${OVERLAY_ID} .eo-btn:hover {
      background: rgba(255,255,255,0.08);
      color: ${cPanelFg};
    }

    #${OVERLAY_ID} .eo-list {
      overflow-y: auto;
      flex: 1;
      padding: 4px 0;
      max-height: calc(60vh - 44px);
    }

    #${OVERLAY_ID} .eo-item {
      padding: 8px 12px;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background ${trFast} ease;
    }

    #${OVERLAY_ID} .eo-item:hover {
      background: rgba(255,255,255,0.03);
    }

    #${OVERLAY_ID} .eo-item-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
    }

    #${OVERLAY_ID} .eo-item-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    #${OVERLAY_ID} .eo-time {
      color: ${cPanelFgDim};
      font-size: ${tFontTiny};
    }

    #${OVERLAY_ID} .eo-level {
      font-size: ${tFontTiny};
      font-weight: 700;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 3px;
    }

    #${OVERLAY_ID} .eo-level-error {
      color: ${cError};
      background: rgba(244,71,71,0.12);
    }

    #${OVERLAY_ID} .eo-level-warn {
      color: ${cWarning};
      background: rgba(220,220,170,0.12);
    }

    #${OVERLAY_ID} .eo-msg {
      color: ${cPanelFg};
      word-break: break-word;
      line-height: 1.4;
    }

    #${OVERLAY_ID} .eo-stack-toggle {
      color: ${cPrimaryLight};
      font-size: ${tFontTiny};
      cursor: pointer;
      margin-top: 4px;
      display: inline-block;
      user-select: none;
    }

    #${OVERLAY_ID} .eo-stack-toggle:hover {
      text-decoration: underline;
    }

    #${OVERLAY_ID} .eo-stack {
      background: rgba(0,0,0,0.3);
      color: ${cPanelFgDim};
      font-size: ${tFontTiny};
      padding: 6px 8px;
      margin-top: 4px;
      border-radius: 4px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 120px;
      overflow-y: auto;
      line-height: 1.5;
    }

    #${OVERLAY_ID} .eo-item-dismiss {
      background: transparent;
      border: none;
      color: ${cPanelFgDim};
      cursor: pointer;
      font-size: 14px;
      padding: 0 2px;
      line-height: 1;
      opacity: 0.5;
      transition: opacity ${trFast} ease;
    }

    #${OVERLAY_ID} .eo-item-dismiss:hover {
      opacity: 1;
      color: ${cErrorLight};
    }

    #${OVERLAY_ID} .eo-empty {
      padding: 20px;
      text-align: center;
      color: ${cPanelFgDim};
      font-style: italic;
    }

    #${OVERLAY_ID} .eo-minimized-icon {
      font-size: 20px;
      line-height: 48px;
      text-align: center;
    }
  `;
}

// ============================================
// DOM Building
// ============================================

function ensureStyleTag(): void {
  const existingStyle = document.getElementById(OVERLAY_ID + '-styles');

  if (existingStyle) {
    return;
  }

  const style = document.createElement('style');
  style.id = OVERLAY_ID + '-styles';
  style.textContent = getOverlayStyles();
  document.head.appendChild(style);
}

function buildOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;

  // Header
  const header = document.createElement('div');
  header.className = 'eo-header';

  const title = document.createElement('div');
  title.className = 'eo-title';
  title.innerHTML = '⚠ Errors';

  const badge = document.createElement('span');
  badge.className = 'eo-badge';
  badge.textContent = '0';
  title.appendChild(badge);
  overlayState.badgeEl = badge;

  const controls = document.createElement('div');
  controls.className = 'eo-controls';

  const copyAllBtn = createButton('📋', 'Copy All', handleCopyAll);
  const clearBtn = createButton('🗑', 'Clear', handleClearAll);
  const minBtn = createButton('─', 'Minimize', handleMinimize);
  const closeBtn = createButton('✕', 'Close', handleClose);

  controls.appendChild(copyAllBtn);
  controls.appendChild(clearBtn);
  controls.appendChild(minBtn);
  controls.appendChild(closeBtn);

  header.appendChild(title);
  header.appendChild(controls);

  // List
  const list = document.createElement('div');
  list.className = 'eo-list';
  overlayState.listEl = list;

  overlay.appendChild(header);
  overlay.appendChild(list);

  // Drag handlers
  setupDrag(header, overlay);

  return overlay;
}

function createButton(icon: string, title: string, handler: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'eo-btn';
  btn.textContent = icon;
  btn.title = title;
  btn.addEventListener('click', function (e: MouseEvent) {
    e.stopPropagation();
    handler();
  });

  return btn;
}

// ============================================
// Drag Support
// ============================================

function setupDrag(handle: HTMLElement, overlay: HTMLElement): void {
  handle.addEventListener('mousedown', function (e: MouseEvent) {
    const isButton = (e.target as HTMLElement).tagName === 'BUTTON';

    if (isButton) {
      return;
    }

    overlayState.isDragging = true;
    overlayState.dragOffsetX = e.clientX - overlay.getBoundingClientRect().left;
    overlayState.dragOffsetY = e.clientY - overlay.getBoundingClientRect().top;
    overlay.style.transition = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e: MouseEvent) {
    const isNotDragging = !overlayState.isDragging;

    if (isNotDragging) {
      return;
    }

    const x = e.clientX - overlayState.dragOffsetX;
    const y = e.clientY - overlayState.dragOffsetY;

    overlay.style.left = x + 'px';
    overlay.style.top = y + 'px';
    overlay.style.right = 'auto';
    overlay.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', function () {
    const wasDragging = overlayState.isDragging;

    if (wasDragging) {
      overlayState.isDragging = false;
      overlay.style.transition = '';
    }
  });
}

// ============================================
// Rendering
// ============================================

function renderErrorList(): void {
  const list = overlayState.listEl;

  if (!list) {
    return;
  }

  list.innerHTML = '';

  const hasNoErrors = overlayState.errors.length === 0;

  if (hasNoErrors) {
    const empty = document.createElement('div');
    empty.className = 'eo-empty';
    empty.textContent = 'No errors captured';
    list.appendChild(empty);

    return;
  }

  for (const error of overlayState.errors) {
    list.appendChild(buildErrorItem(error));
  }
}

// eslint-disable-next-line max-lines-per-function -- DOM construction; splitting loses structural context
function buildErrorItem(error: OverlayError): HTMLElement {
  const item = document.createElement('div');
  item.className = 'eo-item';
  item.dataset.errorId = String(error.id);

  // Header row
  const headerRow = document.createElement('div');
  headerRow.className = 'eo-item-header';

  const meta = document.createElement('div');
  meta.className = 'eo-item-meta';

  const time = document.createElement('span');
  time.className = 'eo-time';
  time.textContent = error.timestamp;

  const level = document.createElement('span');
  level.className = 'eo-level eo-level-' + error.level;
  level.textContent = error.level;

  meta.appendChild(time);
  meta.appendChild(level);

  const dismissBtn = document.createElement('button');
  dismissBtn.className = 'eo-item-dismiss';
  dismissBtn.textContent = '✕';
  dismissBtn.title = 'Dismiss';
  dismissBtn.addEventListener('click', function () {
    overlayState.removeError(error.id);
    renderErrorList();
    updateBadge();
    hideIfEmpty();
  });

  headerRow.appendChild(meta);
  headerRow.appendChild(dismissBtn);

  // Message
  const msg = document.createElement('div');
  msg.className = 'eo-msg';
  msg.textContent = error.message;

  item.appendChild(headerRow);
  item.appendChild(msg);

  // Stack trace (collapsible)
  const hasStack = error.stack !== undefined && error.stack !== '';

  if (hasStack) {
    const toggle = document.createElement('span');
    toggle.className = 'eo-stack-toggle';
    toggle.textContent = '▸ Stack trace';

    const stackPre = document.createElement('pre');
    stackPre.className = 'eo-stack';
    stackPre.textContent = error.stack!;
    stackPre.style.display = 'none';

    toggle.addEventListener('click', function () {
      const isHidden = stackPre.style.display === 'none';

      if (isHidden) {
        stackPre.style.display = 'block';
        toggle.textContent = '▾ Stack trace';
      } else {
        stackPre.style.display = 'none';
        toggle.textContent = '▸ Stack trace';
      }
    });

    item.appendChild(toggle);
    item.appendChild(stackPre);
  }

  return item;
}

function updateBadge(): void {
  const badge = overlayState.badgeEl;

  if (badge) {
    badge.textContent = String(overlayState.errors.length);
  }
}

function hideIfEmpty(): void {
  const hasNoErrors = overlayState.errors.length === 0;
  const overlay = overlayState.overlayEl;

  if (hasNoErrors && overlay) {
    overlay.style.display = 'none';
  }
}

// ============================================
// Handler Functions
// ============================================

function handleCopyAll(): void {
  const lines: string[] = [];
  lines.push('[MacroLoop v' + VERSION + ' Error Report]');
  lines.push('URL: ' + window.location.href);
  lines.push('Time: ' + new Date().toISOString());
  lines.push('Errors: ' + overlayState.errors.length);
  lines.push('─'.repeat(50));

  for (const error of overlayState.errors) {
    lines.push('');
    lines.push('[' + error.timestamp + '] [' + error.level.toUpperCase() + '] ' + error.message);

    const hasStack = error.stack !== undefined && error.stack !== '';

    if (hasStack) {
      lines.push('Stack: ' + error.stack);
    }

    const hasSource = error.source !== undefined && error.source !== '';

    if (hasSource) {
      lines.push('Source: ' + error.source);
    }
  }

  navigator.clipboard.writeText(lines.join('\n')).then(function () {
    log('[ErrorOverlay] Copied ' + overlayState.errors.length + ' errors to clipboard', 'success');
  }).catch(function (err) {
    log('[ErrorOverlay] Clipboard copy failed: ' + toErrorMessage(err), 'warn');
  });
}

function handleClearAll(): void {
  overlayState.clearAll();
  renderErrorList();
  updateBadge();
  hideIfEmpty();
  log('[ErrorOverlay] Cleared all errors', 'check');
}

function handleMinimize(): void {
  const overlay = overlayState.overlayEl;

  if (!overlay) {
    return;
  }

  const isCurrentlyMinimized = overlayState.isMinimized;

  if (isCurrentlyMinimized) {
    overlay.classList.remove('minimized');
    overlayState.isMinimized = false;
  } else {
    overlay.classList.add('minimized');
    overlayState.isMinimized = true;
  }
}

function handleClose(): void {
  const overlay = overlayState.overlayEl;

  if (overlay) {
    overlay.style.display = 'none';
  }
}

// ============================================
// Public API
// ============================================

/** Ensure overlay is in the DOM, lazily created on first call. */
export function ensureErrorOverlay(): void {
  const isAlreadyCreated = overlayState.overlayEl !== null && document.getElementById(OVERLAY_ID) !== null;

  if (isAlreadyCreated) {
    return;
  }

  ensureStyleTag();
  const overlay = buildOverlay();
  overlay.style.display = 'none'; // hidden until first error
  document.body.appendChild(overlay);
  overlayState.overlayEl = overlay;
  renderErrorList();
  log('[ErrorOverlay] Initialized', 'check');

  // Click to restore from minimized
  overlay.addEventListener('click', function () {
    const isMinimized = overlayState.isMinimized;

    if (isMinimized) {
      handleMinimize();
    }
  });
}

/**
 * Push an error into the overlay and auto-show it.
 * Called from global error handlers and toast system.
 */
export function pushOverlayError(
  level: 'error' | 'warn',
  message: string,
  stack?: string,
  source?: string,
): void {
  ensureErrorOverlay();
  overlayState.addError(level, message, stack, source);
  renderErrorList();
  updateBadge();

  const overlay = overlayState.overlayEl;

  if (overlay) {
    overlay.style.display = 'flex';
  }

  // Bridge to extension SQLite error store
  const isError = level === 'error';

  if (isError) {
    bridgeErrorToExtension(message, stack, source);
  }
}

/**
 * Send error to the extension's SQLite Errors table via USER_SCRIPT_ERROR.
 * Fire-and-forget — overlay works independently of extension availability.
 */
function bridgeErrorToExtension(message: string, stack?: string, source?: string): void {
  try {
    sendToExtension('USER_SCRIPT_ERROR', {
      scriptId: 'macro-controller',
      message: message,
      stack: stack || '',
      scriptCode: source || 'overlay',
    });
  } catch {
    /* Extension unavailable — silently skip */
  }
}

/** Get current overlay error count (for badge integrations). */
export function getOverlayErrorCount(): number {
  return overlayState.errors.length;
}

/** Programmatically show/hide the overlay. */
export function setOverlayVisible(visible: boolean): void {
  const overlay = overlayState.overlayEl;

  if (overlay) {
    overlay.style.display = visible ? 'flex' : 'none';
  }
}
