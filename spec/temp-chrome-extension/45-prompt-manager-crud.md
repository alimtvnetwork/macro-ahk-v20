# Spec: Prompt Manager — In-Controller CRUD & Bug Fixes

**Version**: 1.0.0  
**Status**: DRAFT — Awaiting approval  
**Created**: 2026-03-19  

---

## 1. Problem Statement

### 1.1 Bug: "First prompt shows nothing"

**Root cause analysis:**

The `promptsBtn.onclick` handler calls `loadPromptsFromJson(callback)` which is **asynchronous** — it fetches prompts from the extension's bundled JSON, the message API, or a web URL. While it loads, `renderPromptsDropdown()` runs inside the callback. However, on the **first click**:

1. The dropdown opens (`display: block`) immediately at line 5847.
2. `loadPromptsFromJson` starts its async chain.
3. If prompts haven't loaded yet and `_loadedJsonPrompts` is `null`, `getPromptsConfig()` falls back to `DEFAULT_PROMPTS`.
4. The DEFAULT_PROMPTS entries for prompts 3–7 contain **stub text** prefixed with `"(Full text in macro-prompts.json)"` — these are abbreviated placeholders, NOT the real prompt text.

The user reports "first prompt shows nothing" — this likely means:
- The `pasteIntoEditor()` function either can't find the paste target (XPath changed) or the `clearTargetContent()` clears the chatbox but the synthetic paste fails silently.
- `dispatchEvent(pasteEvent)` returns `true` (not consumed), so `pasted` stays `false`, and all fallback strategies also fail.
- The text ends up on the clipboard only, but no visible feedback is shown in the chatbox.

**Secondary issue:** When `loadPromptsFromJson` succeeds on the second click (cached), it uses the full JSON text. But on the first click, the stub text is used. If the stub text starts with `"(Full text in...)"`, the user sees that unhelpful prefix pasted.

### 1.2 Feature: Add New Prompt from Controller

Users want to create, edit, and test prompts directly from the macro controller panel without switching to the Options page.

---

## 2. Proposed Solution

### 2.1 Bug Fix: Prompt Loading Race Condition

**Fix:** Show a "Loading…" state in the dropdown on first open. Only render prompt items after `loadPromptsFromJson` resolves. If the async load fails, fall back to DEFAULT_PROMPTS **but strip the stub prefix** `"(Full text in...)"` — show the actual summary text.

**Fix:** Add explicit feedback when paste fails — show a toast notification saying "Copied to clipboard — paste manually with Ctrl+V" instead of silently falling back.

### 2.2 Feature: In-Controller Prompt CRUD

#### UI: "➕ Add" button in the prompts dropdown

When clicked, opens a **modal popup** (reusing the existing about-modal pattern) containing:

1. **Title field** — text input for prompt name
2. **Content area** — a large textarea/editor supporting:
   - Plain text entry
   - Markdown formatting (rendered on preview)
   - Template variables (`{{date}}`, `{{time}}`, etc.)
3. **File drop zone** — drag & drop `.md`, `.txt`, or `.prompt` files to auto-fill title (from filename) and content
4. **Variable reference** — small collapsible section showing available `{{variables}}`
5. **Test button** — "📋 Paste Test" button that:
   - Resolves template variables
   - Attempts to paste into the current chatbox
   - Shows success/failure feedback with character count
6. **Save button** — persists to Chrome extension storage via message bridge

#### Storage & Communication

```
                    ┌─────────────────┐
                    │  Macro Controller│
                    │  (MAIN world)    │
                    └────────┬────────┘
                             │ window.postMessage
                             │ type: "SAVE_PROMPT" / "DELETE_PROMPT" / "GET_PROMPTS"
                    ┌────────▼────────┐
                    │  Content Script  │
                    │  (relay)         │
                    └────────┬────────┘
                             │ chrome.runtime.sendMessage
                    ┌────────▼────────┐
                    │  Background      │
                    │  (handler)       │
                    └────────┬────────┘
                             │ chrome.storage.local
                    ┌────────▼────────┐
                    │  Storage         │
                    │  marco_prompts   │
                    └─────────────────┘
```

**Message types to add:**

| Type | Direction | Payload | Response |
|------|-----------|---------|----------|
| `SAVE_PROMPT` | page → bg | `{ prompt: { name, text, category? } }` | `{ isOk, prompt: { id, name, text, ... } }` |
| `DELETE_PROMPT` | page → bg | `{ id: string }` | `{ isOk }` |
| `GET_PROMPTS` | page → bg | `{}` | `{ prompts: [...] }` |
| `UPDATE_PROMPT` | page → bg | `{ prompt: { id, name, text } }` | `{ isOk, prompt }` |

**Storage key:** `marco_prompts` in `chrome.storage.local`

**StoredPrompt interface:**
```typescript
interface StoredPrompt {
    id: string;
    name: string;
    text: string;
    category?: string;
    source: 'user' | 'builtin' | 'file';
    createdAt: string;
    updatedAt: string;
}
```

---

## 3. Side Effects & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Storage quota** — large prompts (10KB+) could fill chrome.storage.local | Medium | Enforce 50KB max per prompt, 500KB total for all prompts |
| **Message relay rate limit** — 100 msg/sec limit could block rapid saves | Low | Prompts are saved infrequently; single message per save |
| **Race condition** — user creates prompt while async load in flight | Medium | Lock UI during save; invalidate `_loadedJsonPrompts` cache after save |
| **XPath fragility** — paste target XPath may change with Lovable UI updates | High (existing) | Already mitigated by multi-strategy fallback; add auto-discovery selectors |
| **Content script relay** — SAVE_PROMPT must be allowlisted | Low | Add to existing allowlist in content-script-relay.ts |
| **Backward compatibility** — existing prompts from config and JSON must coexist | Medium | Merge strategy: user prompts override builtins by name match |

---

## 4. Task Breakdown

### Phase 1: Bug Fix (prompt loading race condition)
- **T-1.1**: Fix async loading — show "Loading…" spinner in dropdown on first open; render items only after callback
- **T-1.2**: Fix paste failure feedback — show toast when paste target not found or all strategies fail
- **T-1.3**: Strip `"(Full text in macro-prompts.json)"` prefix from DEFAULT_PROMPTS stub entries

### Phase 2: Backend — Prompt Storage Handler
- **T-2.1**: Create `StoredPrompt` type in `src/shared/prompt-types.ts`
- **T-2.2**: Create `src/background/handlers/prompt-handler.ts` with CRUD handlers (handleSavePrompt, handleGetAllPrompts, handleDeletePrompt, handleUpdatePrompt)
- **T-2.3**: Register message types in background message router (SAVE_PROMPT, DELETE_PROMPT, GET_PROMPTS, UPDATE_PROMPT)
- **T-2.4**: Add `SAVE_PROMPT` and `DELETE_PROMPT` to content-script-relay allowlist

### Phase 3: Frontend — Prompt Creation Modal
- **T-3.1**: Add "➕ Add" button at bottom of prompts dropdown
- **T-3.2**: Build prompt creation modal (title input, markdown textarea, variable reference, file drop zone)
- **T-3.3**: Implement file drop handler for `.md`, `.txt`, `.prompt` files
- **T-3.4**: Implement "📋 Paste Test" button with variable resolution and paste attempt
- **T-3.5**: Wire Save button to `window.postMessage({ type: 'SAVE_PROMPT', ... })`

### Phase 4: Integration & Merge
- **T-4.1**: Update `getPromptsConfig()` to merge user-saved prompts (from storage) with builtins and JSON file prompts
- **T-4.2**: Add edit and delete actions to existing prompt items in dropdown
- **T-4.3**: Update `loadPromptsFromJson` to also load user prompts via `GET_PROMPTS` message

### Phase 5: Testing
- **T-5.1**: Unit tests for prompt-handler.ts CRUD
- **T-5.2**: Integration test: save prompt → reload → verify prompt appears in dropdown
- **T-5.3**: Manual test: paste test with variable substitution on Lovable editor

---

## 5. Dependencies

- Existing content-script-relay.ts message bridge (already working)
- Existing `window.postMessage` bridge in macro-looping.js
- `chrome.storage.local` (already used for scripts/configs)
- Template variable resolution (already implemented, see `memory/features/macro-controller/prompt-variables`)

## 6. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/shared/prompt-types.ts` | CREATE | StoredPrompt interface |
| `src/background/handlers/prompt-handler.ts` | CREATE | CRUD handlers for prompts |
| `src/background/message-router.ts` | MODIFY | Register new message types |
| `src/content/content-script-relay.ts` | MODIFY | Allowlist SAVE_PROMPT, DELETE_PROMPT |
| `standalone-scripts/macro-controller/01-macro-looping.js` | MODIFY | Bug fixes + Add button + modal + integration |
| `chrome-extension/tests/handlers/prompt-handler.test.ts` | CREATE | Unit tests |
