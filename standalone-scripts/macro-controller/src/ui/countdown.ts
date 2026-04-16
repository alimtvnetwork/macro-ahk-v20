
/**
 * MacroLoop Controller — Countdown Timer & Start/Stop Button
 * Step 03c: Extracted from createUI() closure
 */

import { state, TIMING } from '../shared-state';
import { cBtnStartGrad, cBtnStartGlow, cBtnStopGrad, cBtnStopGlow } from '../shared-state';

export interface CountdownCtx {
  startStopBtn: HTMLElement;
  countdownBadge: HTMLElement;
  countdownTickId: ReturnType<typeof setInterval> | null;
  lastCountdownVal: number;
  loopIsRunning: boolean;
  startLoop: (direction: string) => void;
  stopLoop: () => void;
}

export function createCountdownCtx(
  startStopBtn: HTMLElement,
  countdownBadge: HTMLElement,
  startLoop: (direction: string) => void,
  stopLoop: () => void,
): CountdownCtx {
  return {
    startStopBtn,
    countdownBadge,
    countdownTickId: null,
    lastCountdownVal: -1,
    loopIsRunning: false,
    startLoop,
    stopLoop,
  };
}

/** Resolve countdown color based on seconds remaining. */
function countdownColor(secs: number): string {
  if (secs <= 10) return '#ef4444';
  if (secs <= 30) return '#f59e0b';
  return '#fbbf24';
}

/** Resolve progress bar color based on percentage. */
function progressColor(pct: number): string {
  if (pct > 80) return '#ef4444';
  if (pct > 50) return '#f59e0b';
  return '#10b981';
}

/** Update inline countdown text element if present. */
function updateInlineCountdown(secs: number): void {
  const inlineEl = document.getElementById('marco-countdown-text');
  if (!inlineEl) return;
  inlineEl.textContent = secs + 's';
  inlineEl.style.color = countdownColor(secs);
}

/** Update progress bar element if present. */
function updateProgressBar(secs: number): void {
  const barEl = document.getElementById('marco-progress-bar');
  if (!barEl) return;
  const totalSec = Math.floor(TIMING.LOOP_INTERVAL / 1000);
  const pct = totalSec > 0 ? Math.max(0, Math.min(100, ((totalSec - secs) / totalSec) * 100)) : 0;
  barEl.style.width = pct + '%';
  barEl.style.background = progressColor(pct);
}

function renderStartGlyph(btn: HTMLElement): void {
  btn.innerHTML = '▶';
  btn.style.fontSize = '14px';
}

function renderStopGlyph(btn: HTMLElement): void {
  btn.innerHTML = '';
  btn.style.fontSize = '0';
  const square = document.createElement('span');
  square.setAttribute('aria-hidden', 'true');
  square.style.cssText = 'display:block;width:12px;height:12px;background:#fff;border-radius:1px;';
  btn.appendChild(square);
}

export function startCountdownTick(ctx: CountdownCtx) {
  stopCountdownTick(ctx);
  ctx.lastCountdownVal = -1;
  ctx.countdownTickId = setInterval(function() {
    if (!state.running) { stopCountdownTick(ctx); return; }
    const secs = state.countdown;
    if (secs === ctx.lastCountdownVal) return;
    ctx.lastCountdownVal = secs;
    ctx.countdownBadge.textContent = secs + 's';
    ctx.countdownBadge.style.color = countdownColor(secs);
    updateInlineCountdown(secs);
    updateProgressBar(secs);
  }, 1000);
}

export function stopCountdownTick(ctx: CountdownCtx) {
  if (ctx.countdownTickId) { clearInterval(ctx.countdownTickId); ctx.countdownTickId = null; }
  ctx.countdownBadge.style.display = 'none';
  ctx.countdownBadge.textContent = '';
}

export function updateStartStopBtn(ctx: CountdownCtx, running?: boolean) {
  const isRunning = (typeof running === 'boolean') ? running : !!state.running;
  ctx.loopIsRunning = isRunning;
  if (isRunning) {
    renderStopGlyph(ctx.startStopBtn);
    ctx.startStopBtn.title = 'Stop loop';
    ctx.startStopBtn.style.background = cBtnStopGrad;
    ctx.startStopBtn.style.boxShadow = cBtnStopGlow;
    ctx.startStopBtn.style.borderRadius = '8px';
    ctx.countdownBadge.style.display = 'inline-flex';
    startCountdownTick(ctx);
  } else {
    renderStartGlyph(ctx.startStopBtn);
    ctx.startStopBtn.title = 'Start loop';
    ctx.startStopBtn.style.background = cBtnStartGrad;
    ctx.startStopBtn.style.boxShadow = cBtnStartGlow;
    ctx.startStopBtn.style.borderRadius = '8px';
    stopCountdownTick(ctx);
  }
}
