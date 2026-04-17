# Workspace UI Enhancements — Spec v2.148.0

> **Target version**: v2.148.0
> **Created**: 2026-04-17 (Asia/Kuala_Lumpur)
> **Owner area**: `standalone-scripts/macro-controller/src/ws-*`
> **Related memory**: `mem://features/project-selector-fix-v2147`, `mem://ui/selector-standards`

---

## 1. Goals

Five user-driven changes to the Macro Controller workspace panel:

1. **Right-click → Copy JSON** — add an action that copies the *raw API JSON* of just that workspace's section (not normalized, not the full payload).
2. **Filter hamburger menu** — collapse all secondary filter toggles into a single dropdown in the top-right of the workspace panel header. Only "Focus current" stays inline.
3. **New filter: "Expired with credits"** — show only workspaces whose `subscriptionStatus` indicates expiry AND `available > 5` credits, sorted by `available` descending (highest first).
4. **Expired-since label** — append a day-count next to the existing "expired" badge (e.g. `expired · 12d`), derived from the API JSON.
5. **Shift-click respects visibility** — selecting a range with Shift must skip rows that are currently hidden by *any* filter (search, free-only, rollover, billing, expired-with-credits, focus-current, compact mode). This is a bug fix.

Out of scope: changes to credit-fetch logic, rename flow, or non-workspace UI.

---

## 2. Affected files

| File | Change |
|---|---|
| `src/ws-context-menu.ts` | Add "📋 Copy JSON" menu item below Rename. |
| `src/types/credit-types.ts` | Already has `raw: Record<string, string \| number>` on `WorkspaceCredit` — confirm raw API object is stored there end-to-end. If only flat KV is stored, extend to `rawApi?: Record<string, unknown>` so the per-workspace JSON section is preserved verbatim. |
| `src/credit-parser.ts` | Persist the per-workspace raw API object onto `WorkspaceCredit.rawApi` (best-effort; absent = fall back to current `raw`). |
| `src/ws-list-renderer.ts` | (a) Add `expiredWithCredits` to `WsFilterState` and `passesFilters`; (b) sort by `available desc` when that filter is active; (c) include filter in render-hash. |
| `src/ui/ws-filter-menu.ts` *(new)* | Build the hamburger dropdown — icon button + popover containing all filter toggles with hover tooltips. |
| `src/loop-controls.ts` (or wherever the WS panel header is composed) | Replace inline filter row with: `[Focus current toggle]` + `[☰ icon button]`. Mount `ws-filter-menu` on click. |
| `src/ws-checkbox-handler.ts` | Make `handleWsCheckboxClick` consult **visible-row order** (DOM-derived) instead of `loopCreditState.perWorkspace` indices. |
| `src/ws-list-renderer.ts` | Append `· {N}d` to the existing expired badge using a `formatExpiredSince(ws)` helper. |
| `src/constants.ts` | New ID/attr constants: `ID_LOOP_WS_FILTER_MENU_BTN`, `ID_LOOP_WS_FILTER_MENU_POPOVER`, `ID_LOOP_WS_EXPIRED_FILTER`, `CSS_FILTER_MENU_*`. |

---

## 3. Behavior details

### 3.1 Copy JSON (context menu)

- Label: `📋 Copy JSON`
- Click → `navigator.clipboard.writeText(JSON.stringify(ws.rawApi ?? ws.raw, null, 2))`.
- Toast: `📋 Copied JSON for {ws.name}` on success, `❌ Copy failed` on error (uses existing `showToast`).
- The copied object is the **single workspace section only** (no wrapper, no other workspaces).

### 3.2 Filter hamburger menu

- Trigger: a small `☰` icon button mounted in the top-right of the WS panel header (not the search row).
- Popover: dark-theme styled, anchored bottom-right of the trigger, dismisses on outside-click or Escape.
- Contents (each as a labeled checkbox row with an icon + 1-line tooltip via `title=`):
  - `🆓 Free only` — *Show only workspaces with daily free credits available.*
  - `🔁 Rollover` — *Show only workspaces with rollover credits.*
  - `💳 Billing` — *Show only workspaces with billing credits available.*
  - `⏰ Expired w/ >5 credits` *(NEW)* — *High-priority cleanup: expired subscriptions still holding credits.*
  - `📦 Compact mode` — *Hide credit bars to fit more rows.*
- "Focus current" stays as a separate inline toggle in the header (not inside the menu) — user requirement.
- Menu state persists via existing `localStorage` keys (`ml_compact_mode`, `ml_free_only`, etc.) plus new `ml_expired_with_credits`.

### 3.3 Expired-with-credits filter

- Predicate: `isExpired(ws) && ws.available > 5`.
- `isExpired(ws)`: `EXPIRED_STATUSES.has(ws.subscriptionStatus)` where `EXPIRED_STATUSES = new Set(['past_due','canceled','unpaid','incomplete','incomplete_expired'])`.
- When this filter is active, sort visible rows by `ws.available` **descending**; ties → fallback to existing alphabetical order.
- Sort applied only inside `renderLoopWorkspaceList` (no mutation of `loopCreditState.perWorkspace`).

### 3.4 Expired-since day count

- Helper `formatExpiredSince(ws): string | null`:
  - Read `ws.rawApi.updated_at` (ISO timestamp; per `sample-response.json`).
  - If status not in `EXPIRED_STATUSES` → return `null`.
  - Else → ` · ${daysSince(updated_at)}d` (`Math.max(0, floor((now - ts) / 86400000))`).
- Render appended to the existing badge text, e.g. `expired · 12d`.
- If `updated_at` missing → render badge without day count (graceful).

> **Note on field choice**: the API response has no explicit "expired_at" field. `updated_at` is the closest available signal. If we later discover a more precise field after seeing real expired-account JSON via the new Copy JSON action, we will revise this single helper.

### 3.5 Shift-click bug fix

Replace the `perWorkspace`-indexed loop in `handleWsCheckboxClick` with DOM-derived visible-order:

```ts
const listEl = document.getElementById(DomId.LoopWsList);
const visibleItems = Array.from(listEl?.querySelectorAll(SEL_LOOP_WS_ITEM) ?? []);
const visibleIds: string[] = visibleItems
  .map(el => el.getAttribute(DataAttr.WsId))
  .filter((id): id is string => !!id);

const currentVisibleIdx = visibleIds.indexOf(wsId);
const lastVisibleIdx = getLoopWsLastCheckedId() != null
  ? visibleIds.indexOf(getLoopWsLastCheckedId()!)
  : -1;

if (isShift && lastVisibleIdx >= 0 && currentVisibleIdx >= 0) {
  const lo = Math.min(lastVisibleIdx, currentVisibleIdx);
  const hi = Math.max(lastVisibleIdx, currentVisibleIdx);
  for (let s = lo; s <= hi; s++) getLoopWsCheckedIds()[visibleIds[s]] = true;
}
```

- Replaces `LoopWsLastCheckedIdx: number` with `LoopWsLastCheckedId: string | null` (idx becomes meaningless across re-renders/filter changes).
- Existing single-click toggle path unchanged.

---

## 4. Versioning

Bump to **v2.148.0** across the 7 sync points:
`chrome-extension/manifest.json` (×2), `src/shared/constants.ts`, `standalone-scripts/macro-controller/src/{shared-state.ts,instruction.ts}`, `standalone-scripts/marco-sdk/src/instruction.ts`, `standalone-scripts/xpath/src/instruction.ts`.

---

## 5. Acceptance criteria

| # | Test |
|---|---|
| AC1 | Right-click any workspace → "📋 Copy JSON" present; click copies that workspace's raw API object as pretty JSON; toast confirms. |
| AC2 | WS panel header shows `[Focus current] [☰]`. Clicking ☰ opens a dropdown with all 5 filter toggles + tooltips on hover. |
| AC3 | Toggling "Expired w/ >5 credits" hides everything else; visible rows are expired AND `available > 5`, sorted highest-credit first. |
| AC4 | Workspaces with expired status show `expired · Nd` next to the badge, where N matches days since `updated_at`. |
| AC5 | With the search box filtering down to 3 rows out of 50, Shift-click from row 1 to row 3 selects exactly those 3 — no hidden rows are checked. |
| AC6 | All existing tests pass; zero new ESLint warnings. |
| AC7 | Version reads `2.148.0` everywhere; `npm run build` succeeds. |

---

## 6. Work plan (one step per `next`)

1. **Type plumbing** — add `rawApi?: Record<string, unknown>` to `WorkspaceCredit`, plumb through `credit-parser.ts` so per-workspace API JSON is preserved.
2. **Context menu: Copy JSON** — add the menu item, wire clipboard + toast.
3. **Constants + filter state** — add new IDs/CSS constants and extend `WsFilterState` + `passesFilters` for `expiredWithCredits`; persist via `localStorage`.
4. **Expired helpers + badge** — implement `isExpired()`, `formatExpiredSince()`, render `· Nd` on the badge.
5. **Sort by available desc when expired-credits filter active** — implement inside `renderLoopWorkspaceList`.
6. **Filter hamburger UI** — new `ui/ws-filter-menu.ts`, mount in WS panel header, move all secondary toggles inside.
7. **Shift-click visibility fix** — switch from index-based to DOM-visible-id-based range selection in `ws-checkbox-handler.ts`.
8. **Version bump to v2.148.0** — all 7 sync points + memory update.

Each step gets its own `next` turn. After each step I will list remaining tasks per user preference.

---

*Spec v1.0 — 2026-04-17*
