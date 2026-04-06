# Spec Folder Reorganization Plan

> **Created**: 2026-03-30  
> **Status**: ✅ Complete (2026-04-01)

---

## Problems Found

| # | Problem | Example |
|---|---------|---------|
| 1 | **Duplicate prefix numbers** — `01-*`, `03-*`, `04-*`, `15-*` each have 2+ folders | `01-api-response/` vs `01-app/`, `04-chrome-project-scripts/` vs `04-db-join-specs/` |
| 2 | **Coding guidelines in 3 places** | `spec/coding-guidelines/`, `spec/08-coding-guidelines/`, `spec/07-chrome-extension/coding-guidelines/` |
| 3 | **`03-imported-spec` duplicates `06-coding-guidelines`** | Both contain golang, typescript, PHP standards |
| 4 | **Tiny folders** — single file or subfolder | `04-db-join-specs/` (1 file), `04-chrome-project-scripts/` (1 subfolder) |
| 5 | **Numbering gaps** | No folders 11, 13, 14 (exist as standalone .md files) |
| 6 | **Scattered specs outside `spec/`** | `skipped/marco-script-ahk-v7.*/specs/` (legacy AHK specs) |
| 7 | **Category confusion** | Chrome extension specs split across `07-chrome-extension/`, `04-chrome-project-scripts/`, `07-chrome-extension/testing/` |

---

## Proposed New Structure

```
spec/
├── 01-overview/                    # Master docs, README, architecture
│   ├── README.md                   (from spec/README.md)
│   ├── 00-master-overview.md
│   ├── 03-architecture.md
│   ├── 10-version-history-summary.md
│   └── 11-folder-policy.md
│
├── 03-data-and-api/                # Data schemas, API responses, DB specs
│   ├── api-response/               (from 01-api-response/)
│   ├── data-schema.md              (from 04-data-schema.md)
│   ├── data-models.md              (from 17-data-models.md)
│   ├── db-join-specs/              (from 04-db-join-specs/)
│   └── json-schema-guide.md        (from 23/24-json-schema*.md)
│
├── 02-app-issues/                      # All app issues (rename from 01-app-issues)
│   └── (all existing contents unchanged)
│
├── 04-tasks/                       # Roadmap, task breakdowns (from 03-tasks)
│   └── (all existing contents unchanged)
│
├── 06-macro-controller/            # Everything macro controller
│   ├── credit-system.md            (from 06-macro-controller/credit-system.md)
│   ├── workspace-management.md     (from 06-macro-controller/workspace-management.md)
│   ├── ui-controllers.md           (from 06-macro-controller/ui-controllers.md)
│   ├── ui-overhaul.md              (from 06-macro-controller/ui-overhaul.md)
│   ├── migration-v2.md             (from 06-macro-controller/migration-v2.md)
│   ├── workspace-name/             (from 06-macro-controller/workspace-name/)
│   ├── js-to-ts-migration/         (from 06-macro-controller/js-to-ts-migration/)
│   └── ts-migration-v2/            (from 06-macro-controller/ts-migration-v2/)
│
├── 07-chrome-extension/            # All chrome extension specs (merge 05-chrome-extension + imported)
│   └── (all existing 07-chrome-extension/ contents)
│   └── testing/                    (from 07-chrome-extension/testing/)
│
├── 08-coding-guidelines/           # Single source — merge all 3 locations
│   ├── 01-code-quality.md          (from spec/coding-guidelines/)
│   ├── typescript-standards/       (from 03-imported-spec/04 + 08-coding-guidelines/05)
│   ├── golang-standards/           (from 03-imported-spec/05 + 08-coding-guidelines/06)
│   ├── php-standards/              (from 03-imported-spec/06 + 08-coding-guidelines/07)
│   ├── coding-guidelines/          (from 03-imported-spec/03 + 08-coding-guidelines/04)
│   └── engineering-standards.md    (from 05-engineering-standards.md)
│
├── 09-devtools-and-injection/      # DevTools, injection, SDK
│   ├── devtools-injection.md       (from 08-devtools-injection.md)
│   ├── sdk-convention.md           (from 18-marco-sdk-convention.md)
│   ├── per-project-architecture.md (from 18-per-project-architecture.md)
│   └── standalone-script-assets.md (from 16-standalone-script-assets-pipeline.md)
│
├── 10-features/                    # Feature specs (pstore, automation, sync)
│   ├── pstore-marketplace.md       (from 20-pstore-marketplace.md)
│   ├── advanced-automation.md      (from 21-advanced-automation.md)
│   ├── cross-project-sync.md       (from 22-cross-project-sync.md)
│   └── storage-ui-redesign.md      (already in 07-chrome-extension/55)
│
├── 11-imported/                    # External/imported specs (error mgmt, WP, PS, etc.)
│   ├── error-management/           (from 03-imported-spec/07)
│   ├── wordpress-plugin/           (from 03-imported-spec/08+09)
│   ├── wp-plugin-publish/          (from 03-imported-spec/10)
│   ├── upload-scripts/             (from 03-imported-spec/11)
│   ├── powershell-integration/     (from 03-imported-spec/12)
│   ├── e2-activity-feed/           (from 03-imported-spec/13)
│   └── generic-enforce/            (from 03-imported-spec/14)
│
├── 12-prompts/                     # Prompt samples and structure
│   ├── (from 14-prompt-samples/)
│   └── folder-structure.md         (from 16-prompt-folder-structure.md)
│
├── archive/                        # Already exists — add legacy AHK specs
│   ├── ahk-v7.9.32-specs/         (from skipped/marco-script-ahk-v7.9.32/specs/)
│   ├── ahk-v7.latest-specs/       (from skipped/marco-script-ahk-v7.latest/specs/)
│   ├── xmind/                      (from 01-Format v9.xmind, 02-How to Automate.xmind)
│   └── (existing archive contents)
│
└── 04-tasks/next-feature.md         (standalone — move into 04-tasks/)
```

---

## Atomic Tasks (execute in order)

### Task 1 — Create `spec/01-overview/` and move overview docs
- Create `spec/01-overview/`
- Move: `README.md`, `00-master-overview.md`, `03-architecture.md`, `10-version-history-summary.md`, `11-folder-policy.md`

### Task 2 — Create `spec/03-data-and-api/` and consolidate data specs
- Create `spec/03-data-and-api/`
- Move `01-api-response/` → `spec/03-data-and-api/api-response/`
- Move `04-data-schema.md`, `17-data-models.md`, `23-json-schema-authoring-guide.md`, `24-marco-json-schema-guide.md`
- Move `04-db-join-specs/` contents into `spec/03-data-and-api/db-join-specs/`
- Delete empty `04-db-join-specs/`

### Task 3 — Rename `02-app-issues/` → `02-app-issues/`
- Rename folder

### Task 4 — Rename `04-tasks/` → `04-tasks/` and absorb `04-tasks/next-feature.md`
- Rename folder
- Move `04-tasks/next-feature.md` into `spec/04-tasks/`

### Task 5 — Create `spec/06-macro-controller/` and consolidate macro specs
- Create `spec/06-macro-controller/`
- Move from `01-app/`: `macrocontroller-js-to-ts-migration/`, `macrocontroller-ts-migration-v2/`
- Move from `04-chrome-project-scripts/03-macro-controller/`: `05-workspace-name/`
- Move standalone files: `06-macro-controller/credit-system.md`, `06-macro-controller/workspace-management.md`, `06-macro-controller/ui-controllers.md`, `06-macro-controller/ui-overhaul.md`, `06-macro-controller/migration-v2.md`
- Move remaining `01-app/` files (`workspace-detection.md`, `prompt-relational-structure-and-views.md`, `README.md`) into appropriate folders
- Delete empty `01-app/`, `04-chrome-project-scripts/`

### Task 6 — Rename `07-chrome-extension/` → `07-chrome-extension/` and merge imported chrome specs
- Rename folder
- Move `07-chrome-extension/testing/` contents into `spec/07-chrome-extension/testing/`
- Merge `07-chrome-extension/coding-guidelines/` into the unified guidelines folder (Task 7)

### Task 7 — Create `spec/08-coding-guidelines/` and merge all 3 guideline locations
- Create `spec/08-coding-guidelines/`
- Move from `spec/coding-guidelines/`: `01-code-quality-improvement.md`
- Move from `spec/08-coding-guidelines/`: all subfolders (dedup against `03-imported-spec`)
- Move from `spec/03-imported-spec/03-coding-guidelines/` through `06-php-standards/`
- Move `05-engineering-standards.md`
- Delete empty `coding-guidelines/`, `08-coding-guidelines/`

### Task 8 — Create `spec/09-devtools-and-injection/`
- Move: `08-devtools-injection.md`, `18-marco-sdk-convention.md`, `18-per-project-architecture.md`, `16-standalone-script-assets-pipeline.md`

### Task 9 — Create `spec/10-features/`
- Move: `20-pstore-marketplace.md`, `21-advanced-automation.md`, `22-cross-project-sync.md`

### Task 10 — Create `spec/11-imported/` and move remaining imported specs
- Move from `03-imported-spec/`: `07-error-manage/`, `08-wordpress-plugin/`, `09-wordpress-plugin-development/`, `10-wp-plugin-publish/`, `11-upload-scripts/`, `12-powershell-integration/`, `13-e2-activity-feed/`, `14-generic-enforce/`
- Move `03-imported-spec/00-testing-index.md`, `dry-refactoring-summary.md`
- Delete empty `03-imported-spec/`

### Task 11 — Rename `14-prompt-samples/` → `spec/12-prompts/` and absorb prompt docs
- Move `14-prompt-samples/` → `spec/12-prompts/`
- Move `16-prompt-folder-structure.md` into it

### Task 12 — Archive legacy specs and XMind files
- Move `skipped/marco-script-ahk-v7.9.32/specs/` → `spec/archive/ahk-v7.9.32-specs/`
- Move `skipped/marco-script-ahk-v7.latest/specs/` → `spec/archive/ahk-v7.latest-specs/`
- Move `01-Format v9.xmind`, `02-How to Automate.xmind` → `spec/archive/xmind/`

### Task 13 — Update all cross-references in specs and memory files
- Search for old paths (`spec/07-chrome-extension/`, `spec/02-app-issues/`, etc.) across all `.md` files
- Update internal links to new paths

### Task 14 — Write new `spec/README.md` with folder index
- Document the new structure with descriptions for each top-level folder

---

## Files That Stay As-Is

- `.lovable/memory/` — untouched (only cross-references updated)
- `standalone-scripts/` — code stays, only spec refs updated
- `chrome-extension/` — code stays, only spec refs updated
- `skipped/marco-script-ahk-*/` — code + config stays, only `specs/` subfolder archived

---

*Reorganization Plan v1.0.0 — 2026-03-30*
