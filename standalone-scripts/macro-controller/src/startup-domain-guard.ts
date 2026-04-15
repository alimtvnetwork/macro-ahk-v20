/**
 * MacroLoop Controller — Domain Guard
 * Extracted from macro-looping.ts (V2 Phase 02).
 *
 * Prevents injection into DevTools, non-page contexts,
 * and embedded preview iframes (id-preview--*.lovable.app).
 * Returns true if injection should proceed, false to abort.
 */

// VERSION available via shared-state if needed for domain guard logging

/**
 * Check whether the current page context is valid for injection.
 * @returns true if injection should proceed
 */
export function shouldInject(): boolean {
  const currentHostname = window.location.hostname || '(empty)';
  const currentHref = window.location.href || '(empty)';

  // Block preview iframe: id-preview--{uuid}.lovable.app
  // Auth cookies are unavailable here and DOM scraping returns false workspace names.
  const isPreviewIframe = currentHostname.indexOf('id-preview--') === 0 && currentHostname.indexOf('.lovable.app') !== -1;
  if (isPreviewIframe) {
    console.warn(
      '[MacroLoop] DOMAIN GUARD ABORT — Preview iframe detected\n' +
      '  hostname: ' + currentHostname + '\n' +
      '  cause: Preview iframe has no auth cookies; workspace detection would return false names.\n' +
      '  UI will NOT be injected here.'
    );
    return false;
  }

  // Block non-embedded iframes (window !== top)
  if (window !== window.top && !window.__comboForceInject) {
    console.warn(
      '[MacroLoop] DOMAIN GUARD ABORT — Embedded iframe detected\n' +
      '  hostname: ' + currentHostname + '\n' +
      '  href: ' + currentHref + '\n' +
      '  cause: Script running inside an iframe, not the top-level page.\n' +
      '  bypass: Set window.__comboForceInject = true before pasting.\n' +
      '  UI will NOT be injected here.'
    );
    return false;
  }

  const isPageContext = (
    currentHostname.indexOf('lovable.dev') !== -1 ||
    currentHostname.indexOf('lovable.app') !== -1 ||
    currentHostname.indexOf('lovableproject.com') !== -1 ||
    currentHostname === 'localhost'
  );

  if (!isPageContext && !window.__comboForceInject) {
    console.warn(
      '[MacroLoop] DOMAIN GUARD ABORT\n' +
      '  hostname: ' + currentHostname + '\n' +
      '  href: ' + currentHref + '\n' +
      '  expected: *.lovable.dev | *.lovable.app | *.lovableproject.com | localhost\n' +
      '  cause: Script executed in DevTools context instead of page context.\n' +
      '  bypass: Set window.__comboForceInject = true before pasting.\n' +
      '  UI will NOT be injected here.'
    );
    return false;
  }

  return true;
}
