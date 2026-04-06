/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Panel Layout & Drag/Resize
 * Step 03: Extracted from createUI() closure
 *
 * All functions receive a PanelLayoutCtx to avoid closure coupling.
 */

import { log } from '../logging';

// ============================================
// LocalStorage keys for panel state persistence
// See: spec/02-app-issues/63-button-layout-collapse-reload.md
// ============================================
const LS_PANEL_STATE = 'ml_panel_state';
const LS_PANEL_GEOMETRY = 'ml_panel_geometry';
const PANEL_EDGE_MARGIN = 8;
const PANEL_MIN_VISIBLE_HEIGHT = 220;
const PANEL_MIN_VISIBLE_WIDTH = 360;

function savePanelState(state: string): void {
  try { localStorage.setItem(LS_PANEL_STATE, state); } catch (_e) {}
}

function loadPanelState(): string {
  try { return localStorage.getItem(LS_PANEL_STATE) || 'expanded'; } catch (_e) { return 'expanded'; }
}

interface PanelGeometry {
  top: string;
  left: string;
  width: string;
  height: string;
}

function savePanelGeometry(ui: HTMLElement): void {
  try {
    const geo: PanelGeometry = {
      top: ui.style.top || '',
      left: ui.style.left || '',
      width: ui.style.width || '',
      height: ui.style.height || '',
    };
    localStorage.setItem(LS_PANEL_GEOMETRY, JSON.stringify(geo));
  } catch (_e) {}
}

function loadPanelGeometry(): PanelGeometry | null {
  try {
    const raw = localStorage.getItem(LS_PANEL_GEOMETRY);
    if (!raw) return null;
    return JSON.parse(raw) as PanelGeometry;
  } catch (_e) { return null; }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function keepPanelInViewport(ctx: PanelLayoutCtx): void {
  const vw = Math.max(window.innerWidth || 0, 320);
  const vh = Math.max(window.innerHeight || 0, 240);

  // Keep width/height visible in current viewport.
  const rectBefore = ctx.ui.getBoundingClientRect();
  const maxWidth = Math.max(PANEL_MIN_VISIBLE_WIDTH, vw - PANEL_EDGE_MARGIN * 2);
  const maxHeight = Math.max(PANEL_MIN_VISIBLE_HEIGHT, vh - PANEL_EDGE_MARGIN * 2);

  if (rectBefore.width > maxWidth) {
    ctx.ui.style.width = maxWidth + 'px';
  }
  if (rectBefore.height > maxHeight) {
    ctx.ui.style.height = maxHeight + 'px';
    ctx.ui.style.maxHeight = maxHeight + 'px';
    ctx.ui.style.overflowY = 'auto';
  } else if (!ctx.isResizing) {
    ctx.ui.style.maxHeight = '';
    ctx.ui.style.overflowY = '';
  }

  const rect = ctx.ui.getBoundingClientRect();
  const minLeft = PANEL_EDGE_MARGIN;
  const minTop = PANEL_EDGE_MARGIN;
  const maxLeft = Math.max(minLeft, vw - rect.width - PANEL_EDGE_MARGIN);
  const maxTop = Math.max(minTop, vh - rect.height - PANEL_EDGE_MARGIN);

  const nextLeft = clamp(rect.left, minLeft, maxLeft);
  const nextTop = clamp(rect.top, minTop, maxTop);

  ctx.ui.style.left = nextLeft + 'px';
  ctx.ui.style.top = nextTop + 'px';
  ctx.ui.style.right = 'auto';
  ctx.ui.style.bottom = 'auto';
}

/** Mutable state shared between panel layout functions */
export interface PanelLayoutCtx {
  ui: HTMLElement;
  isFloating: boolean;
  isDragging: boolean;
  dragOffsetX: number;
  dragOffsetY: number;
  dragStartPos: { x: number; y: number };
  dragPointerId: number | null;
  isResizing: boolean;
  resizeType: string;
  resizeStartX: number;
  resizeStartY: number;
  resizeStartW: number;
  resizeStartH: number;
  resizePointerId: number | null;
  panelState: string;
  bodyElements: HTMLElement[];
  panelToggleSpan: HTMLElement | null;
  // Theme tokens
  floatW: string;
  floatSh: string;
  cPrimary: string;
}

export function createPanelLayoutCtx(ui: HTMLElement, floatW: string, floatSh: string, cPrimary: string): PanelLayoutCtx {
  return {
    ui,
    isFloating: false,
    isDragging: false,
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragStartPos: { x: 0, y: 0 },
    dragPointerId: null,
    isResizing: false,
    resizeType: '',
    resizeStartX: 0,
    resizeStartY: 0,
    resizeStartW: 0,
    resizeStartH: 0,
    resizePointerId: null,
    panelState: loadPanelState(),
    bodyElements: [],
    panelToggleSpan: null,
    floatW,
    floatSh,
    cPrimary,
  };
}

export function enableFloating(ctx: PanelLayoutCtx) {
  if (ctx.isFloating) return;
  log('Switching MacroLoop panel to floating mode', 'info');
  ctx.isFloating = true;
  ctx.ui.style.position = 'fixed';
  ctx.ui.style.zIndex = '99997';
  ctx.ui.style.margin = '0';
  ctx.ui.style.boxShadow = ctx.floatSh;

  // Restore saved geometry or use defaults
  const geo = loadPanelGeometry();
  if (geo && geo.top && geo.left) {
    ctx.ui.style.top = geo.top;
    ctx.ui.style.left = geo.left;
    ctx.ui.style.right = 'auto';
    ctx.ui.style.bottom = 'auto';
    if (geo.width) ctx.ui.style.width = geo.width;
    if (geo.height) ctx.ui.style.height = geo.height;
    log('Restored panel geometry from localStorage', 'info');
  } else {
    ctx.ui.style.width = ctx.floatW;
    ctx.ui.style.top = '80px';
    ctx.ui.style.left = '20px';
  }

  keepPanelInViewport(ctx);
}

export function positionLoopController(ctx: PanelLayoutCtx, position: string) {
  enableFloating(ctx);
  const margin = 20;
  if (position === 'bottom-left') {
    ctx.ui.style.left = margin + 'px';
    ctx.ui.style.right = 'auto';
    ctx.ui.style.top = 'auto';
    ctx.ui.style.bottom = margin + 'px';
  } else if (position === 'bottom-right') {
    ctx.ui.style.left = 'auto';
    ctx.ui.style.right = margin + 'px';
    ctx.ui.style.top = 'auto';
    ctx.ui.style.bottom = margin + 'px';
  }
  log('Moved MacroLoop to ' + position, 'info');
}

export function startDragHandler(ctx: PanelLayoutCtx, e: PointerEvent) {
  ctx.isDragging = true;
  ctx.dragPointerId = e.pointerId;
  const rect = ctx.ui.getBoundingClientRect();
  ctx.dragOffsetX = e.clientX - rect.left;
  ctx.dragOffsetY = e.clientY - rect.top;
  ctx.dragStartPos.x = e.clientX;
  ctx.dragStartPos.y = e.clientY;
  enableFloating(ctx);
  if ((e.target as HTMLElement).setPointerCapture && ctx.dragPointerId != null) {
    (e.target as HTMLElement).setPointerCapture(ctx.dragPointerId);
  }
  e.preventDefault();
}

export function setupDragListeners(ctx: PanelLayoutCtx) {
  window.addEventListener('resize', function() {
    if (!ctx.isFloating) return;
    keepPanelInViewport(ctx);
    savePanelGeometry(ctx.ui);
  });

  document.addEventListener('pointermove', function(e) {
    if (!ctx.isDragging) return;
    ctx.ui.style.left = (e.clientX - ctx.dragOffsetX) + 'px';
    ctx.ui.style.top = (e.clientY - ctx.dragOffsetY) + 'px';
    ctx.ui.style.right = 'auto';
    ctx.ui.style.bottom = 'auto';
    keepPanelInViewport(ctx);
    e.preventDefault();
  });

  document.addEventListener('pointerup', function(e) {
    if (!ctx.isDragging) return;
    ctx.isDragging = false;
    if ((e.target as HTMLElement).releasePointerCapture && ctx.dragPointerId != null) {
      try { (e.target as HTMLElement).releasePointerCapture(ctx.dragPointerId); } catch(ex) {}
    }
    ctx.dragPointerId = null;
    keepPanelInViewport(ctx);
    // Persist geometry after drag
    savePanelGeometry(ctx.ui);
  });
}

export function applyResizeResponsiveLayout(ctx: PanelLayoutCtx, panelHeight: number) {
  const extra = Math.max(0, panelHeight - ctx.resizeStartH);
  const wsListEl = document.getElementById('loop-ws-list');
  if (wsListEl) wsListEl.style.maxHeight = (160 + Math.floor(extra * 0.75)) + 'px';

  const activityPanelEl = document.getElementById('loop-activity-log-panel');
  if (activityPanelEl) activityPanelEl.style.maxHeight = (120 + Math.floor(extra * 0.35)) + 'px';

  const wsHistoryPanelEl = document.getElementById('loop-ws-history-panel');
  if (wsHistoryPanelEl) wsHistoryPanelEl.style.maxHeight = (120 + Math.floor(extra * 0.35)) + 'px';

  const jsHistoryEl = document.getElementById('loop-js-history');
  if (jsHistoryEl) jsHistoryEl.style.maxHeight = (80 + Math.floor(extra * 0.25)) + 'px';
}

export function createResizeHandle(ctx: PanelLayoutCtx, type: string): HTMLElement {
  const handle = document.createElement('div');
  if (type === 'corner') {
    handle.style.cssText = 'position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;z-index:99999;display:flex;align-items:center;justify-content:center;';
    const grip = document.createElement('div');
    grip.style.cssText = 'width:10px;height:10px;opacity:0.4;transition:opacity .2s;';
    grip.innerHTML = '<svg viewBox="0 0 10 10" width="10" height="10"><circle cx="7" cy="3" r="1" fill="#ae7ce8"/><circle cx="3" cy="7" r="1" fill="#ae7ce8"/><circle cx="7" cy="7" r="1" fill="#ae7ce8"/></svg>';
    handle.appendChild(grip);
    handle.onmouseenter = function() { grip.style.opacity = '0.9'; };
    handle.onmouseleave = function() { grip.style.opacity = '0.4'; };
  } else {
    handle.style.cssText = 'position:absolute;left:12px;right:12px;bottom:0;height:6px;cursor:ns-resize;z-index:99998;';
    const bar = document.createElement('div');
    bar.style.cssText = 'width:40px;height:3px;background:' + ctx.cPrimary + ';border-radius:2px;margin:2px auto 0;opacity:0.3;transition:opacity .2s;';
    handle.appendChild(bar);
    handle.onmouseenter = function() { bar.style.opacity = '0.8'; };
    handle.onmouseleave = function() { bar.style.opacity = '0.3'; };
  }

  handle.addEventListener('pointerdown', function(e) {
    e.stopPropagation();
    e.preventDefault();
    ctx.isResizing = true;
    ctx.resizeType = type;
    ctx.resizePointerId = e.pointerId;

    const rect = ctx.ui.getBoundingClientRect();
    ctx.resizeStartX = e.clientX;
    ctx.resizeStartY = e.clientY;
    ctx.resizeStartW = rect.width;
    ctx.resizeStartH = rect.height;

    enableFloating(ctx);

    ctx.ui.style.left = rect.left + 'px';
    ctx.ui.style.top = rect.top + 'px';
    ctx.ui.style.right = 'auto';
    ctx.ui.style.bottom = 'auto';
    ctx.ui.style.width = rect.width + 'px';
    ctx.ui.style.height = rect.height + 'px';

    if ((handle as any).setPointerCapture && ctx.resizePointerId != null) {
      (handle as any).setPointerCapture(ctx.resizePointerId);
    }
  });

  return handle;
}

export function setupResizeListeners(ctx: PanelLayoutCtx) {
  document.addEventListener('pointermove', function(e) {
    if (!ctx.isResizing) return;
    e.preventDefault();

    const dx = e.clientX - ctx.resizeStartX;
    const dy = e.clientY - ctx.resizeStartY;

    if (ctx.resizeType === 'corner') {
      const newW = Math.max(420, ctx.resizeStartW + dx);
      const newH = Math.max(200, ctx.resizeStartH + dy);
      ctx.ui.style.width = newW + 'px';
      ctx.ui.style.height = newH + 'px';
      ctx.ui.style.overflow = 'hidden';
      applyResizeResponsiveLayout(ctx, newH);
      keepPanelInViewport(ctx);
    } else {
      const newH2 = Math.max(200, ctx.resizeStartH + dy);
      ctx.ui.style.height = newH2 + 'px';
      ctx.ui.style.overflow = 'hidden';
      applyResizeResponsiveLayout(ctx, newH2);
      keepPanelInViewport(ctx);
    }
  });

  document.addEventListener('pointerup', function(e) {
    if (!ctx.isResizing) return;
    ctx.isResizing = false;
    if ((e.target as HTMLElement).releasePointerCapture && ctx.resizePointerId != null) {
      try { (e.target as HTMLElement).releasePointerCapture(ctx.resizePointerId); } catch(ex) {}
    }
    ctx.resizePointerId = null;
    keepPanelInViewport(ctx);
    // Persist geometry after resize
    savePanelGeometry(ctx.ui);
  });
}

export function toggleMinimize(ctx: PanelLayoutCtx) {
  const isExpanded = ctx.panelState === 'expanded';
  if (isExpanded) {
    log('Minimizing MacroLoop panel', 'info');
    for (let i = 0; i < ctx.bodyElements.length; i++) {
      ctx.bodyElements[i].style.display = 'none';
    }
    if (ctx.panelToggleSpan) ctx.panelToggleSpan.textContent = '[ + ]';
    ctx.panelState = 'minimized';
  } else {
    log('Expanding MacroLoop panel', 'info');
    for (let i = 0; i < ctx.bodyElements.length; i++) {
      ctx.bodyElements[i].style.display = '';
    }
    if (ctx.panelToggleSpan) ctx.panelToggleSpan.textContent = '[ - ]';
    ctx.panelState = 'expanded';
  }
  // Persist minimize state
  savePanelState(ctx.panelState);
}

export function restorePanel(ctx: PanelLayoutCtx) {
  log('Restoring hidden MacroLoop panel', 'info');
  ctx.ui.style.display = '';
  for (let i = 0; i < ctx.bodyElements.length; i++) {
    ctx.bodyElements[i].style.display = '';
  }
  if (ctx.panelToggleSpan) ctx.panelToggleSpan.textContent = '[ - ]';
  ctx.panelState = 'expanded';
}
