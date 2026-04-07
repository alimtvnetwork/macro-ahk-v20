# RC-04: Prompt Population Failure

**Parent:** [01-overview.md](./01-overview.md)
**Status:** 🔴 Open — Priority root cause analysis

---

## Symptom

Prompts are not populating in the macro controller dropdown. This has been reported multiple times across versions.

## Prior Issues (Same Area)

| Issue | Version | Summary | Status |
|-------|---------|---------|--------|
| [#50](../50-prompt-loading-breaking-issues.md) | v1.49.0 | First-click race, paste failure, storage quota, category filter | ✅ Fixed |
| [#52](../52-prompt-click-does-nothing.md) | — | Prompt click does nothing | — |
| [#53](../53-prompt-click-simplified-dom-append.md) | — | Simplified DOM append for prompt injection | — |
| [#45](../45-first-prompt-injection-empty.md) | — | First prompt injection empty | — |
| [#61](../61-add-prompt-save-stuck-relay-timeout.md) | — | Add prompt save stuck on relay timeout | — |
| [#64](../64-prompts-loading-when-cached.md) | v1.61.0 | Loading indicator shown even when cached | ✅ Fixed |

## Prompt Data Flow (Current Architecture)

```
Source of Truth: Extension SQLite (prompts table in logs.db)
                     ↓
    Background: prompt-handler.ts → GET_PROMPTS message response
                     ↓
    Content Script: message relay (window.postMessage ↔ chrome.runtime)
                     ↓
    Macro Controller: loadPromptsFromJson() in prompt-loader/prompt-manager
                     ↓
    Cache: IndexedDB (marco_prompts_cache) — stale-while-revalidate
                     ↓
    UI: renderPromptsDropdown() → dropdown items
```

### Load Trigger Points

1. **Boot pre-warm** (`startup.ts` lines 119-146):
   - Tries `window.marco.prompts.preWarm()` (SDK)
   - Fallback: dynamic `import('./ui/prompt-loader').then(mod => mod.loadPromptsFromJson())`
   - Result: populates IndexedDB cache so dropdown opens instantly

2. **Dropdown click** (`panel-builder.ts`):
   - If `isPromptsCached()` → render immediately
   - If not cached → show "⏳ Loading prompts…" → `loadPromptsFromJson(callback)` → render

3. **Background revalidation**:
   - After rendering cached data, sends `GET_PROMPTS` to extension
   - Compares hash of prompt names+lengths
   - If changed → updates IndexedDB + re-renders

## Root Cause Analysis

### RCA-1: SDK prompt pre-warm depends on SDK being available

`startup.ts` line 121 checks `window.marco?.prompts?.preWarm`. If the SDK script hasn't executed yet (it's injected separately and may load after macro-controller), this path is skipped.

The fallback (`import('./ui/prompt-loader')`) uses a dynamic import which only works if the macro controller is bundled with the prompt-loader module. In the standalone script build, dynamic imports may not resolve.

### RCA-2: Message relay not ready

`loadPromptsFromJson()` sends `GET_PROMPTS` via `sendToExtension()` which uses `window.postMessage` → content script relay → `chrome.runtime.sendMessage`. If:
- Content script relay is not injected yet → message is lost
- Service worker is not ready → message times out
- Relay probe fails → falls back to direct messaging which may also fail

### RCA-3: SQLite prompt data empty or stale

`reseedPrompts()` in boot.ts (line 78) reseeds prompts from dist files. If:
- The dist prompt files are missing from the build
- The reseed logic has a version guard that prevents overwriting
- The SQLite prompts table is corrupted

Then `GET_PROMPTS` returns an empty array.

### RCA-4: IndexedDB cache TTL + hash mismatch

Spec 52 defines a 24h TTL for cached prompts. If:
- Cache is expired → falls through to extension fetch
- Extension fetch fails → falls back to DEFAULT_PROMPTS (stubs)
- DEFAULT_PROMPTS contain abbreviated placeholders, not real content

### RCA-5: Render race condition

If `renderPromptsDropdown()` is called before `loadPromptsFromJson` resolves, it renders an empty or default list. Issue #64 addressed the loading indicator, but if `isPromptsCached()` returns true with stale/empty data, the dropdown renders empty without a loading state.

## Required Investigation

1. **Check prompt-loader.ts / prompt-manager.ts** — verify `loadPromptsFromJson()` implementation and error handling
2. **Check SDK `prompts.preWarm()`** — verify the SDK exposes this method and it connects to the extension backend
3. **Check reseedPrompts()** — verify dist prompt files exist and reseed populates the SQLite table
4. **Check message relay timing** — is the relay ready when prompts are fetched?
5. **Test IndexedDB cache** — what data is actually in `marco_prompts_cache`?

## Proposed Fix Path

1. **Add independent DOM-based prompt loading** — don't depend on SDK for initial prompt fetch
2. **Eagerly load prompts during injection** — background can include prompts in the script preamble (window.__MARCO_PROMPTS__)
3. **Add prompt loading diagnostics** — log each step of the prompt fetch pipeline with timing
4. **Fallback to embedded prompts** — if all fetch methods fail, use meaningful default prompts (not stubs)
5. **Visual loading/error states** — show clear "No prompts available" vs "Loading prompts..." vs "Prompts loaded (N)"

## Acceptance Criteria

- [ ] Prompts appear in dropdown within 500ms of first click
- [ ] If no prompts available, a clear empty state message is shown (not blank)
- [ ] Prompt loading path is logged with timing for diagnostics
- [ ] Pre-warm runs successfully during startup (logged to activity log)
- [ ] Prompts persist across page reloads via IndexedDB cache
