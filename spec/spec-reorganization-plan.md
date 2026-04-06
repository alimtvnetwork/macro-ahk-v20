# Spec Folder Reorganization Plan

> **Created**: 2026-03-30  
> **Status**: ✅ Complete  
> **Initial reorganization**: 2026-04-01  
> **Final restructure (numbering + design-diagram insertion)**: 2026-04-06

---

## Problems Found (all resolved)

| # | Problem | Resolution |
|---|---------|------------|
| 1 | **Duplicate prefix numbers** | Resolved — strict sequential numbering 01–12, no gaps or overlaps |
| 2 | **Coding guidelines in 3 places** | Merged into single `08-coding-guidelines/` |
| 3 | **`03-imported-spec` duplicates `06-coding-guidelines`** | Deduplicated and consolidated |
| 4 | **Tiny folders** — single file or subfolder | Absorbed into parent categories |
| 5 | **Numbering gaps** | Eliminated — continuous 01–12 sequence |
| 6 | **Scattered specs outside `spec/`** | Legacy AHK specs archived to `spec/archive/` |
| 7 | **Category confusion** | Chrome extension specs unified under `07-chrome-extension/` |
| 8 | **`00-standards/` placement** | Migrated into `05-design-diagram/mermaid-design-diagram-spec/01-diagram-spec/` |

---

## Final Structure (implemented)

```
spec/
├── 01-overview/                    # Master docs, architecture, version history, folder policy
├── 02-app-issues/                  # Bug reports, issue tracking, debugging notes
├── 03-data-and-api/                # Data schemas, API samples, DB join specs, JSON schema guides
├── 04-tasks/                       # Roadmap, task breakdowns, feature planning
├── 05-design-diagram/              # Diagram design specifications
│   └── mermaid-design-diagram-spec/
│       └── 01-diagram-spec/
│           ├── diagram-standards.md
│           └── mermaid-diagram-design-system.md
├── 06-macro-controller/            # Macro controller specs: credits, workspaces, UI, TS migrations
├── 07-chrome-extension/            # Extension architecture, build, message protocol, testing
├── 08-coding-guidelines/           # Unified coding standards (TS, Go, PHP, Chrome, engineering)
├── 09-devtools-and-injection/      # DevTools injection, SDK conventions, per-project architecture
├── 10-features/                    # Feature specs: PStore, advanced automation, cross-project sync
├── 11-imported/                    # Imported external specs: error management, WordPress, PowerShell
├── 12-prompts/                     # AI prompt samples and prompt folder structure
├── archive/                        # Legacy AHK specs, performance audits, XMind files
├── README.md                       # Folder index
└── spec-reorganization-plan.md     # This file
```

---

## Completed Tasks

| # | Task | Status |
|---|------|--------|
| 1 | Create `spec/01-overview/` and move overview docs | ✅ Done |
| 2 | Create `spec/03-data-and-api/` and consolidate data specs | ✅ Done |
| 3 | Rename app-issues → `02-app-issues/` | ✅ Done |
| 4 | Rename tasks → `04-tasks/` and absorb standalone files | ✅ Done |
| 5 | Create `spec/06-macro-controller/` and consolidate macro specs | ✅ Done |
| 6 | Merge chrome extension specs into `07-chrome-extension/` | ✅ Done |
| 7 | Create `spec/08-coding-guidelines/` and merge all 3 guideline locations | ✅ Done |
| 8 | Create `spec/09-devtools-and-injection/` | ✅ Done |
| 9 | Create `spec/10-features/` | ✅ Done |
| 10 | Create `spec/11-imported/` and move remaining imported specs | ✅ Done |
| 11 | Rename prompt-samples → `spec/12-prompts/` | ✅ Done |
| 12 | Archive legacy specs and XMind files | ✅ Done |
| 13 | Update all cross-references in specs and memory files | ✅ Done |
| 14 | Write new `spec/README.md` with folder index | ✅ Done |
| 15 | Insert `05-design-diagram/` with mermaid diagram spec hierarchy | ✅ Done (2026-04-06) |
| 16 | Migrate `00-standards/` contents into `05-design-diagram/` | ✅ Done (2026-04-06) |
| 17 | Fix broken cross-references after final restructure | ✅ Done (2026-04-06) |

---

## Old → New Folder Mapping

| Old Path | New Path |
|----------|----------|
| `spec/00-standards/` | `spec/05-design-diagram/mermaid-design-diagram-spec/01-diagram-spec/` |
| `spec/00-overview/` | `spec/01-overview/` |
| `spec/01-app-issues/` | `spec/02-app-issues/` |
| `spec/02-data-and-api/` | `spec/03-data-and-api/` |
| `spec/03-tasks/` | `spec/04-tasks/` |
| `spec/04-macro-controller/` | `spec/06-macro-controller/` |
| `spec/05-chrome-extension/` | `spec/07-chrome-extension/` |
| `spec/06-coding-guidelines/` | `spec/08-coding-guidelines/` |
| `spec/07-devtools-and-injection/` | `spec/09-devtools-and-injection/` |
| `spec/08-features/` | `spec/10-features/` |
| `spec/09-imported/` | `spec/11-imported/` |
| `spec/10-prompts/` | `spec/12-prompts/` |

---

## Rules for Future Folders

1. All folder names: lowercase, hyphen-separated, numeric prefix.
2. Numbering must be sequential with no gaps.
3. New folders append at the end (next available number).
4. Each topic lives in exactly one folder — no duplication.
5. Cross-references use relative paths.
6. Historical/deprecated specs go to `archive/`.

---

*Reorganization Plan v2.0.0 — finalized 2026-04-06*
