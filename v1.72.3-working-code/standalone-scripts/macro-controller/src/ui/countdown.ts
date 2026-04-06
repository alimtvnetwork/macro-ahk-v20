/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * MacroLoop Controller — Countdown Timer & Start/Stop Button
 * Step 03c: Extracted from createUI() closure
 */

import { state } from '../shared-state';
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

export function startCountdownTick(ctx: CountdownCtx) {
  stopCountdownTick(ctx);
  ctx.lastCountdownVal = -1;
  ctx.countdownTickId = setInterval(function() {
    if (!state.running) { stopCountdownTick(ctx); return; }
    const secs = state.countdown;
    if (secs === ctx.lastCountdownVal) return;
    ctx.lastCountdownVal = secs;
    ctx.countdownBadge.textContent = secs + 's';
    ctx.countdownBadge.style.color = secs <= 10 ? '#ef4444' : secs <= 30 ? '#f59e0b' : '#fbbf24';
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
    ctx.startStopBtn.textContent = '⏹';
    ctx.startStopBtn.title = 'Stop loop';
    ctx.startStopBtn.style.background = cBtnStopGrad;
    ctx.startStopBtn.style.boxShadow = cBtnStopGlow;
    ctx.startStopBtn.style.borderRadius = '8px 0 0 8px';
    ctx.countdownBadge.style.display = 'inline-flex';
    startCountdownTick(ctx);
  } else {
    ctx.startStopBtn.textContent = '▶';
    ctx.startStopBtn.title = 'Start loop';
    ctx.startStopBtn.style.background = cBtnStartGrad;
    ctx.startStopBtn.style.boxShadow = cBtnStartGlow;
    ctx.startStopBtn.style.borderRadius = '8px';
    stopCountdownTick(ctx);
  }
}
