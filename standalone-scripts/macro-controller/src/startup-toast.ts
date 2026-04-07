/**
 * MacroLoop Controller — Standalone Startup Toast
 *
 * Renders a lightweight DOM-based toast notification immediately on bootstrap,
 * BEFORE the SDK (`window.marco.notify`) is available. This ensures the user
 * sees instant visual feedback when clicking the extension script.
 *
 * The toast is dismissed automatically when:
 *   1. The SDK toast system becomes available and takes over, OR
 *   2. A 10-second auto-dismiss timer fires (fallback).
 *
 * Design: fixed-position bar at bottom-right, inline styles only (no CSS deps).
 *
 * @see spec/17-app-issues/89-chrome-extension-load-workspace-prompt-root-cause/03-rc02-missing-startup-toast.md
 */

const TOAST_ID = 'mcl-startup-toast';
const AUTO_DISMISS_MS = 10_000;
const FADE_DURATION_MS = 300;

let dismissTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Show the standalone startup toast immediately.
 * Safe to call multiple times — will replace any existing startup toast.
 */
// eslint-disable-next-line max-lines-per-function
export function showStartupToast(version: string): void {
  removeStartupToast(); // idempotent

  const el = document.createElement('div');
  el.id = TOAST_ID;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  // Inline styles — no external CSS required
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    zIndex: '2147483647', // max z-index to stay on top of any page content
    padding: '12px 20px',
    borderRadius: '8px',
    backgroundColor: 'rgba(17, 24, 39, 0.95)', // near-black, semi-transparent
    color: '#e5e7eb',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    lineHeight: '1.4',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    opacity: '0',
    transition: 'opacity ' + FADE_DURATION_MS + 'ms ease-in-out',
    pointerEvents: 'none',
    maxWidth: '360px',
  });

  // Spinner (CSS animation via inline keyframes)
  const spinner = document.createElement('span');
  Object.assign(spinner.style, {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.2)',
    borderTopColor: '#60a5fa',
    borderRadius: '50%',
    display: 'inline-block',
    flexShrink: '0',
    animation: 'mcl-spin 0.8s linear infinite',
  });

  // Inject keyframes if not already present
  if (!document.getElementById('mcl-startup-toast-keyframes')) {
    const style = document.createElement('style');
    style.id = 'mcl-startup-toast-keyframes';
    style.textContent = '@keyframes mcl-spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  }

  const text = document.createElement('span');
  text.textContent = 'MacroLoop v' + version + ' — loading workspace\u2026';

  el.appendChild(spinner);
  el.appendChild(text);
  document.body.appendChild(el);

  // Fade in on next frame
  requestAnimationFrame(function () {
    el.style.opacity = '1';
  });

  // Auto-dismiss fallback
  dismissTimer = setTimeout(function () {
    removeStartupToast();
  }, AUTO_DISMISS_MS);
}

/**
 * Update the startup toast message text (e.g., progress updates).
 * No-op if the toast has already been dismissed.
 */
export function updateStartupToast(message: string): void {
  const el = document.getElementById(TOAST_ID);
  if (!el) return;

  const textSpan = el.querySelector('span:last-child');
  if (textSpan) {
    textSpan.textContent = message;
  }
}

/**
 * Remove the startup toast with a fade-out animation.
 * Safe to call multiple times / when toast doesn't exist.
 */
export function removeStartupToast(): void {
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }

  const el = document.getElementById(TOAST_ID);
  if (!el) return;

  el.style.opacity = '0';
  setTimeout(function () {
    el.remove();
  }, FADE_DURATION_MS);
}

/**
 * Check if the startup toast is still visible.
 */
export function isStartupToastVisible(): boolean {
  return !!document.getElementById(TOAST_ID);
}
