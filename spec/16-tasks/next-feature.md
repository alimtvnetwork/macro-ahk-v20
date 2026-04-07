# Spec: Task Next — Automated Multi-Task Prompt Injection

**Version**: 1.0.0  
**Status**: DRAFT  
**Created**: 2026-03-21  

---

## 1. Problem Statement

Users need to quickly queue multiple "next" task prompts to an AI chatbox. Currently, each "next" command requires manual prompt pasting and button clicking. This feature automates the process: paste a configurable prompt N times with delays, clicking the "Add To Tasks" button after each paste.

---

## 2. UI Design

### 2.1 Dropdown Placement

The "Task Next" button is the **first item** in the prompts dropdown menu, before any prompt entries.

### 2.2 Sub-Menu Structure

```
┌─────────────────────────┐
│ ⏭ Task Next          ▸  │  ← First item in dropdown
├─────────────────────────┤
│ ➕ Add New Prompt       │
├─────────────────────────┤
│ [Category Chips]        │
├─────────────────────────┤
│ Start Prompt            │
│ Start Prompt v2         │
│ ...                     │
└─────────────────────────┘
```

Sub-menu on hover/click:

```
┌─────────────────────────┐
│ Next 1 task             │
│ Next 2 tasks            │
│ Next 3 tasks            │
│ Next 5 tasks            │
│ Next 10 tasks           │
│ Next 20 tasks           │
│ Next 30 tasks           │
│ Next 40 tasks           │
├─────────────────────────┤
│ Custom: [___] tasks  ▶  │  ← Text input + Go button
├─────────────────────────┤
│ ⚙ Settings             │
└─────────────────────────┘
```

### 2.3 Custom Task Count

When hovering "Custom", a text input appears where the user types a number (1–999). Pressing Enter or clicking "Go" starts the automation.

---

## 3. Automation Logic

### 3.1 Sequence per Task

For each of the N tasks, the automation performs:

```
1. Resolve template variables in "Next Tasks Prompt"
2. Inject prompt text into chatbox (DOM append strategy)
3. Wait: pre-click delay (configurable, default 500ms)
4. Click "Add To Tasks" button (if enabled)
   - XPath: /html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]/div/button[2]
   - If button is disabled → skip click, log warning
5. Wait: post-click delay (configurable, default 2000ms)
6. Repeat for next task
```

### 3.2 Button Click Logic

```
Find button by XPath
    │
    ├── Button exists AND enabled?
    │   ├── YES → Click → Wait post-click delay
    │   └── NO  → Log "Button disabled, skipping" → Wait retry delay
    │            → Re-check button (up to 3 retries)
    │            → If still disabled after retries → skip, continue to next task
    │
    └── Button not found?
        → Log error → Show toast "Add To Tasks button not found"
        → Abort remaining tasks
```

### 3.3 "Next Tasks Prompt"

The prompt used for injection is the prompt named **"Next Tasks"** (slug: `next-tasks`). It is stored in the prompts folder like any other prompt and can be edited by the user.

Default content:
```
Next,

List out the remaining tasks always, if you finish then in future `next` command, find any remaining tasks from memory and suggest
```

### 3.4 Progress Feedback

During automation:
- Show a toast: "Task Next: 3/10 completed"
- Update after each successful injection
- On completion: "Task Next: All 10 tasks queued ✅"
- On abort: "Task Next: Stopped at 3/10 ⚠️"

### 3.5 Cancel

User can click anywhere on the controller or press Escape to cancel the automation loop. Remaining tasks are skipped with a toast notification.

---

## 4. Settings

### 4.1 Settings UI

Accessible from the "⚙ Settings" item in the Task Next sub-menu. Opens a modal/panel with:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `preClickDelayMs` | number | 500 | Delay before clicking button (ms) |
| `postClickDelayMs` | number | 2000 | Delay after clicking button (ms) |
| `retryCount` | number | 3 | Times to retry if button disabled |
| `retryDelayMs` | number | 1000 | Delay between retries (ms) |
| `buttonXPath` | string | (see 3.1) | XPath of "Add To Tasks" button |
| `promptSlug` | string | "next-tasks" | Which prompt to use |

### 4.2 Storage

Settings are persisted via the Chrome extension SQLite database using the existing `project_kv` table:

```
Key: "task_next_settings"
Value: JSON string of settings object
```

### 4.3 Default Reset

On `run.ps1 -d`, the default settings JSON is seeded as the initial value. If the user has customized settings, their values are preserved (same merge strategy as prompts).

---

## 5. Communication Flow

```
┌─────────────────────┐
│  Macro Controller    │
│  (MAIN world)        │
│                      │
│  User clicks         │
│  "Next 5 tasks"      │
│                      │
│  Loop i=1..5:        │
│    1. GET_PROMPTS    ─┼──► Chrome Extension ──► Returns prompt list
│    2. Find "Next     │    (background)
│       Tasks" prompt  │
│    3. Inject into    │
│       chatbox (DOM)  │
│    4. Click button   │
│       (XPath)        │
│    5. Wait delay     │
│                      │
│  KV_SET settings   ──┼──► Chrome Extension ──► SQLite project_kv
│  KV_GET settings   ──┼──► Chrome Extension ──► Returns saved settings
└─────────────────────┘
```

---

## 6. Edge Cases

| Scenario | Behavior |
|----------|----------|
| Prompt "Next Tasks" not found | Show error toast, abort |
| Button XPath changed | Fallback to CSS selector `form button:nth-child(2)` |
| Page navigates mid-automation | Abort loop, show toast |
| Button stays disabled for all retries | Skip that task, continue to next |
| User modifies "Next Tasks" prompt | New content used on next run |
| Settings corrupted/missing | Fall back to defaults |

---

## 7. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `standalone-scripts/prompts/13-next-tasks/` | CREATE | Next Tasks prompt folder |
| `standalone-scripts/macro-controller/01-macro-looping.js` | MODIFY | Add Task Next sub-menu + automation loop |
| `src/background/handlers/settings-handler.ts` | MODIFY | Add task-next settings defaults |
| `spec/16-tasks/next-feature.md` | CREATE | This spec |

---

## 8. Acceptance Criteria

- [ ] "Task Next" appears as first item in prompts dropdown
- [ ] Sub-menu shows preset counts (1, 2, 3, 5, 10, 20, 30, 40)
- [ ] Custom number input works (1–999)
- [ ] Clicking a count starts the automation loop
- [ ] Each iteration: injects prompt → waits → clicks button → waits
- [ ] Button disabled state is handled with retries
- [ ] Progress toast shows current/total
- [ ] Escape or click cancels remaining tasks
- [ ] Settings persist across sessions via SQLite
- [ ] Settings modal allows editing all configurable values
- [ ] Default settings are seeded on `run.ps1 -d`
