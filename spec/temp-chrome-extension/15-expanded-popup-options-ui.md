# Chrome Extension — Expanded Popup & Options UI (Phase 2)

**Version**: v0.2
**Date**: 2026-02-28
**Depends on**: `10-popup-options-ui.md`, `12-project-model-and-url-rules.md`, `13-script-and-config-management.md`

---

## Purpose

Expand the popup and options page UI to support the project-centric model introduced in Phase 1. This spec adds:

1. **Popup**: Project selector dropdown, per-project script status, active URL rule indicator
2. **Options**: Full Projects CRUD section, URL rule editor, script/config binding UI, drag-and-drop zones
3. **Shared**: Drag-and-drop component spec, metadata badge system

This spec **extends** `10-popup-options-ui.md` — it does not replace it. All existing sections (General, Timing, XPaths, Auth, Logging, Remote, Data, About) remain unchanged.

---

## Popup Changes

### Updated Layout — Master Wireframe

```
┌──────────────────────────────────────────────────────┐
│  HEADER                                              │
│  🔧 Marco Extension              v1.1.0 (build 42)  │
├──────────────────────────────────────────────────────┤
│  PROJECT SELECTOR (new)                              │
│  [▾ Lovable Automation         ]  [⚙]               │
│  Rule matched: "Project pages" (prefix)              │
├──────────────────────────────────────────────────────┤
│  ERROR BAR (conditional)                             │
│  ⚠ SQLite unavailable — using JSON fallback          │
├──────────────────────────────────────────────────────┤
│  STATUS SECTION                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Connection │ │ Token      │ │ Config     │       │
│  │ ✅ Online  │ │ ✅ Valid   │ │ ✅ Loaded  │       │
│  └────────────┘ └────────────┘ └────────────┘       │
├──────────────────────────────────────────────────────┤
│  WORKSPACE SECTION                                   │
│  Current: Production (ws_abc123)                     │
│  Credits: ████████░░ 142/200 (71%)                   │
├──────────────────────────────────────────────────────┤
│  SCRIPTS SECTION (project-scoped)                    │
│  ┌─ Lovable Automation ─────────────────────────┐    │
│  │ macro-looping.js  ✅ injected    [Reinject]  │    │
│  │ combo.js          ✅ injected    [Reinject]  │    │
│  └──────────────────────────────────────────────┘    │
│  ┌─ No match ──────────────────────────────────┐    │
│  │ xpath-recorder    ⬚ inactive    [🔴 Record] │    │
│  └──────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────┤
│  QUICK ACTIONS                                       │
│  [📋 Copy Logs] [💾 Export ZIP] [🔄 Refresh All]    │
├──────────────────────────────────────────────────────┤
│  FOOTER                                              │
│  Storage: 3.2 MB / 10 MB        [⚙ Settings]       │
└──────────────────────────────────────────────────────┘
```

### New Component: Project Selector

```
┌──────────────────────────────────────────────────────┐
│  [▾ Lovable Automation         ]  [⚙]               │
│  Rule matched: "Project pages" (prefix)              │
└──────────────────────────────────────────────────────┘
```

#### Behavior

| Element | Description |
|---------|-------------|
| Dropdown | Lists all enabled projects by name. Disabled projects shown with strikethrough, not selectable. |
| `[⚙]` button | Opens Options page directly to the Projects section |
| "Rule matched" line | Shows the name + matchMode of the URL rule matching the current tab's URL. If no match: `"No matching rule for this page"` in `--text-muted`. If multiple match: shows first by priority + `"(+2 more)"` |

#### Dropdown States

| State | Display |
|-------|---------|
| No projects exist | `"No projects — create one in Settings"` (non-selectable) |
| 1 project | Shown selected, dropdown arrow hidden (no need to switch) |
| 2+ projects | Full dropdown, alphabetically sorted |
| Current page matches no rule in selected project | Yellow indicator dot on dropdown + text: `"No matching rule for this page"` |
| Current page matches rule | Green indicator dot + matched rule name shown |

#### Data Flow

```
Popup opens
    │
    ▼
GET_ACTIVE_PROJECT from background
    │
    ├── Response includes:
    │   - activeProject: Project (the last selected or auto-matched)
    │   - matchedRule: UrlRule | null (matched for current tab URL)
    │   - allProjects: { id, name, enabled }[] (for dropdown)
    │
    ▼
Render dropdown + match status
    │
    ▼
User changes project in dropdown
    │
    ▼
Send SET_ACTIVE_PROJECT { projectId } to background
    │
    ▼
Background re-evaluates current tab URL against new project's rules
    │
    ▼
Response: new matchedRule (or null)
    │
    ▼
Scripts section updates to show scripts for new project/rule
```

#### Message Protocol Additions

```javascript
// New message types for project selector
{ type: 'GET_ACTIVE_PROJECT' }
// Response:
{
  activeProject: { id, name, enabled },
  matchedRule: { id, name, matchMode, matchValue } | null,
  allProjects: [{ id, name, enabled }],
  injectedScripts: { [scriptName]: { status, tabId } }
}

{ type: 'SET_ACTIVE_PROJECT', projectId: string }
// Response:
{
  matchedRule: { id, name, matchMode, matchValue } | null,
  injectedScripts: { [scriptName]: { status, tabId } }
}
```

### Updated Scripts Section (Project-Scoped)

The existing scripts section (spec 10, §5) is replaced with a project-aware version:

```
┌──────────────────────────────────────────────────────┐
│  Scripts — Lovable Automation                        │
│                                                      │
│  ── Rule: "Project pages" (matched) ──               │
│  macro-looping.js  MAIN   ✅ injected   [Reinject]  │
│  combo.js          MAIN   ✅ injected   [Reinject]  │
│                                                      │
│  ── Global ──                                        │
│  xpath-recorder    ISO    ⬚ inactive   [🔴 Record]  │
└──────────────────────────────────────────────────────┘
```

Changes from v0.1:

| Change | Details |
|--------|---------|
| Section header | Shows active project name |
| Rule grouping | Scripts grouped by matched URL rule. Non-rule scripts (global like recorder) shown under "Global" |
| World badge | `MAIN` or `ISO` badge next to script name, 9px monospace, `--bg-tertiary` pill |
| Empty state | If no rule matches: `"No scripts for this page. Open a matching URL or edit the project rules."` |

---

## Options Page Changes

### Updated Sidebar

```
┌─────────────┐
│  📁 Projects│  ← NEW (first item, highlighted with accent)
│  ⚙ General  │
│  📜 Scripts  │
│  ⏱ Timing   │
│  🔍 XPaths  │
│  🔑 Auth    │
│  📊 Logging │
│  🌐 Remote  │
│  💾 Data    │
│  ℹ About    │
└─────────────┘
```

- "Projects" is the **first** sidebar item (replaces "General" as the default landing section when the user has projects)
- First-time users with no custom projects still land on General

### Updated File Structure

```
options/
  └── sections/
      ├── projects.js       ← NEW: Projects CRUD, URL rules, bindings
      ├── general.js
      ├── scripts.js
      ├── timing.js
      ├── xpaths.js
      ├── auth.js
      ├── logging.js
      ├── remote.js
      ├── data.js
      └── about.js

popup/
  └── components/
      ├── project-selector.js   ← NEW
      ├── status-cards.js
      ├── scripts-section.js    ← UPDATED (project-scoped)
      ├── xpath-results.js
      └── error-bar.js

shared/
  ├── styles.css
  └── components/
      ├── drop-zone.js          ← NEW: Reusable drag-and-drop
      ├── metadata-badges.js    ← NEW: Script metadata badges
      └── confirm-modal.js      ← NEW: Reusable confirmation dialog
```

---

## Options Section: Projects (Full Spec)

### 1. Project List View

The default view when clicking "Projects" in the sidebar.

```
┌─────────────────────────────────────────────────────────────────┐
│  Projects                                        [+ New Project] │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ Lovable Automation                          🔒 built-in │  │
│  │    2 URL rules · 3 scripts · 1 config                       │  │
│  │    Last matched: 2 min ago                                  │  │
│  │                                         [Edit] [Duplicate]  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ Internal Dashboard                                       │  │
│  │    1 URL rule · 2 scripts · 0 configs                       │  │
│  │    Last matched: never                                      │  │
│  │                                   [Edit] [Duplicate] [🗑]   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ⬚ Staging Tests (disabled)                                  │  │
│  │    3 URL rules · 5 scripts · 2 configs                      │  │
│  │    Last matched: 3 days ago                                 │  │
│  │                                   [Edit] [Duplicate] [🗑]   │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ── Import ──                                                    │
│  [📂 Import Project from JSON]                                   │
└─────────────────────────────────────────────────────────────────┘
```

#### Project Card Details

| Element | Spec |
|---------|------|
| Toggle icon | `✅` enabled, `⬚` disabled. Clickable to toggle `project.enabled` |
| Name | `--text-primary`, 15px, bold. Clickable → opens Edit view |
| `🔒 built-in` badge | For default projects. Cannot be deleted, can be disabled |
| Summary line | `--text-muted`, 12px: count of URL rules, scripts, configs |
| "Last matched" | `--text-muted`, 12px: relative time since a URL rule in this project last matched a page |
| `[Edit]` | Opens Project Detail View (see §2) |
| `[Duplicate]` | Deep clones the project with `"(Copy)"` suffix. New UUIDs generated |
| `[🗑]` | Delete with confirmation modal. Not available for built-in projects |
| `[📂 Import]` | File picker for `.json` project export. Validates schema before importing |
| Disabled state | Card has 50% opacity, name has strikethrough |

#### Empty State

```
┌─────────────────────────────────────────────────────────────────┐
│  Projects                                        [+ New Project] │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                                                              │  │
│  │        📁 No projects yet                                    │  │
│  │                                                              │  │
│  │   Create a project to group URL rules, scripts, and configs  │  │
│  │   for automatic injection on matching pages.                 │  │
│  │                                                              │  │
│  │                  [+ Create First Project]                    │  │
│  │                                                              │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 2. Project Detail View (Create / Edit)

Accessed via `[+ New Project]`, `[Edit]`, or clicking project name. Replaces the list view in the content area. Breadcrumb: `Projects > Lovable Automation`.

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Projects / Lovable Automation                    [🗑 Delete] │
│                                                                   │
│  ── Project Settings ──                                          │
│                                                                   │
│  Name              [ Lovable Automation                       ]  │
│  Description       [ Built-in controllers for lovable.dev     ]  │
│  Enabled           [toggle: ON ]                                 │
│                                                                   │
│  ── Default Config ──                                            │
│                                                                   │
│  Default Config    [▾ lovable-config.json        ] [⊘ None]     │
│  Injection Method  [▾ Global variable            ]               │
│  Global Var Name   [ __marcoConfig               ]               │
│                                                                   │
│  ── URL Rules ──                                     [+ Add Rule]│
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ 1. Project pages                              [Edit ▾]  │  │
│  │    Match: prefix — https://lovable.dev/projects/            │  │
│  │    Exclude: (none)                                          │  │
│  │    Scripts: macro-looping.js (MAIN), combo.js (MAIN)        │  │
│  │    Config: (use project default)                            │  │
│  │    Conditions: cookie, 500ms delay                          │  │
│  │    Priority: 100                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ ✅ 2. Settings pages                             [Edit ▾]  │  │
│  │    Match: prefix — https://lovable.dev/settings/            │  │
│  │    Exclude: ^.*/billing$                                    │  │
│  │    Scripts: settings-helper.js (ISOLATED)                   │  │
│  │    Config: settings-config.json                             │  │
│  │    Conditions: (none)                                       │  │
│  │    Priority: 200                                            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ── Default Scripts ──                                           │
│  Applied when a URL rule has no scripts of its own.              │
│  (Currently empty — all rules have explicit scripts)             │
│  [+ Add Default Script]                                          │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │  [Cancel]                                    [Save Project] │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

#### Field Specifications

| Field | Type | Validation | Notes |
|-------|------|------------|-------|
| Name | text input | required, 1–100 chars | Must be unique across projects |
| Description | textarea | optional, max 500 chars | 3 rows visible |
| Enabled | toggle | — | Default: ON for new projects |
| Default Config | dropdown | — | Lists all configs in `marco_configs` store + `(none)` |
| Injection Method | dropdown | — | `Global variable`, `Message passing`, `Parameter`. Only visible when Default Config ≠ none |
| Global Var Name | text input | valid JS identifier | Only visible when Injection Method = `Global variable`. Default: `__marcoConfig` |

---

### 3. URL Rule Editor (Inline Expand)

Clicking `[Edit ▾]` on a URL rule card expands it inline (not a modal) for faster editing of multiple rules.

```
┌─────────────────────────────────────────────────────────────────┐
│  ▼ 1. Project pages                                             │
│                                                                   │
│  ── Matching ──                                                  │
│                                                                   │
│  Name           [ Project pages                              ]   │
│  Enabled        [toggle: ON ]                                    │
│  Priority       [  100  ]    (lower = higher priority)           │
│                                                                   │
│  Match Mode     (○ Exact) (● Prefix) (○ Regex)                  │
│  Match Value    [ https://lovable.dev/projects/              ]   │
│                                                                   │
│  ── Match Preview ──                                             │
│  ✅ https://lovable.dev/projects/abc-123                         │
│  ✅ https://lovable.dev/projects/def-456/edit                    │
│  ❌ https://lovable.dev/settings                                 │
│  ❌ https://example.com/projects/abc                             │
│                                                                   │
│  Exclude Pattern [ (optional regex)                          ]   │
│                                                                   │
│  ── Conditions ──                                                │
│                                                                   │
│  Require Element [ (CSS selector)                            ]   │
│  Require Cookie  [ lovable-session-id.id                     ]   │
│  Min Delay (ms)  [  500  ]                                       │
│  Require Online  [toggle: OFF]                                   │
│                                                                   │
│  ── Scripts ──                                        [+ Add]    │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 1. macro-looping.js                                       │   │
│  │    World: [▾ MAIN]  Run At: [▾ document_idle]             │   │
│  │    Config: [▾ (use project default)    ]                  │   │
│  │                                             [↑] [↓] [×]  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │ 2. combo.js                                               │   │
│  │    World: [▾ MAIN]  Run At: [▾ document_idle]             │   │
│  │    Config: [▾ (use project default)    ]                  │   │
│  │                                             [↑] [↓] [×]  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ── Rule Config (optional) ──                                    │
│                                                                   │
│  Config          [▾ (none — use project default) ]               │
│  Injection       [▾ Global variable              ]               │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  [Delete Rule]                         [Collapse ▲]       │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

#### Match Mode Radio Group

| Mode | Field Behavior | Placeholder |
|------|----------------|-------------|
| Exact | Single URL input, no wildcards | `https://example.com/page` |
| Prefix | URL prefix input | `https://example.com/projects/` |
| Regex | Regex pattern input, monospace, with syntax validation | `^https://example\\.com/projects/[a-f0-9-]+` |

#### Match Preview

A live preview section that shows 4 example URLs (2 matching, 2 not matching) based on the current matchMode + matchValue + excludePattern. Auto-updates on keystroke with 300ms debounce.

- For **Exact** mode: shows the exact URL as ✅ and any URL with extra path as ❌
- For **Prefix** mode: shows URLs starting with prefix as ✅, others as ❌
- For **Regex** mode: runs regex.test() on example URLs

The examples are auto-generated from the matchValue:
1. The matchValue itself → should always match (✅)
2. matchValue + `/sub-path` → match depends on mode
3. A different domain → should never match (❌)
4. If excludePattern set: a URL matching both match and exclude → ❌

#### Script Binding within Rule

The `[+ Add]` button shows a dropdown of all scripts in `marco_scripts` store, filtered to exclude already-bound scripts.

| Element | Spec |
|---------|------|
| Script name | Read-only, from script store |
| World dropdown | `MAIN`, `ISOLATED`. Default from script's `world` field |
| Run At dropdown | `document_start`, `document_end`, `document_idle`. Default: `document_idle` |
| Config dropdown | Lists all configs + `(use project default)` + `(none)`. Default: `(use project default)` |
| `[↑]` `[↓]` | Reorder injection sequence (updates `order` field) |
| `[×]` | Remove binding (does NOT delete the script from store) |

---

### 4. New Project Flow

```
User clicks [+ New Project]
    │
    ▼
Project Detail View opens with empty form
    │
    ├── Name: empty (focused, required)
    ├── Description: empty
    ├── Enabled: ON
    ├── Default Config: (none)
    ├── URL Rules: empty list
    ├── Default Scripts: empty list
    │
    ▼
User fills name, adds at least one URL rule
    │
    ▼
User clicks [Save Project]
    │
    ▼
Validate:
  ├── Name is non-empty and unique → pass
  ├── At least 0 URL rules (empty project allowed) → pass
  └── Each URL rule has valid matchValue → pass/fail
    │
    ▼
Send SAVE_PROJECT to background
    │
    ▼
Background generates UUIDs, stores in chrome.storage.local
    │
    ▼
Return to Project List with new project shown
    │
    ▼
Toast: "✅ Project 'Internal Dashboard' created"
```

### 5. Delete Project Flow

```
User clicks [🗑 Delete] or [🗑] on project card
    │
    ▼
Confirmation modal:
  ┌────────────────────────────────────────────┐
  │  Delete "Internal Dashboard"?              │
  │                                            │
  │  This will remove the project and all its  │
  │  URL rules. Scripts and configs in the     │
  │  store will NOT be deleted.                │
  │                                            │
  │  Type the project name to confirm:         │
  │  [ Internal Dashboard          ]           │
  │                                            │
  │  [Cancel]                       [Delete]   │
  └────────────────────────────────────────────┘
    │
    ▼
Name matches → [Delete] enabled (red)
    │
    ▼
Send DELETE_PROJECT { projectId } to background
    │
    ▼
Background removes from chrome.storage.local
    │
    ▼
Return to Project List, project removed
Toast: "🗑 Project deleted"
```

### 6. Duplicate Project Flow

```
User clicks [Duplicate]
    │
    ▼
Background deep-clones project:
  - New project.id (UUID v4)
  - Name: "{original name} (Copy)"
  - All URL rules get new ids
  - All script bindings get new ids
  - project.enabled = false (safety default)
    │
    ▼
New project appears in list
Toast: "📋 Project duplicated as '{name} (Copy)'"
```

---

### 7. Export / Import Project

#### Export

Available from the project detail view via a `[📤 Export]` button (in the header, next to `[🗑 Delete]`).

```
User clicks [📤 Export]
    │
    ▼
Extension builds JSON:
{
  "marco_export": true,
  "version": "1.1.0",
  "exportedAt": "2026-02-28T...",
  "project": { /* full Project object */ },
  "scripts": [ /* referenced StoredScript objects (content included) */ ],
  "configs": [ /* referenced StoredConfig objects (content included) */ ]
}
    │
    ▼
Browser download: "marco-project-{name}-{date}.json"
```

#### Import

Available from the project list view via `[📂 Import Project from JSON]`.

```
User clicks [📂 Import Project from JSON]
    │
    ▼
File picker → select .json file
    │
    ▼
Validate:
  ├── Has `marco_export: true` field → valid format
  ├── Parse project, scripts, configs → valid schemas
  └── Check name collision → if exists, append " (Imported)"
    │
    ▼
Preview modal:
  ┌────────────────────────────────────────────┐
  │  Import Project                            │
  │                                            │
  │  Name: Internal Dashboard                  │
  │  URL Rules: 3                              │
  │  Scripts: 5 (2 new, 3 already exist)       │
  │  Configs: 1 (new)                          │
  │                                            │
  │  ⚠ 3 scripts already exist in your store.  │
  │  They will NOT be overwritten.             │
  │                                            │
  │  [Cancel]                      [Import]    │
  └────────────────────────────────────────────┘
    │
    ▼
On Import: new UUIDs generated, stored in chrome.storage.local
Toast: "✅ Project imported with 2 new scripts"
```

---

## Drag-and-Drop Component (Shared)

Used in Options → Scripts section and Options → Projects → URL Rule editor (for adding scripts/configs).

### Drop Zone Component

```
┌──────────────────────────────────────────────────┐
│                                                   │
│   📂 Drop .js or .json files here                 │
│   or click to browse                              │
│                                                   │
│   Accepted: .js, .mjs, .json                      │
│   Max: 5 MB per .js file, 1 MB per .json          │
│   Batch: up to 20 files at once                   │
│                                                   │
└──────────────────────────────────────────────────┘
```

### Visual States

| State | Appearance |
|-------|------------|
| Default | Dashed border (`--border`), `--bg-secondary` background, `--text-muted` text |
| Drag hover | Solid border (`--accent-cyan`), subtle cyan glow (`box-shadow: 0 0 12px rgba(103,232,249,0.2)`), background `--bg-tertiary` |
| Processing | Pulsing border, spinner icon replaces 📂, text: `"Processing 3 files..."` |
| Success | Brief green flash (500ms), border `--accent-green`, then reset to default |
| Error | Red border (`--accent-red`), error text below: `"file.js: exceeds 5 MB limit"` |
| Disabled | 30% opacity, `cursor: not-allowed`, tooltip: `"Save current changes first"` |

### Drop Zone Validation

```
Files dropped or selected
    │
    ▼
For each file:
  ├── Check extension: .js, .mjs, .json only
  │   └── Other → reject with "Unsupported file type: .txt"
  ├── Check size: .js ≤ 5 MB, .json ≤ 1 MB
  │   └── Over → reject with "{file}: exceeds {limit} limit"
  ├── Check encoding: UTF-8
  │   └── Binary → reject with "{file}: not a text file"
  └── Check batch: ≤ 20 files
      └── Over → reject with "Maximum 20 files per drop"
    │
    ▼
Separate into:
  ├── .js / .mjs files → script upload flow (hash check, metadata analysis)
  └── .json files → config upload flow (parse, validate, schema check)
    │
    ▼
Show results toast:
  "Added 3 scripts, 1 config. 1 file rejected (too large)."
```

### Drop Zone Props (Component Interface)

```typescript
interface DropZoneProps {
  accept: string[];           // e.g. ['.js', '.mjs', '.json']
  maxFileSize: number;        // bytes
  maxFiles: number;           // max batch size
  onFilesAccepted: (files: ProcessedFile[]) => void;
  onFilesRejected: (errors: FileError[]) => void;
  disabled: boolean;
  label?: string;             // custom label text
  className?: string;
}

interface ProcessedFile {
  file: File;
  type: 'script' | 'config';
  hash: string;              // SHA-256
  isDuplicate: boolean;      // matches existing hash
}

interface FileError {
  fileName: string;
  reason: string;
}
```

---

## Metadata Badges (Shared)

Displayed on script cards in both the Options scripts list and the URL rule script bindings.

```
┌───────────────────────────────────────────────┐
│ macro-looping.js                              │
│ ┌──────┐ ┌──────┐ ┌─────┐ ┌──────┐ ┌─────┐  │
│ │ MAIN │ │ 1247 │ │ DOM │ │ IIFE │ │ CHR │  │
│ │      │ │lines │ │  ✓  │ │  ✓   │ │  ✓  │  │
│ └──────┘ └──────┘ └─────┘ └──────┘ └─────┘  │
└───────────────────────────────────────────────┘
```

| Badge | Source | Color |
|-------|--------|-------|
| `MAIN` / `ISO` | `script.world` | `MAIN` = `--accent-yellow`, `ISO` = `--accent-blue` |
| `{N} lines` | `script.metadata.lineCount` | `--text-muted` |
| `DOM ✓` | `script.metadata.usesDOM` | `--accent-green` if true, omitted if false |
| `IIFE ✓` | `script.metadata.hasIIFE` | `--accent-purple` if true, omitted if false |
| `CHR ✓` | `script.metadata.usesChrome` | `--accent-cyan` if true, omitted if false |

Badge style: 9px monospace, `--bg-tertiary` background, rounded pill (border-radius 4px), 2px padding horizontal.

---

## Interaction Flows (Phase 2 Additions)

### Flow P2-1: User Creates a New Project with URL Rules

```
User opens Options → Projects
    │
    ▼
Clicks [+ New Project]
    │
    ▼
Project Detail View opens (empty form)
    │
    ▼
User enters name: "Internal Dashboard"
User enters description: "Scripts for internal tools"
    │
    ▼
User clicks [+ Add Rule]
    │
    ▼
Empty URL Rule card appears, expanded for editing:
  - Name: (empty, focused)
  - Match Mode: Prefix (default)
  - Match Value: (empty)
    │
    ▼
User fills:
  - Name: "Dashboard pages"
  - Match Mode: Prefix
  - Match Value: "https://internal.example.com/dashboard/"
    │
    ▼
Match Preview auto-updates:
  ✅ https://internal.example.com/dashboard/
  ✅ https://internal.example.com/dashboard/analytics
  ❌ https://internal.example.com/settings
  ❌ https://other.com/dashboard/
    │
    ▼
User clicks [+ Add] in Scripts section of the rule
    │
    ▼
Dropdown shows available scripts from store:
  - custom-dashboard.js
  - helper-utils.js
  - macro-looping.js
  - combo.js
    │
    ▼
User selects "custom-dashboard.js"
    │
    ▼
Script binding card appears:
  World: ISOLATED (from script default)
  Run At: document_idle
  Config: (use project default)
    │
    ▼
User clicks [Save Project]
    │
    ▼
Validation passes → stored → redirect to list
Toast: "✅ Project 'Internal Dashboard' created"
```

### Flow P2-2: User Adds Scripts via Drag-and-Drop

```
User is on Options → Scripts section (or Options → Projects → URL Rule editor)
    │
    ▼
User drags 4 files from desktop onto drop zone:
  - analytics.js (200 KB)
  - tracker.js (150 KB)
  - settings.json (3 KB)
  - readme.txt (1 KB)
    │
    ▼
Drop zone activates (cyan border, glow)
    │
    ▼
User releases files
    │
    ▼
Validation:
  ✅ analytics.js — valid JS, 200 KB
  ✅ tracker.js — valid JS, 150 KB
  ✅ settings.json — valid JSON, 3 KB
  ❌ readme.txt — unsupported file type
    │
    ▼
Processing: hash check, metadata analysis
  analytics.js: new → store
  tracker.js: hash matches existing → "Script already exists. Replace?" → user clicks [Skip]
  settings.json: new → store
    │
    ▼
Toast: "Added 1 script, 1 config. 1 skipped (duplicate). 1 rejected (unsupported type)."
```

### Flow P2-3: User Switches Project in Popup

```
User opens popup while on https://internal.example.com/dashboard/analytics
    │
    ▼
Project selector shows: "Lovable Automation"
Rule matched: "No matching rule for this page" (yellow dot)
    │
    ▼
User clicks dropdown → selects "Internal Dashboard"
    │
    ▼
Extension evaluates URL against Internal Dashboard's rules
    │
    ▼
Rule matched: "Dashboard pages" (prefix) (green dot)
    │
    ▼
Scripts section updates:
  ── Rule: "Dashboard pages" (matched) ──
  custom-dashboard.js  ISO  ⬚ not injected  [Inject]
    │
    ▼
User clicks [Inject]
    │
    ▼
Extension injects custom-dashboard.js into current tab
Script status: ✅ injected
```

### Flow P2-4: User Edits URL Rule Matching

```
User opens Options → Projects → Edit "Lovable Automation"
    │
    ▼
Clicks [Edit ▾] on "Project pages" rule
    │
    ▼
Rule expands inline
    │
    ▼
User changes Match Mode from Prefix to Regex
    │
    ▼
Match Value field changes to monospace, placeholder updates:
  "^https://lovable\\.dev/projects/[a-f0-9-]+"
    │
    ▼
User types regex pattern
    │
    ▼
Regex syntax validated on keystroke (300ms debounce):
  ├── Valid: green border
  └── Invalid: red border + error: "Invalid regex: unterminated group"
    │
    ▼
Match Preview updates with new regex:
  ✅ https://lovable.dev/projects/abc-123
  ✅ https://lovable.dev/projects/def-456-789
  ❌ https://lovable.dev/projects/
  ❌ https://lovable.dev/settings
    │
    ▼
User adds exclude pattern: "^.*/settings$"
    │
    ▼
Preview updates:
  ❌ https://lovable.dev/projects/abc-123/settings (excluded)
    │
    ▼
User clicks [Collapse ▲] to close inline editor
    │
    ▼
Sticky save bar: "Unsaved changes (1 modified)" → [Save Changes]
```

---

## Message Protocol Additions (Phase 2)

All new message types for background ↔ popup/options communication:

```javascript
// Projects CRUD
{ type: 'GET_PROJECTS' }                    // → Project[]
{ type: 'GET_PROJECT', projectId: string }  // → Project
{ type: 'SAVE_PROJECT', project: Project }  // → { success, projectId }
{ type: 'DELETE_PROJECT', projectId: string } // → { success }
{ type: 'DUPLICATE_PROJECT', projectId: string } // → { success, newProjectId }
{ type: 'TOGGLE_PROJECT', projectId: string, enabled: boolean } // → { success }

// Active project (popup)
{ type: 'GET_ACTIVE_PROJECT' }              // → { activeProject, matchedRule, allProjects, injectedScripts }
{ type: 'SET_ACTIVE_PROJECT', projectId: string } // → { matchedRule, injectedScripts }

// Export/Import
{ type: 'EXPORT_PROJECT', projectId: string } // → { json: string }
{ type: 'IMPORT_PROJECT', json: string }    // → { success, projectId, warnings: string[] }

// Script injection (project-aware)
{ type: 'INJECT_SCRIPT', scriptId: string, tabId: number, world: string, configId?: string }
// → { success, error?: string }

// Match evaluation
{ type: 'EVALUATE_URL', url: string }       // → { matchedRules: { projectId, projectName, ruleId, ruleName }[] }
```

---

## Acceptance Criteria (Phase 2)

- [x] Spec written: Options page has a Projects section with full CRUD wireframes
- [x] Spec written: Project list view with cards (enable/disable, edit, duplicate, delete, import)
- [x] Spec written: Project detail view with URL rules, default config, default scripts
- [x] Spec written: URL Rule inline editor with match mode, preview, conditions, script bindings
- [x] Spec written: Popup shows project selector dropdown with match status
- [x] Spec written: Popup scripts section is project-scoped
- [x] Spec written: Drag-and-drop component spec with visual states, validation, and error handling
- [x] Spec written: Metadata badges system for scripts
- [x] Spec written: All interaction flows documented step-by-step (P2-1 through P2-4)
- [x] Spec written: Message protocol additions documented
- [x] Spec written: Export/import project flows documented
- [x] Spec written: File structure updated with new files
- [x] Spec written: DB visibility wireframes (G-16) in `10-popup-options-ui.md` §Data Management
- [x] Spec written: Optional permission request UX tied to Save button gesture (R-14)

---

## Relationship to Existing Spec

This spec **extends** `10-popup-options-ui.md`. The following sections in spec 10 are superseded:

| Spec 10 Section | Status |
|-----------------|--------|
| Popup §4 (Workspace) | Unchanged |
| Popup §5 (Scripts) | **Superseded** by project-scoped scripts (this spec) |
| Options §Script Injection Rules | **Superseded** by Projects section (this spec) |
| All other Options sections | Unchanged |

The old "Script Injection Rules" section in spec 10 (lines 423–487) is replaced by the Projects section. Projects are a superset of the old rules model — each old rule becomes a URL rule within the default project.

---

## Multi-Tab Behavior (v0.2 — G-22)

### Which Tab's State Shows in the Popup?

The popup always shows the state of the **active tab in the current window**:

```javascript
// popup.js — on open
const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
const tabUrl = activeTab.url;

// Evaluate URL against active project's rules
const projectState = await chrome.runtime.sendMessage({
  type: 'GET_ACTIVE_PROJECT',
  tabId: activeTab.id,
  url: tabUrl
});
```

### Per-Tab Injection Tracking

The background service worker maintains a per-tab map of injected scripts:

```javascript
// background.js
const tabInjections = new Map(); // tabId → { scriptId → { status, timestamp, world } }

// On successful injection
function trackInjection(tabId, scriptId, world) {
  if (!tabInjections.has(tabId)) tabInjections.set(tabId, new Map());
  tabInjections.get(tabId).set(scriptId, {
    status: 'injected',
    timestamp: new Date().toISOString(),
    world
  });
}

// On tab close — clean up
chrome.tabs.onRemoved.addListener((tabId) => {
  tabInjections.delete(tabId);
});

// On navigation — reset tab's injection state
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) { // Main frame only
    tabInjections.delete(details.tabId);
  }
});
```

### Popup Behavior with Multiple Tabs

| Scenario | Popup Shows |
|----------|-------------|
| Active tab matches a rule | Green dot, matched rule name, injected scripts |
| Active tab doesn't match any rule | Yellow dot, "No matching rule for this page" |
| Active tab is `chrome://` or non-http | Gray, "Extension cannot run on this page" |
| User switches tabs while popup is open | Popup does NOT auto-update (static snapshot on open) |
| User reopens popup on different tab | Fresh state for the new active tab |

### GET_STATUS Response (Updated)

The `GET_STATUS` response now includes the requesting tab's context:

```javascript
{
  // ... existing fields ...
  tabContext: {
    tabId: 123,
    url: 'https://lovable.dev/projects/abc-123',
    matchedProject: { id: 'default-lovable', name: 'Lovable Automation' },
    matchedRule: { id: 'rule-1', name: 'Project pages', matchMode: 'prefix' },
    injectedScripts: {
      'macro-looping.js': { status: 'injected', world: 'MAIN', timestamp: '...' },
      'combo.js': { status: 'injected', world: 'MAIN', timestamp: '...' }
    }
  }
}
```

---

## Onboarding / First-Run Experience (v0.2 — G-23)

### When It Triggers

On `chrome.runtime.onInstalled` with `reason === 'install'`:

```javascript
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open welcome tab
    chrome.tabs.create({
      url: chrome.runtime.getURL('onboarding/welcome.html')
    });

    // Create default project
    createDefaultProject();

    // Set first-run flag
    chrome.storage.local.set({ marco_first_run_complete: false });
  }
});
```

### Welcome Page Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                    │
│  🔧 Welcome to Marco Extension                                    │
│                                                                    │
│  Version 1.0.0 — Your automation toolkit for the browser           │
│                                                                    │
│  ── What's included ──                                             │
│                                                                    │
│  ✅ Lovable Automation project (pre-configured)                    │
│     • macro-looping.js — automated project cycling                 │
│     • combo.js — workspace switching                               │
│     • Configured for https://lovable.dev/projects/*                │
│                                                                    │
│  ✅ XPath Recorder — click elements to capture XPaths              │
│                                                                    │
│  ✅ Session logging with export — debug any issue                  │
│                                                                    │
│  ── Quick Start ──                                                 │
│                                                                    │
│  1. Log in to lovable.dev (the extension reads your session)       │
│  2. Open a project page — scripts auto-inject                     │
│  3. Click the extension icon to see status                        │
│                                                                    │
│  ── Permissions ──                                                 │
│                                                                    │
│  The extension has access to:                                      │
│  • lovable.dev cookies (for authentication)                        │
│  • Script injection on lovable.dev pages                           │
│  • Local storage for logs and settings                             │
│                                                                    │
│  Need scripts on other domains?                                    │
│  Create a project and add URL rules — you'll be prompted for       │
│  permission when needed.                                           │
│                                                                    │
│  [Open Settings]          [Got it — close this tab]                │
│                                                                    │
└──────────────────────────────────────────────────────────────────┘
```

### First-Run Popup Hint

On first popup open after install (if `marco_first_run_complete === false`):

```
┌──────────────────────────────────────────────────────┐
│  💡 Tip: Open a project on lovable.dev to get started │
│  Scripts will auto-inject on matching pages.          │
│                                                [Got it]│
├──────────────────────────────────────────────────────┤
│  (normal popup content below)                        │
```

After clicking `[Got it]`: set `marco_first_run_complete = true`, hide the hint permanently.

### File Structure Addition

```
onboarding/
  ├── welcome.html       ← Full-tab welcome page
  ├── welcome.js         ← Minimal: close button, open settings link
  └── welcome.css        ← Same color tokens as popup/options
```
