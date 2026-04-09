/**
 * Prompt Manager — Barrel re-export (Phase 5D)
 *
 * Split into prompt-loader.ts, prompt-dropdown.ts, prompt-injection.ts.
 * This barrel preserves backward-compatible imports.
 * See: spec/04-macro-controller/ts-migration-v2/05-module-splitting.md
 */

export {
  DEFAULT_PROMPTS,
  invalidatePromptCache,
  isPromptsCached,
  sendToExtension,
  loadPromptsFromJson,
  getPromptsConfig,
  setRevalidateContext,
} from './prompt-loader';
export { DEFAULT_PASTE_XPATH } from '../constants';

export type { PromptContext, EditablePrompt } from './prompt-loader';

export { renderPromptsDropdown } from './prompt-dropdown';

export { openPromptCreationModal } from './prompt-injection';
