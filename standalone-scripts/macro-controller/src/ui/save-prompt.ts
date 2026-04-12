/**
 * MacroLoop Controller — Save Prompt & Chatbox Prompts Button
 *
 * Injects two buttons into the chatbox toolbar:
 * 1. Save Prompt — saves chatbox content as a new prompt
 * 2. Prompts — opens a floating dropdown to paste any prompt into the editor
 *
 * Sub-modules: save-prompt-html-converter, save-prompt-dropdown.
 *
 * @see spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

import { log } from '../logging';
import { pollUntil } from '../async-utils';
import { showPasteToast, findPasteTarget } from './prompt-utils';
import type { TaskNextDeps } from './task-next-ui';
import type { ResolvedPromptsConfig } from '../types';
import { htmlToMarkdown } from './save-prompt-html-converter';
import { createPromptsDropdown, positionDropdownAboveButton, renderChatboxPromptsDropdown } from './save-prompt-dropdown';
import { logError } from '../error-utils';
import { showToast } from '../toast';

// Re-export for backward compatibility
export { htmlToMarkdown } from './save-prompt-html-converter';

export interface SavePromptDeps {
  getPromptsConfig: () => ResolvedPromptsConfig;
  getByXPath: (xpath: string) => Element | null;
  openPromptCreationModal: (data: { name: string; text: string; category: string }) => void;
  taskNextDeps?: TaskNextDeps;
}

/* ------------------------------------------------------------------ */
/*  Save Prompt Click Handler                                          */
/* ------------------------------------------------------------------ */

export function onSavePromptClick(deps: SavePromptDeps): void {
  const target = findPasteTarget(deps.getPromptsConfig(), deps.getByXPath);
  const isTargetMissing = !target;

  if (isTargetMissing) {
    showPasteToast('❌ Chatbox not found — cannot save prompt', true);
    return;
  }

  const markdown = htmlToMarkdown(target as HTMLElement);
  const isEmpty = !markdown || !markdown.trim();

  if (isEmpty) {
    showPasteToast('⚠️ Chatbox is empty — nothing to save', true);
    return;
  }

  const title = extractTitleFromMarkdown(markdown);

  deps.openPromptCreationModal({
    name: title,
    text: markdown,
    category: '',
  });

  log('Save Prompt: Opened creation modal with chatbox content (' + markdown.length + ' chars)', 'info');
  showPasteToast('💾 Chatbox content loaded into prompt editor', false);
}

function extractTitleFromMarkdown(markdown: string): string {
  const lines = markdown.split('\n').filter(function (line) { return line.trim(); });
  let rawTitle = (lines[0] || 'Untitled Prompt').trim();
  rawTitle = rawTitle.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim();

  const isTooLong = rawTitle.length > 80;

  if (isTooLong) {
    rawTitle = rawTitle.substring(0, 80) + '…';
  }

  return rawTitle;
}

/* ------------------------------------------------------------------ */
/*  Container Detection                                                */
/* ------------------------------------------------------------------ */

const SAVE_PROMPT_XPATH = '/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]/div';

const SAVE_PROMPT_CSS_FALLBACKS = [
  'form div[class*="flex"] > div[type="button"]',
  'main form div:last-child > div:last-child',
  'form [data-state] button[aria-label]',
  'main form div.flex.items-center',
];

export function findSavePromptContainer(): Element | null {
  try {
    const xpathResult = document.evaluate(SAVE_PROMPT_XPATH, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    const isFound = xpathResult !== null;

    if (isFound) {
      log('Save Prompt: Container found via XPath', 'check');
      return xpathResult as Element;
    }
  } catch (_e: unknown) { log('Save Prompt: XPath eval error: ' + (_e instanceof Error ? _e.message : String(_e)), 'warn'); }

  return findContainerViaCssFallback();
}

function findContainerViaCssFallback(): Element | null {
  for (const [fallbackIndex, fallbackSelector] of SAVE_PROMPT_CSS_FALLBACKS.entries()) {
    try {
      const isToolbarButtonFallback = fallbackIndex === 2;

      if (isToolbarButtonFallback) {
        const toolbarBtn = document.querySelector(fallbackSelector);
        const hasParent = toolbarBtn !== null && toolbarBtn.parentElement !== null;

        if (hasParent) {
          log('Save Prompt: Container found via CSS fallback #' + (fallbackIndex + 1) + ' (parent of toolbar button)', 'check');

          return toolbarBtn!.parentElement;
        }
      } else {
        const element = document.querySelector(fallbackSelector);
        const isFound = element !== null;

        if (isFound) {
          log('Save Prompt: Container found via CSS fallback #' + (fallbackIndex + 1), 'check');

          return element;
        }
      }
    } catch (_e: unknown) { log('Save Prompt: CSS selector error at fallback #' + (fallbackIndex + 1) + ': ' + (_e instanceof Error ? _e.message : String(_e)), 'warn'); }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Toolbar Constants & Injection                                      */
/* ------------------------------------------------------------------ */

const TOOLBAR_BTN_CLASS = 'relative box-border inline-flex min-w-fit items-center justify-center whitespace-nowrap text-sm font-normal brightness-100 transition-[background-color,opacity,color,filter] duration-150 ease-in-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 btn-safari-fix shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.2),inset_0_0_0_0.5px_rgba(0,0,0,0.2),0_1px_2px_0_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0.5px_0_0_rgba(255,255,255,0.2),inset_0_0_0_0.5px_rgba(255,255,255,0.1),0_1px_2px_0_rgba(0,0,0,0.05)] active:brightness-[0.65] disabled:brightness-100 gap-1.5 px-3 py-2 rounded-full !p-0 bg-secondary text-primary h-7 w-7';

const SAVE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 size-4" aria-hidden="true"><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/></svg>';

const PROMPTS_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 size-4" aria-hidden="true"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>';

function addHoverEffect(button: HTMLElement): void {
  button.addEventListener('mouseover', function () { button.style.filter = 'brightness(0.8)'; });
  button.addEventListener('mouseout', function () { button.style.filter = ''; });
}

// CQ16: Extracted from injectSavePromptButton closure
interface InjectCtx {
  injected: boolean;
  deps: SavePromptDeps;
}

function tryInjectSavePrompt(ctx: InjectCtx): boolean {
  if (ctx.injected) {
    return true;
  }

  const isAlreadyPresent = document.getElementById('marco-save-prompt-btn') !== null;

  if (isAlreadyPresent) {
    ctx.injected = true;

    return true;
  }

  try {
    const container = findSavePromptContainer();
    const isContainerMissing = container === null;

    if (isContainerMissing) {
      return false;
    }

    const promptsWrapper = buildPromptsButton(ctx.deps);
    const saveWrapper = buildSaveButton(ctx.deps);

    container!.prepend(saveWrapper);
    container!.prepend(promptsWrapper);

    ctx.injected = true;
    log('Save Prompt + Prompts buttons injected into chatbox toolbar', 'info');

    return true;
  } catch (e: unknown) {
    logError('savePrompt', 'Prompt save failed', e);
    showToast('❌ Prompt save failed', 'error');
    return false;
  }
}

/**
 * Inject Save Prompt and Prompts buttons into chatbox toolbar.
 * Retries on interval until found or timeout.
 */
export function injectSavePromptButton(deps: SavePromptDeps): void {
  const ctx: InjectCtx = { injected: false, deps };

  pollUntil(function() { return tryInjectSavePrompt(ctx); }, {
    intervalMs: 2000,
    timeoutMs: 30000,
  });
}

function buildPromptsButton(deps: SavePromptDeps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('type', 'button');
  wrapper.setAttribute('data-state', 'closed');
  wrapper.id = 'marco-chatbox-prompts-btn';

  const button = document.createElement('button');
  button.className = TOOLBAR_BTN_CLASS;
  button.type = 'button';
  button.setAttribute('aria-label', 'Prompts');
  button.title = 'Browse and paste prompts into editor';
  button.style.cssText = 'cursor:pointer;';
  button.innerHTML = PROMPTS_ICON_SVG;

  button.onclick = function (event) {
    event.stopPropagation();
    event.preventDefault();
    const dropdown = createPromptsDropdown();
    const isCurrentlyOpen = dropdown.style.display !== 'none';

    if (isCurrentlyOpen) {
      dropdown.style.display = 'none';
      return;
    }

    renderChatboxPromptsDropdown(dropdown, deps);
    positionDropdownAboveButton(dropdown, button);
  };

  addHoverEffect(button);
  wrapper.appendChild(button);
  return wrapper;
}

function buildSaveButton(deps: SavePromptDeps): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.setAttribute('type', 'button');
  wrapper.setAttribute('data-state', 'closed');
  wrapper.id = 'marco-save-prompt-btn';

  const button = document.createElement('button');
  button.className = TOOLBAR_BTN_CLASS;
  button.type = 'button';
  button.setAttribute('aria-label', 'Save Prompt');
  button.title = 'Save current chatbox content as a new prompt';
  button.style.cssText = 'cursor:pointer;';
  button.innerHTML = SAVE_ICON_SVG;

  button.onclick = function (event) {
    event.stopPropagation();
    event.preventDefault();
    onSavePromptClick(deps);
  };

  addHoverEffect(button);
  wrapper.appendChild(button);
  return wrapper;
}
