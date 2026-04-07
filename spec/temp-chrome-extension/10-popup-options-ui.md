# Chrome Extension — Popup & Options Page UI Specification

**Version**: v0.1 (Planning)
**Date**: 2026-02-25

---

## Purpose

Define the layout, components, interaction flows, and visual design for the extension's **popup** (click on extension icon) and **options page** (right-click → Options, or popup → Settings link). The in-page controller panels (combo.js / macro-looping.js floating UIs) are out of scope — they retain their existing design.

---

## Design Principles

1. **Scannable at a glance** — Status, errors, and key metrics visible without scrolling
2. **Dark theme** — Matches Lovable's dark IDE aesthetic; reduces visual clash
3. **Monospace data** — XPaths, tokens, and technical values in monospace
4. **Consistent with panel UI** — Same color tokens as the in-page controller panels
5. **Minimal chrome** — No unnecessary decoration; every pixel earns its place

### Color Tokens

```css
:root {
  --bg-primary:    #0f172a;   /* Slate 900 */
  --bg-secondary:  #1e293b;   /* Slate 800 */
  --bg-tertiary:   #334155;   /* Slate 700 */
  --text-primary:  #e2e8f0;   /* Slate 200 */
  --text-secondary:#94a3b8;   /* Slate 400 */
  --text-muted:    #64748b;   /* Slate 500 */
  --accent-green:  #4ade80;   /* Green 400 */
  --accent-yellow: #fbbf24;   /* Amber 400 */
  --accent-red:    #ef4444;   /* Red 500 */
  --accent-blue:   #60a5fa;   /* Blue 400 */
  --accent-purple: #a78bfa;   /* Violet 400 */
  --accent-cyan:   #67e8f9;   /* Cyan 300 */
  --border:        #475569;   /* Slate 600 */
  --font-mono:     'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
  --font-sans:     'Inter', system-ui, sans-serif;
}
```

---

## Popup UI

### Dimensions

- **Width**: 380px (fixed)
- **Max height**: 580px (scrollable if content exceeds)
- **Min height**: 280px

### Layout — Master Wireframe

```
┌──────────────────────────────────────────────────────┐
│  HEADER                                              │
│  🔧 Marco Extension              v1.1.0 (build 42)  │
├──────────────────────────────────────────────────────┤
│  ERROR BAR (conditional — only shown when errors)    │
│  ⚠ SQLite unavailable — using JSON fallback          │
├──────────────────────────────────────────────────────┤
│  STATUS SECTION                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Connection │ │ Token      │ │ Config     │       │
│  │ ✅ Online  │ │ ✅ Valid   │ │ ✅ Loaded  │       │
│  │            │ │ 23h left   │ │ local      │       │
│  └────────────┘ └────────────┘ └────────────┘       │
├──────────────────────────────────────────────────────┤
│  WORKSPACE SECTION                                   │
│  Current: Production (ws_abc123)                     │
│  Credits: ████████░░ 142/200 (71%)                   │
│  Free:    ██░░░░░░░░ 2/5 available                   │
├──────────────────────────────────────────────────────┤
│  SCRIPTS SECTION                                     │
│  combo.js        ✅ injected  │ [Reinject]           │
│  macro-looping   ✅ injected  │ [Reinject]           │
│  xpath-recorder  ⬚ inactive  │ [🔴 Record]          │
├──────────────────────────────────────────────────────┤
│  QUICK ACTIONS                                       │
│  [📋 Copy Logs] [💾 Export DB] [🔄 Refresh All]     │
├──────────────────────────────────────────────────────┤
│  FOOTER                                              │
│  Storage: 3.2 MB / 10 MB        [⚙ Settings]       │
└──────────────────────────────────────────────────────┘
```

---

### Component Breakdown

#### 1. Header

```
┌──────────────────────────────────────────────────────┐
│  🔧 Marco Extension              v1.1.0 (build 42)  │
└──────────────────────────────────────────────────────┘
```

- Left: Extension icon (16px SVG) + name
- Right: Version from `chrome.runtime.getManifest().version_name`
- Background: `--bg-primary`
- Height: 40px
- Bottom border: 1px `--border`

#### 2. Error Bar (Conditional)

Only rendered when `activeErrors.size > 0`. Shows worst-severity error.

```
┌──────────────────────────────────────────────────────┐
│  ⚠ SQLite unavailable — using JSON fallback     [×] │
└──────────────────────────────────────────────────────┘
```

| Severity | Background | Icon |
|----------|-----------|------|
| Warning | `--accent-yellow` at 15% opacity | ⚠ |
| Error | `--accent-red` at 15% opacity | ❌ |
| Fatal | `--accent-red` at 25% opacity | 🛑 |

- Dismissible `[×]` for warnings; non-dismissible for fatal
- If multiple errors: show count badge `"3 issues"` with expand arrow
- Clicking expands to show all active errors as a list

#### 3. Status Cards

Three equal-width cards in a horizontal row:

```
┌────────────┐ ┌────────────┐ ┌────────────┐
│ Connection │ │ Token      │ │ Config     │
│ ✅ Online  │ │ ✅ Valid   │ │ ✅ Loaded  │
│            │ │ 23h left   │ │ local      │
└────────────┘ └────────────┘ └────────────┘
```

| Card | States | Detail Line |
|------|--------|-------------|
| Connection | ✅ Online / 📡 Offline / ⚠ Degraded | — |
| Token | ✅ Valid / ⚠ Expiring / ❌ Expired / ❌ Missing | Time until expiry or `"log in"` |
| Config | ✅ Loaded / ⚠ Defaults / ❌ Failed | `"local"` / `"remote"` / `"hardcoded"` |

- Each card: 110px wide, 64px tall
- Background: `--bg-secondary`
- Border-radius: 8px
- Status icon + label: centered, 13px font
- Detail line: `--text-muted`, 11px font

#### 4. Workspace Section

```
┌──────────────────────────────────────────────────────┐
│  Current: Production (ws_abc123)                     │
│  Credits: ████████░░ 142/200 (71%)                   │
│  Free:    ██░░░░░░░░ 2/5 available                   │
└──────────────────────────────────────────────────────┘
```

- Workspace name: `--text-primary`, 14px, bold
- Workspace ID: `--text-muted`, 11px, monospace
- Progress bars: 200px wide, 8px tall, rounded
  - Credits bar: green gradient (`--accent-green` to `--accent-cyan`)
  - Free credits bar: `--accent-purple`
  - Empty track: `--bg-tertiary`
- Numbers: right-aligned, monospace, 12px

**Empty state** (no workspace detected):
```
┌──────────────────────────────────────────────────────┐
│  No workspace detected                               │
│  Open a project on lovable.dev to activate           │
└──────────────────────────────────────────────────────┘
```

#### 5. Scripts Section

```
┌──────────────────────────────────────────────────────┐
│  combo.js        ✅ injected          [Reinject]     │
│  macro-looping   ✅ injected          [Reinject]     │
│  xpath-recorder  ⬚ inactive          [🔴 Record]    │
└──────────────────────────────────────────────────────┘
```

Each row: script name (left), status indicator (center), action button (right).

| Script | Status States | Action Button |
|--------|--------------|---------------|
| combo.js | ✅ injected / ❌ failed / ⬚ not on page | `[Reinject]` — force re-inject |
| macro-looping | ✅ injected / ❌ failed / ⬚ not on page | `[Reinject]` — force re-inject |
| xpath-recorder | 🔴 recording / ⬚ inactive | `[🔴 Record]` / `[⏹ Stop]` toggle |

- `[Reinject]` button: secondary style, `--bg-tertiary` background, 11px
- `[🔴 Record]` button: red accent when active, pulses gently
- Status dot: 8px circle, color matches state
- Script name: monospace, `--text-secondary`, 12px

**Reinject flow**:
1. Click `[Reinject]`
2. Button shows spinner `[⟳]` for 1s
3. Background calls `chrome.scripting.executeScript`
4. On success: status changes to ✅, button resets
5. On fail: status changes to ❌, tooltip shows error

**XPath Recorder flow**:
1. Click `[🔴 Record]`
2. Button changes to `[⏹ Stop (3)]` with count of captured XPaths
3. Popup stays open; recording happens in the active tab
4. Click `[⏹ Stop]` → shows captured XPaths list (see below)

#### 5a. XPath Recorder Results (Expanded)

When recorder stops with captured XPaths, the scripts section expands:

```
┌──────────────────────────────────────────────────────┐
│  xpath-recorder  ⏹ 5 captured         [🔴 Record]   │
│  ┌────────────────────────────────────────────────┐   │
│  │ 1. //button[@aria-label='Transfer']        📋 │   │
│  │    <button> "Transfer project"                │   │
│  │ 2. //div[@role='dialog']//p.truncate       📋 │   │
│  │    <p> "My Workspace"                         │   │
│  │ 3. //button[@role='combobox']              📋 │   │
│  │    <button> "Select workspace"                │   │
│  └────────────────────────────────────────────────┘   │
│  [Copy All XPaths]  [Export JSON]  [Clear]            │
└──────────────────────────────────────────────────────┘
```

- Each entry: XPath in monospace, copy button `📋`, element tag + text preview below
- `[Copy All XPaths]`: copies newline-separated XPaths to clipboard
- `[Export JSON]`: downloads full structured JSON (see `07-advanced-features.md`)
- `[Clear]`: resets list

#### 6. Quick Actions

```
┌──────────────────────────────────────────────────────┐
│  [📋 Copy Logs] [💾 Export DB] [🔄 Refresh All]     │
└──────────────────────────────────────────────────────┘
```

Three equal-width buttons in a row:

| Button | Action | Feedback |
|--------|--------|----------|
| `📋 Copy Logs` | Copies current session logs as formatted text to clipboard | Button text changes to `"✅ Copied!"` for 2s |
| `💾 Export DB` | Opens dropdown: `logs.db` / `errors.db` / `Both` → triggers download | Brief spinner then download starts |
| `🔄 Refresh All` | Re-reads cookie, re-fetches workspaces, re-checks credits | All status cards flash briefly, values update |

- Button style: `--bg-tertiary` background, `--text-secondary`, 12px
- Hover: lighten background
- Active: brief scale(0.97) press effect
- Height: 32px per button

#### 7. Footer

```
┌──────────────────────────────────────────────────────┐
│  Storage: 3.2 MB / 10 MB (32%)      [⚙ Settings]   │
└──────────────────────────────────────────────────────┘
```

- Left: storage usage with mini progress bar (inline, 60px wide)
- Right: settings link → opens options page via `chrome.runtime.openOptionsPage()`
- Background: `--bg-primary`
- Top border: 1px `--border`
- Height: 36px
- Font: 11px, `--text-muted`

Storage bar color changes:
- < 70%: `--accent-green`
- 70-90%: `--accent-yellow`
- \> 90%: `--accent-red`

---

### Popup Data Loading

```javascript
// popup.js — Load all data on popup open
document.addEventListener('DOMContentLoaded', async () => {
  // Parallel data fetch
  const [status, config, errors, storage] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'GET_STATUS' }),
    chrome.runtime.sendMessage({ type: 'GET_CONFIG' }),
    chrome.runtime.sendMessage({ type: 'GET_ACTIVE_ERRORS' }),
    chrome.runtime.sendMessage({ type: 'GET_STORAGE_STATS' })
  ]);

  renderHeader(chrome.runtime.getManifest());
  renderErrorBar(errors);
  renderStatusCards(status);
  renderWorkspace(status.workspace);
  renderScripts(status.injectedScripts);
  renderFooter(storage);
});
```

### `GET_STATUS` Response Shape

```javascript
{
  connection: 'online',              // 'online' | 'offline' | 'degraded'
  token: {
    status: 'valid',                 // 'valid' | 'expiring' | 'expired' | 'missing'
    expiresIn: '23h',               // Human-readable, null if unknown
  },
  config: {
    status: 'loaded',               // 'loaded' | 'defaults' | 'failed'
    source: 'local',                // 'local' | 'remote' | 'hardcoded'
    lastRemoteFetch: '2026-02-25T14:00:00Z'
  },
  workspace: {
    name: 'Production',
    id: 'ws_abc123',
    credits: { used: 142, total: 200 },
    freeCredits: { used: 3, total: 5 }
  },
  injectedScripts: {
    'combo.js': { status: 'injected', tabId: 123 },
    'macro-looping.js': { status: 'injected', tabId: 123 },
    'xpath-recorder.js': { status: 'inactive' }
  },
  loggingMode: 'sqlite'             // 'sqlite' | 'fallback'
}
```

---

## Options Page

### Access

- Popup footer → `[⚙ Settings]`
- Right-click extension icon → "Options"
- `chrome://extensions` → Extension details → "Extension options"

### Dimensions

- Full browser tab (responsive)
- Max content width: 800px, centered
- Sidebar navigation: 200px fixed

### Layout — Master Wireframe

```
┌──────────────────────────────────────────────────────────────────────┐
│  Marco Extension Settings                              v1.1.0 (42) │
├────────────┬─────────────────────────────────────────────────────────┤
│            │                                                         │
│  SIDEBAR   │  CONTENT AREA                                           │
│            │                                                         │
│  ▸ General │  ┌─────────────────────────────────────────────────┐    │
│  ▸ Scripts │  │  Section content based on sidebar selection     │    │
│  ▸ Timing  │  │                                                 │    │
│  ▸ XPaths  │  │                                                 │    │
│  ▸ Auth    │  │                                                 │    │
│  ▸ Logging │  │                                                 │    │
│  ▸ Remote  │  │                                                 │    │
│  ▸ Data    │  │                                                 │    │
│  ▸ About   │  │                                                 │    │
│            │  └─────────────────────────────────────────────────┘    │
│            │                                                         │
│            │  [Save Changes]  [Reset to Defaults]  [Export Config]   │
├────────────┴─────────────────────────────────────────────────────────┤
│  Footer: Config schema v1.0.0 | Storage: 3.2 MB | Session: abc1... │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Sidebar Navigation

```
┌────────────┐
│  ⚙ General │  ← Active state: left accent bar, bg-secondary
│  📜 Scripts│
│  ⏱ Timing  │
│  🔍 XPaths │
│  🔑 Auth   │
│  📊 Logging│
│  🌐 Remote │
│  💾 Data   │
│  ℹ About   │
└────────────┘
```

- Width: 200px
- Item height: 40px
- Active: 3px left border `--accent-cyan`, background `--bg-secondary`
- Hover: background `--bg-tertiary`
- Icon + label, 13px font

---

### Section: General

```
┌─────────────────────────────────────────────────────────┐
│  General Settings                                        │
│                                                          │
│  Debug Mode          [toggle: ON ]                       │
│  Enables verbose console logging and extra UI indicators │
│                                                          │
│  Config Watch         [toggle: ON ]                      │
│  Interval (ms)        [  2000  ]                         │
│  Auto-reload config from storage on interval             │
│                                                          │
│  Notifications        [toggle: ON ]                      │
│  Show browser notifications for errors and state changes │
└─────────────────────────────────────────────────────────┘
```

- Toggles: styled switch components, `--accent-cyan` when ON
- Number inputs: monospace, 80px wide, right-aligned, `--bg-tertiary` background
- Description text: `--text-muted`, 12px, below each control

---

### Section: Script Injection Rules

```
┌─────────────────────────────────────────────────────────────────┐
│  Script Injection Rules                            [+ Add Rule] │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ✅ combo-on-projects                              [Edit ▾] │  │
│  │ URL: https://lovable.dev/projects/*                        │  │
│  │ Path: ^/projects/[a-f0-9-]+                                │  │
│  │ Scripts: combo.js                                          │  │
│  │ Conditions: requireCookie=lovable-session-id.id            │  │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ✅ macro-loop-on-projects                         [Edit ▾] │  │
│  │ URL: https://lovable.dev/projects/*                        │  │
│  │ Path: ^/projects/[a-f0-9-]+                                │  │
│  │ Scripts: macro-looping.js                                  │  │
│  │ Conditions: cookie + 500ms delay                           │  │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ ⬚ settings-helper (disabled)                     [Edit ▾] │  │
│  │ URL: https://lovable.dev/settings*                         │  │
│  │ Scripts: settings-helper.js                                │  │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

**Edit Rule Modal**:

```
┌─────────────────────────────────────────────────────┐
│  Edit Rule: combo-on-projects              [Delete] │
│─────────────────────────────────────────────────────│
│                                                      │
│  ID            [ combo-on-projects     ]             │
│  Enabled       [toggle: ON ]                         │
│  Description   [ Inject ComboSwitch on project pages]│
│                                                      │
│  URL Patterns  [ https://lovable.dev/projects/*  ]   │
│                [+ Add Pattern]                       │
│                                                      │
│  Path Regex    [ ^/projects/[a-f0-9-]+           ]   │
│  Exclude Regex [ ^/projects/.*/settings          ]   │
│                                                      │
│  Scripts       [ content-scripts/combo.js        ]   │
│                [+ Add Script]                        │
│                                                      │
│  Run At        [▾ document_idle    ]                 │
│                                                      │
│  ── Conditions ──                                    │
│  Require Element  [                              ]   │
│  Require Cookie   [ lovable-session-id.id        ]   │
│  Min Delay (ms)   [  0    ]                          │
│                                                      │
│  [Cancel]                              [Save Rule]   │
└─────────────────────────────────────────────────────┘
```

- Modal: 500px wide, dark overlay behind
- Regex fields: monospace font, `--bg-tertiary`
- `[Delete]` button: red text, top-right, requires confirmation click

---

### Section: Timing

```
┌─────────────────────────────────────────────────────────┐
│  Timing Configuration                                    │
│                                                          │
│  ── ComboSwitch ──                                       │
│  Poll Interval (ms)       [  300  ]                      │
│  Open Max Attempts        [  20   ]                      │
│  Wait Max Attempts        [  20   ]                      │
│  Retry Count              [   2   ]                      │
│  Retry Delay (ms)         [ 1000  ]                      │
│  Confirm Delay (ms)       [  500  ]                      │
│                                                          │
│  ── MacroLoop ──                                         │
│  Loop Interval (ms)       [ 50000 ]                      │
│  Countdown Interval (ms)  [ 1000  ]                      │
│  First Cycle Delay (ms)   [  500  ]                      │
│  Post-Combo Delay (ms)    [ 4000  ]                      │
│  Page Load Delay (ms)     [ 2500  ]                      │
│  Dialog Wait (ms)         [ 3000  ]                      │
│  WS Check Interval (ms)   [ 5000  ]                      │
│                                                          │
│  ── Credit Status ──                                     │
│  Auto-Check Enabled       [toggle: ON ]                  │
│  Check Interval (sec)     [  60   ]                      │
│  Cache TTL (sec)          [  30   ]                      │
│  Max Retries              [   2   ]                      │
│  Retry Backoff (ms)       [ 1000  ]                      │
└─────────────────────────────────────────────────────────┘
```

- All numeric inputs: monospace, 80px, right-aligned
- Section dividers: `──` horizontal rules with label
- Changed values highlighted with cyan left border until saved

---

### Section: XPaths

```
┌─────────────────────────────────────────────────────────────────┐
│  XPath Configuration                                  [Validate]│
│                                                                  │
│  ── ComboSwitch XPaths ──                                        │
│  Transfer Button                                                 │
│  [ //div[@role='main']//button[contains(text(),'Transfer')]    ] │
│  Status: ✅ Found (1 match)                          [🔍 Test]  │
│                                                                  │
│  Project Name                                                    │
│  [ //div[@role='dialog']//p[contains(@class,'truncate')]       ] │
│  Status: ⬚ Not tested                               [🔍 Test]  │
│                                                                  │
│  ── MacroLoop XPaths ──                                          │
│  Project Button                                                  │
│  [ //button[@aria-label='Open project menu']                   ] │
│  Status: ✅ Found (1 match)                          [🔍 Test]  │
│                                                                  │
│  Workspace Name                                                  │
│  [ //div[@role='dialog']//span[contains(@class,'workspace')]   ] │
│  Status: ❌ Not found (0 matches)                    [🔍 Test]  │
└─────────────────────────────────────────────────────────────────┘
```

- XPath inputs: full-width, monospace, `--bg-tertiary`
- `[🔍 Test]` button: executes XPath on active tab via `chrome.scripting.executeScript`, returns match count
- Status line: green check (found), red X (not found), gray circle (untested)
- `[Validate]` top button: tests ALL XPaths at once, shows summary
- Invalid XPath syntax: red border + error tooltip

---

### Section: Auth

```
┌─────────────────────────────────────────────────────────┐
│  Authentication                                          │
│                                                          │
│  Auth Mode         [▾ Cookie Session   ]                 │
│                    Options: Cookie Session | Manual Token │
│                                                          │
│  API Base URL      [ https://api.lovable.dev         ]   │
│                                                          │
│  ── Cookie Status ──                                     │
│  Cookie Name:      lovable-session-id.id                 │
│  Cookie Present:   ✅ Yes                                │
│  Cookie Domain:    .lovable.dev                          │
│  HttpOnly:         Yes (accessible via chrome.cookies)   │
│  Expires:          2026-02-26T14:30:00Z (23h remaining)  │
│                                                          │
│  [🔄 Re-read Cookie]  [🧪 Test API Connection]          │
│                                                          │
│  ── Token Cache ──                                       │
│  Cached:           Yes                                   │
│  Cache Age:        12s (TTL: 30s)                        │
│  [Clear Cache]                                           │
└─────────────────────────────────────────────────────────┘
```

- Cookie status section: read-only display, refreshes on page load
- `[🧪 Test API Connection]`: calls `/user/workspaces` with current token, shows result
- `[Clear Cache]`: clears `chrome.storage.session` token cache

---

### Section: Logging

```
┌─────────────────────────────────────────────────────────┐
│  Logging Configuration                                   │
│                                                          │
│  Logging Mode:     SQLite (sql.js WASM)  ✅              │
│  Flush Interval:   [  30  ] seconds                      │
│  Max Sessions:     [   5  ] (older auto-pruned)          │
│                                                          │
│  ── Current Session ──                                   │
│  Session ID:       a1b2c3d4-...                          │
│  Started:          2026-02-25T14:30:00Z (2h ago)         │
│  Log entries:      1,247                                 │
│  Error entries:    3                                     │
│  API calls:        89                                    │
│                                                          │
│  ── Storage ──                                           │
│  logs.db size:     2.1 MB                                │
│  errors.db size:   0.3 MB                                │
│  Total storage:    3.2 MB / 10 MB (32%)                  │
│  ████████████░░░░░░░░░░░░░░░░░░░░ 32%                    │
│                                                          │
│  ── Sessions History ──                                  │
│  │ ID       │ Started          │ Logs  │ Errors │       │
│  │ a1b2c3d4 │ Today 14:30      │ 1,247 │ 3      │ [📋] │
│  │ e5f6g7h8 │ Today 09:15      │ 3,891 │ 12     │ [📋] │
│  │ i9j0k1l2 │ Yesterday 22:00  │ 892   │ 0      │ [📋] │
│                                                          │
│  [📋 Copy Session Logs] [💾 Export logs.db]              │
│  [💾 Export errors.db]  [🗑 Prune Old Sessions]          │
└─────────────────────────────────────────────────────────┘
```

- Session history table: sortable by column, row click expands to show log preview
- `[📋]` per session: copies that session's logs as formatted text
- Storage bar: same color-coding as popup footer (green/yellow/red)

---

### Section: Remote Config

```
┌─────────────────────────────────────────────────────────┐
│  Remote Configuration                                    │
│                                                          │
│  Enabled           [toggle: OFF]                         │
│                                                          │
│  ── Endpoints ──                                [+ Add]  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ https://example.com/api/marco-config              │  │
│  │ Method: GET | Refresh: 5 min | Timeout: 5s        │  │
│  │ Last fetch: Never | Status: —                     │  │
│  │ [Test] [Edit] [Remove]                            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Merge Strategy    [▾ Deep Merge    ]                    │
│                    Options: Deep Merge | Full Replace    │
│                                                          │
│  ── Secrets ──                                           │
│  API keys referenced in endpoint headers:                │
│  SECRET_API_KEY    [ ••••••••••••            ] [👁] [✕]  │
│  [+ Add Secret]                                          │
└─────────────────────────────────────────────────────────┘
```

- `[Test]` button: fetches the endpoint, shows response preview in a toast
- Secret values: masked by default, `[👁]` to reveal temporarily
- Secrets stored in `chrome.storage.local` under a `secrets` namespace

---

### Section: Data Management

```
┌─────────────────────────────────────────────────────────┐
│  Data Management                                         │
│                                                          │
│  ── Storage Overview (G-16 — DB Visibility) ──          │
│                                                          │
│  Total Storage Used: 4.2 MB / 10 MB quota                │
│  ████████████████████░░░░░░░░░░░░░░  42%                 │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │  Database       Rows     Size     Last Write     │    │
│  ├──────────────────────────────────────────────────┤    │
│  │  logs.db        1,247    2.1 MB   2 min ago      │    │
│  │  errors.db         14    0.3 MB   1 hr ago       │    │
│  │  Projects          3     0.1 MB   —              │    │
│  │  Scripts           5     1.2 MB   —              │    │
│  │  Configs           2     0.5 MB   —              │    │
│  └──────────────────────────────────────────────────┘    │
│                                                          │
│  ⚠️ Warning at 80%: "Storage at 82%. Prune old logs."    │
│  🔴 Critical at 95%: "Storage nearly full! [Prune Now]"  │
│                                                          │
│  ── Data Browser ──                                      │
│                                                          │
│  [▾ logs.db ] [▾ All sessions] [🔍 Filter...]            │
│  ┌──────────────────────────────────────────────────┐    │
│  │  # │ Time     │ Level │ Source  │ Action         │    │
│  ├──────────────────────────────────────────────────┤    │
│  │  1 │ 14:30:01 │ INFO  │ combo   │ api_call       │    │
│  │  2 │ 14:30:02 │ INFO  │ combo   │ credit_check   │    │
│  │  3 │ 14:30:05 │ WARN  │ macro   │ ws_detect_fail │    │
│  │  4 │ 14:30:08 │ ERROR │ bg      │ storage_full   │    │
│  │  ⋮ │          │       │         │                │    │
│  └──────────────────────────────────────────────────┘    │
│  Showing 1-50 of 1,247  [◀ Prev] [Next ▶]               │
│                                                          │
│  Row colors: INFO=default, WARN=yellow bg, ERROR=red bg  │
│                                                          │
│  ── Export ──                                            │
│  [💾 Export Full Config]    config.json download          │
│  [💾 Export logs.db]        SQLite database file          │
│  [💾 Export errors.db]      SQLite database file          │
│  [💾 Export All as ZIP]     Everything in one archive     │
│                                                          │
│  ── Import ──                                            │
│  [📂 Import Config]        Load config.json from file    │
│  Caution: This overwrites all current settings           │
│                                                          │
│  ── Reset ──                                             │
│  [🔄 Reset Config to Defaults]                           │
│  Restores bundled config.json values                     │
│                                                          │
│  [🗑 Clear All Logs]                                     │
│  Deletes logs.db and errors.db (keeps config)            │
│                                                          │
│  [💣 Factory Reset]                                      │
│  Deletes ALL extension data (config, logs, secrets)      │
│  ⚠ This cannot be undone                                 │
└─────────────────────────────────────────────────────────┘
```

#### Storage Overview Behavior

- **Quota source**: `navigator.storage.estimate()` for OPFS, `chrome.storage.local.getBytesInUse()` for storage.local
- **Row counts**: Queried via `SELECT COUNT(*) FROM logs` / `SELECT COUNT(*) FROM errors` on load + cached
- **Auto-refresh**: Storage stats update every 30 seconds while Options page is open
- **Thresholds**: Warning banner at 80%, critical banner at 95% with auto-prune suggestion
- **Color coding**: Progress bar is green < 60%, yellow 60-80%, orange 80-95%, red > 95%

#### Data Browser Behavior

- **Database selector**: Dropdown switching between `logs.db` and `errors.db`
- **Session filter**: Dropdown of all sessions (from `sessions` table), default "All sessions"
- **Text filter**: Searches across `action`, `detail`, and `metadata` columns (LIKE query)
- **Pagination**: 50 rows per page, prev/next buttons
- **Row click**: Expands to show full `detail` and `metadata` JSON (collapsible)
- **Column sorting**: Click column header to sort ASC/DESC

#### Message Protocol for DB Visibility

```javascript
{ type: 'GET_STORAGE_STATS' }
// → { totalBytes, quotaBytes, databases: [{ name, rows, sizeBytes, lastWrite }] }

{ type: 'QUERY_LOGS', database: 'logs'|'errors', sessionId?: string, filter?: string, offset: number, limit: number, sortBy?: string, sortDir?: 'asc'|'desc' }
// → { rows: LogEntry[], total: number }

{ type: 'GET_LOG_DETAIL', database: 'logs'|'errors', rowId: number }
// → { row: LogEntry }  (full metadata)
```

- Destructive buttons: red text, require confirmation modal
- Factory Reset confirmation: type `"RESET"` to confirm
- Import: file picker, validates JSON before applying

---

### Section: About

```
┌─────────────────────────────────────────────────────────┐
│  About Marco Extension                                   │
│                                                          │
│  Version:          1.1.0 (build 42)                      │
│  Config Schema:    1.0.0                                 │
│  Manifest V3:      Yes                                   │
│  sql.js WASM:      Loaded ✅                             │
│  Logging Mode:     SQLite                                │
│                                                          │
│  ── Permissions ──                                       │
│  cookies           ✅ Granted                            │
│  scripting         ✅ Granted                            │
│  storage           ✅ Granted                            │
│  webNavigation     ✅ Granted                            │
│  downloads         ✅ Granted                            │
│                                                          │
│  ── Migration ──                                         │
│  AHK Lineage:      v7.17 (marco-script-ahk-v7.latest)   │
│  Extension Start:  v1.0.0                                │
│                                                          │
│  ── Links ──                                             │
│  [📖 Documentation]  [🐛 Report Issue]  [📜 Changelog]  │
└─────────────────────────────────────────────────────────┘
```

---

### Save/Reset Bar (Sticky Bottom)

Appears when any setting has been modified:

```
┌─────────────────────────────────────────────────────────┐
│  Unsaved changes (3 modified)                            │
│  [Save Changes]  [Reset to Defaults]  [Export Config]    │
└─────────────────────────────────────────────────────────┘
```

- Sticky to bottom of content area
- `[Save Changes]`: primary button, `--accent-cyan` background
- Shows count of modified fields
- After save: green flash `"✅ Saved"` then bar disappears
- If user navigates away with unsaved changes: browser confirmation dialog

---

## Interaction Flows

### Flow 1: First-Time User Opens Popup

```
User clicks extension icon
    │
    ▼
Popup loads → GET_STATUS from background
    │
    ├── Token missing → Status cards show ❌ Token: Missing
    │    Workspace section: "No workspace detected"
    │    Scripts: "⬚ not on page"
    │    Error bar: "Log in to lovable.dev to get started"
    │
    └── Token valid → full status displayed
         Workspace + credits shown
         Scripts show injection status for active tab
```

### Flow 2: User Records XPaths

```
User clicks [🔴 Record] in popup
    │
    ▼
Popup sends TOGGLE_XPATH_RECORDER to background
    │
    ▼
Background injects xpath-recorder.js into active tab
    │
    ▼
Button changes to [⏹ Stop (0)]
    │
    ▼
User clicks elements on the page (popup stays open)
    │
    ▼
Each click: count updates in popup [⏹ Stop (3)]
    │
    ▼
User clicks [⏹ Stop]
    │
    ▼
Popup requests GET_RECORDED_XPATHS
    │
    ▼
Results expand in scripts section
User can copy individual XPaths or export all
```

### Flow 3: User Edits Config in Options

```
User opens options page (popup → Settings or right-click → Options)
    │
    ▼
Options page loads config from background (GET_CONFIG)
    │
    ▼
User navigates sidebar sections, modifies values
    │
    ▼
Modified fields get cyan left border indicator
    │
    ▼
Sticky save bar appears: "Unsaved changes (N modified)"
    │
    ▼
User clicks [Save Changes]
    │
    ▼
Options page sends SAVE_CONFIG to background
    │
    ▼
Background validates schema → stores in chrome.storage.local
    │
    ▼
Background notifies content scripts: CONFIG_UPDATED
    │
    ▼
Content scripts re-initialize with new config (no page reload needed)
    │
    ▼
Save bar shows "✅ Saved" then disappears
```

### Flow 4: User Tests XPath from Options

```
User navigates to XPaths section in options
    │
    ▼
Clicks [🔍 Test] next to an XPath
    │
    ▼
Options page sends TEST_XPATH to background
    │
    ▼
Background executes chrome.scripting.executeScript on active tab
    │
    ├── Found N elements → status shows "✅ Found (N matches)"
    │    If N > 1: yellow warning "Multiple matches — may cause ambiguity"
    │
    ├── Found 0 → status shows "❌ Not found (0 matches)"
    │    Suggest: "Open a project page and try again"
    │
    └── Invalid XPath syntax → red border + error message
```

### Flow 5: Error Escalation in Popup

```
Error occurs (e.g., storage full)
    │
    ▼
Background registers error in activeErrors map
    │
    ▼
Badge updates (yellow ! / orange !! / red X)
    │
    ▼
User sees badge, clicks extension icon
    │
    ▼
Popup opens → error bar visible at top
    │
    ├── Single error: shows message + dismiss (if warning)
    │
    └── Multiple errors: shows count, click to expand list
         │
         ▼
    Each error shows: icon, message, time, [action button]
    e.g., "Storage at 92% — [Prune Now]"
         │
         ▼
    User clicks [Prune Now] → triggers auto-prune
    Error clears from list, badge updates
```

---

## File Structure

```
popup/
  ├── popup.html         ← 380px popup shell
  ├── popup.js           ← Data loading, event handlers, rendering
  ├── popup.css          ← Popup-specific styles
  └── components/
      ├── status-cards.js
      ├── scripts-section.js
      ├── xpath-results.js
      └── error-bar.js

options/
  ├── options.html       ← Full-tab options page shell
  ├── options.js         ← Sidebar routing, config loading, save logic
  ├── options.css        ← Options page styles
  └── sections/
      ├── general.js
      ├── scripts.js
      ├── timing.js
      ├── xpaths.js
      ├── auth.js
      ├── logging.js
      ├── remote.js
      ├── data.js
      └── about.js

shared/
  └── styles.css         ← Shared color tokens, typography, component classes
```
