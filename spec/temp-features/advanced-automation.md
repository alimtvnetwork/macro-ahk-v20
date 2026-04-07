# Spec: Advanced Automation — Chaining, Scheduling & Conditional Logic

**Version**: 1.0.0  
**Status**: ✅ Complete (Phase 12)  
**Created**: 2026-03-26  

---

## 1. Problem Statement

Current automation is limited to single-action macros and the Task Next sequential loop. Users need the ability to build multi-step automation chains with conditional branching, scheduling, and inter-script communication.

---

## 2. Features

### 2.1 Automation Chains

A chain is an ordered sequence of steps. Each step is one of:

| Step Type | Description |
|-----------|-------------|
| `inject_prompt` | Inject a named prompt into the chatbox |
| `click_button` | Click a DOM element by XPath/CSS selector |
| `wait` | Pause for N milliseconds |
| `wait_for_element` | Wait until a DOM element appears/disappears |
| `wait_for_text` | Wait until specific text appears in the chat |
| `run_script` | Execute another script by slug |
| `condition` | Branch based on DOM state or KV value |
| `set_kv` | Write a value to project_kv |
| `notify` | Show a toast notification |

### 2.2 Chain Definition (JSON)

```json
{
  "name": "Full Review Cycle",
  "slug": "full-review-cycle",
  "steps": [
    { "type": "inject_prompt", "slug": "code-review" },
    { "type": "click_button", "selector": "form button[type=submit]" },
    { "type": "wait_for_text", "text": "Review complete", "timeout": 60000 },
    {
      "type": "condition",
      "check": { "type": "element_exists", "selector": ".error-banner" },
      "then": [
        { "type": "inject_prompt", "slug": "fix-errors" },
        { "type": "click_button", "selector": "form button[type=submit]" }
      ],
      "else": [
        { "type": "notify", "message": "Review passed ✅" }
      ]
    }
  ]
}
```

### 2.3 Chain Builder UI

Visual editor in Options → Automation tab:

```
┌──────────────────────────────────────────┐
│ ⚡ Automation Chains                      │
├──────────────────────────────────────────┤
│ [+ New Chain]  [Import]  [Export]         │
│                                          │
│ ┌──────────────────────────────────┐     │
│ │ 1. 💬 Inject "code-review"      │     │
│ │    ↓                             │     │
│ │ 2. 🖱 Click submit button        │     │
│ │    ↓                             │     │
│ │ 3. ⏳ Wait for "Review complete" │     │
│ │    ↓                             │     │
│ │ 4. 🔀 If .error-banner exists    │     │
│ │    ├─ ✅ Inject "fix-errors"     │     │
│ │    └─ ❌ Notify "Passed ✅"      │     │
│ └──────────────────────────────────┘     │
│                                          │
│ [▶ Run]  [⏸ Pause]  [⏹ Stop]            │
└──────────────────────────────────────────┘
```

### 2.4 Scheduling

Chains can be triggered on:

| Trigger | Description |
|---------|-------------|
| Manual | User clicks "Run" |
| On page load | When matching URL pattern loads |
| On element appear | When a specific DOM element is detected |
| Interval | Every N minutes (with max run count) |
| Cron-like | Time-of-day scheduling (via `chrome.alarms`) |

### 2.5 Execution Engine

```
ChainRunner
  ├── stepExecutors/        (one per step type)
  ├── conditionEvaluators/  (DOM checks, KV checks)
  ├── state: { currentStep, variables, status }
  ├── pause() / resume() / cancel()
  └── events: onStepComplete, onError, onFinish
```

The runner operates in the MAIN world context and communicates with the extension background for KV operations and script resolution.

---

## 3. Data Model

### 3.1 AutomationChain Table

```sql
CREATE TABLE AutomationChain (
  Id INTEGER PRIMARY KEY AUTOINCREMENT,
  ProjectId INTEGER NOT NULL REFERENCES Project(Id),
  Name TEXT NOT NULL,
  Slug TEXT NOT NULL,
  StepsJson TEXT NOT NULL,       -- JSON array of steps
  TriggerType TEXT DEFAULT 'manual',
  TriggerConfig TEXT,            -- JSON trigger params
  Enabled INTEGER DEFAULT 1,
  CreatedAt TEXT DEFAULT (datetime('now')),
  UpdatedAt TEXT DEFAULT (datetime('now')),
  UNIQUE(ProjectId, Slug)
);
```

---

## 4. Files to Create

| File | Description |
|------|-------------|
| `src/pages/options/views/AutomationView.tsx` | Chain list + builder |
| `src/components/automation/ChainBuilder.tsx` | Visual step editor |
| `src/components/automation/StepCard.tsx` | Individual step component |
| `src/components/automation/TriggerConfig.tsx` | Trigger type selector |
| `src/lib/chain-runner.ts` | Execution engine |
| `src/lib/step-executors.ts` | Step type handlers |
| `src/lib/condition-evaluators.ts` | Condition checkers |

---

## 5. Acceptance Criteria

- [ ] Chain builder UI allows adding/removing/reordering steps
- [ ] All step types execute correctly
- [ ] Conditional branching works with DOM and KV checks
- [ ] Chains persist in SQLite per-project
- [ ] Scheduling triggers fire correctly
- [ ] Pause/resume/cancel work mid-chain
- [ ] Progress indicator shows current step
- [ ] Export/import chains as JSON
