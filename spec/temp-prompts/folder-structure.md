# Spec: Prompt Folder Structure & Seeding

**Version**: 1.0.0  
**Status**: DRAFT  
**Created**: 2026-03-21  

---

## 1. Problem Statement

Prompts are currently stored as a single monolithic JSON file (`standalone-scripts/macro-controller/03-macro-prompts.json`). This makes it hard to:
- Add/edit individual prompts without modifying the entire file
- Track changes per prompt via git history
- Organize prompts with rich metadata

## 2. Folder Structure

```
standalone-scripts/
└── prompts/
    ├── 01-start-prompt/
    │   ├── info.json
    │   └── prompt.md
    ├── 02-start-prompt-v2/
    │   ├── info.json
    │   └── prompt.md
    ├── 03-rejog-the-memory-v1/
    │   ├── info.json
    │   └── prompt.md
    ├── 04-unified-ai-prompt-v4/
    │   ├── info.json
    │   └── prompt.md
    ├── 05-issues-tracking/
    │   ├── info.json
    │   └── prompt.md
    ├── 06-unit-test-failing/
    │   ├── info.json
    │   └── prompt.md
    ├── 07-audit-spec-v1/
    │   ├── info.json
    │   └── prompt.md
    ├── 08-minor-bump/
    │   ├── info.json
    │   └── prompt.md
    ├── 09-major-bump/
    │   ├── info.json
    │   └── prompt.md
    ├── 10-patch-bump/
    │   ├── info.json
    │   └── prompt.md
    ├── 11-code-coverage-basic/
    │   ├── info.json
    │   └── prompt.md
    ├── 12-code-coverage-details/
    │   ├── info.json
    │   └── prompt.md
    └── 13-next-tasks/
        ├── info.json
        └── prompt.md
```

### 2.1 Folder Naming Convention

- Format: `{NN}-{slug}/` where NN is a two-digit sequence number
- Slug: lowercase, hyphen-separated, derived from prompt name
- No spaces or special characters

### 2.2 info.json Schema

```json
{
  "id": "uuid-v4",
  "name": "Start Prompt",
  "slug": "start-prompt",
  "author": "user",
  "categories": ["general"],
  "isDefault": true,
  "isFavorite": false,
  "order": 1,
  "createdAt": "2026-03-21T00:00:00.000Z",
  "updatedAt": "2026-03-21T00:00:00.000Z",
  "version": "1.0.0"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string (UUID) | Yes | Unique identifier |
| `name` | string | Yes | Display name of the prompt |
| `slug` | string | Yes | URL-safe identifier, matches folder name suffix |
| `author` | string | Yes | Who created it (e.g., "user", "system") |
| `categories` | string[] | Yes | Array of category tags |
| `isDefault` | boolean | No | Whether this is a built-in prompt (default: true) |
| `isFavorite` | boolean | No | Whether user has favorited it (default: false) |
| `order` | number | Yes | Display order |
| `createdAt` | string (ISO) | Yes | Creation timestamp |
| `updatedAt` | string (ISO) | Yes | Last modification timestamp |
| `version` | string | No | Prompt version for tracking changes |

### 2.3 prompt.md

Contains the full prompt text as Markdown. This is the actual content that gets injected into the chatbox.

---

## 3. Seeding Mechanism

### 3.1 Flow

```
run.ps1 -d / -dv
    │
    ▼
Read standalone-scripts/prompts/*/
    │
    ├── For each folder:
    │   ├── Parse info.json → metadata
    │   └── Read prompt.md → text content
    │
    ▼
Merge into bundled config (macro-prompts.json equivalent)
    │
    ▼
Seed into Chrome extension SQLite DB
    │
    ▼
Macro controller reads from Chrome extension via GET_PROMPTS
```

### 3.2 Build-Time Aggregation

During `run.ps1 -d`, a build script scans `standalone-scripts/prompts/` and generates a single output:

```javascript
// scripts/aggregate-prompts.mjs
// Reads all prompts/*/info.json + prompt.md
// Outputs: dist/prompts/macro-prompts.json (single source of truth)
// Copied to chrome-extension/dist/prompts/ by viteStaticCopy
```

> **Note**: The legacy copy to `standalone-scripts/macro-controller/dist/03-macro-prompts.json` was removed in April 2026. The `instruction.ts` prompts array is now empty since the `__MARCO_PROMPTS__` preamble injection was removed in v7.43.

### 3.3 Seeding Rules

1. **First run**: All prompts from folder are inserted into SQLite `prompts` table
2. **Subsequent runs**: Only new prompts (by slug) are inserted; existing user-modified prompts are NOT overwritten
3. **Deleted prompts**: If a folder is removed, the prompt remains in SQLite (user may have customized it)
4. **Updated defaults**: If `info.json` version changes and user hasn't modified the prompt, the new version replaces the old one

### 3.4 Backward Compatibility

- `03-macro-prompts.json` is no longer generated as a separate legacy artifact
- The macro controller fetches prompts dynamically via `GET_PROMPTS` message — no change to the runtime API
- The `pasteTarget` config from the old JSON file is preserved in `standalone-scripts/macro-controller/02-macro-controller-config.json`

---

## 4. Macro Controller Integration

The macro controller does NOT store prompts statically. It fetches all prompts from the Chrome extension via the message bridge:

```
Macro Controller → window.postMessage({ type: "GET_PROMPTS" })
    → Content Script Relay
    → Background Handler (handleGetPrompts)
    → Returns merged list (defaults from folder + user-created)
```

This is already how it works today. The only change is that the **source of default prompts** moves from a static JSON file to the aggregated output of the prompts folder.

---

## 5. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `standalone-scripts/prompts/*/info.json` | CREATE | Per-prompt metadata |
| `standalone-scripts/prompts/*/prompt.md` | CREATE | Per-prompt content |
| `scripts/aggregate-prompts.mjs` | CREATE | Build script to generate macro-prompts.json |
| `src/background/handlers/prompt-handler.ts` | MODIFY | Update bundled prompt loading to use aggregated file |
| `standalone-scripts/macro-controller/03-macro-prompts.json` | REMOVED | Legacy artifact, no longer generated |

---

## 6. Acceptance Criteria

- [ ] Each prompt has its own folder under `standalone-scripts/prompts/`
- [ ] `info.json` validates against the defined schema
- [ ] `prompt.md` contains the full prompt text
- [ ] Build script generates `macro-prompts.json` from folder contents
- [ ] Seeding on `run.ps1 -d` inserts prompts into SQLite
- [ ] Macro controller dropdown shows all prompts (no regression)
- [ ] Adding a new folder + files automatically appears after next build + seed
- [ ] Existing user-customized prompts are not overwritten during re-seed
