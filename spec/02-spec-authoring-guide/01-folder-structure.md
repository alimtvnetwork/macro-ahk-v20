# Folder Structure

**Version:** 1.0.0  
**Updated:** 2026-04-02

---

## Overview

The `spec/` directory is the canonical location for all project specifications. It uses a **numbered folder hierarchy** organized into functional layers. This document explains the complete tree layout, how modules are grouped, and how the numbering scheme works.

---

## Root-Level Tree

```
spec/
├── 00-overview.md                          # Master index — links every module
├── 00-folder-structure-guideline.md        # Legacy structure guide (see this guide instead)
├── 02-prefix-disambiguation.md            # Historical prefix duplication note
├── 99-consistency-report.md               # Root-level consistency report
│
├── 01-spec-authoring-guide/                 # THIS GUIDE — how to write specs
├── 02-coding-guidelines/                   # Consolidated coding standards (5 sub-categories)
├── 03-error-manage-spec/                   # Error management, codes, architecture
├── 04-split-db-architecture/               # Split database pattern
├── 05-seedable-config-architecture/        # Seedable configuration with versioning

│
├── 09-gsearch-cli/                         # CLI: Google/Bing search + BI suite
├── 10-brun-cli/                            # CLI: Build runner
├── 11-ai-bridge-cli/                       # CLI: LLM orchestration
├── 12-nexus-flow-cli/                      # CLI: Visual workflow editor
├── 13-wp-plugin/                           # WordPress plugins
├── 14-wp-plugin-builder/                   # CLI: WP plugin scaffolding
├── 15-spec-reverse-cli/                    # CLI: Code-to-spec reverse engineering
├── 16-ai-transcribe-cli/                   # CLI: Speech-to-text/text-to-speech
├── 17-ai-research/                         # AI research notes
├── 18-error-resolution/                    # Error handling patterns
├── 19-license-manager/                     # CLI: License key management
├── 20-shared-cli-frontend/                 # Shared React frontend for CLIs
├── 21-wp-seo-publish-cli/                  # CLI: WordPress SEO publishing
│
├── 23-how-app-issues-track/                # Issue tracking & prevention
│
├── 28-wp-plugin-development/               # WordPress plugin patterns
├── 29-upload-scripts/                      # Plugin upload/deployment scripts
├── 30-e2-activity-feed/                    # Activity feed spec
├── 31-generic-enforce/                     # Automated standard enforcement
├── 32-shared-preset-data/                  # Shared preset/seed data
├── 33-ai-bridge-non-vector-rag/            # Non-vector RAG system
├── 34-time-log-cli/                        # CLI: OS-level activity tracker (Rust)
├── 35-time-log-ui/                         # Web dashboard for Time Log
├── 36-time-log-combined/                   # Combined acceptance criteria
│
├── 99-archive/                             # Deprecated specifications
└── validation-reports/                     # Audit and validation artifacts
```

> **Note:** The numbering above reflects the **post-resequencing** state after inserting `08-spec-authoring-guide`. Some numbers are non-contiguous (e.g., 21 → 23, 23 → 28) for historical reasons and future reservation.

---

## Functional Layers

Modules are organized into six conceptual layers:

### Layer 1: Foundation & Standards (01–08)

Foundational rules that all other modules depend on.

| # | Module | Purpose |
|---|--------|---------|
| 01 | spec-authoring-guide | This guide — how to write and maintain specs |
| 02 | coding-guidelines | Consolidated language standards (cross-language, TS, Go, PHP, Rust) |
| 03 | error-manage-spec | Error management, error codes, error architecture |
| 04 | split-db-architecture | Split database pattern (operational + config DBs) |
| 05 | seedable-config-architecture | Seedable configuration with changelog versioning |

### Layer 2: CLI Tools (09–21)

Individual CLI tool specifications, each following the 3-folder pattern.

| # | Module | Language |
|---|--------|----------|
| 09 | gsearch-cli | Go |
| 10 | brun-cli | Go |
| 11 | ai-bridge-cli | Go |
| 12 | nexus-flow-cli | Go |
| 14 | wp-plugin-builder | Go |
| 15 | spec-reverse-cli | Go |
| 16 | ai-transcribe-cli | Go |
| 19 | license-manager | Go |
| 21 | wp-seo-publish-cli | Go |
| 31 | generic-enforce | Go |
| 34 | time-log-cli | Rust |

### Layer 3: WordPress (13, 28–29)

WordPress plugin specifications and deployment tooling.

| # | Module | Purpose |
|---|--------|---------|
| 13 | wp-plugin | Plugin specs (exam manager, link manager, etc.) |
| 28 | wp-plugin-development | Plugin development patterns |
| 29 | upload-scripts | Plugin deployment utilities |

### Layer 4: Research & Tracking (17, 23, 30)

Research notes, issue tracking, and activity feeds.

| # | Module | Purpose |
|---|--------|---------|
| 17 | ai-research | AI research explorations |
| 23 | how-app-issues-track | Issue tracking and mistake prevention |
| 30 | e2-activity-feed | Activity feed specification |

### Layer 5: Shared Modules & Frontend (20, 32, 35–36)

Shared libraries, data, and UI dashboards.

| # | Module | Purpose |
|---|--------|---------|
| 20 | shared-cli-frontend | Shared React frontend for all CLIs |
| 32 | shared-preset-data | Shared preset/seed data files |
| 35 | time-log-ui | Web dashboard for Time Log data |
| 36 | time-log-combined | Combined acceptance criteria for Time Log |

### Layer 6: Archive & Governance (99, validation-reports)

Historical and governance artifacts.

| # | Module | Purpose |
|---|--------|---------|
| 99 | archive | Deprecated and superseded specs |
| — | validation-reports | Audit certificates and validation logs |

---

## Reserved Number Ranges

| Range | Purpose |
|-------|---------|
| 00 | Root files (overview, folder guideline) and `00-overview.md` within folders |
| 01–07 | Foundation & standards |
| 08 | Spec authoring guide |
| 09–21 | CLI tools and core platform modules |
| 22 | Reserved / skipped |
| 23–36 | Research, WordPress, utilities, enforcement, shared data |
| 37–89 | Future modules |
| 90–95 | Meta documents (if needed) |
| 96 | AI context files |
| 97 | Acceptance criteria |
| 98 | Changelogs |
| 99 | Consistency reports and archive |

---

## Module Templates

Two templates exist depending on project type:

| Type | Template | Pattern |
|------|----------|---------|
| **CLI tool** | [CLI Module Template](./04-cli-module-template.md) | `01-backend/`, `02-frontend/`, `03-deploy/` |
| **App / WordPress** | [App Project Template](./05-app-project-template.md) | `01-fundamentals.md`, `02-features/`, `03-issues/` |

- **CLI tools** — Go/Rust command-line tools with backend, optional frontend, and deploy specs
- **App/WordPress projects** — Plugins, themes, or web apps with features and issue tracking. Features use `01-backend.md`, `02-frontend.md`, `03-wp-admin.md` sub-structure.

---

## Subfolder Depth Rules

- **Maximum depth:** 3 levels (e.g., `spec/13-wp-plugin/03-exam-manager/02-features/01-exam-builder/`)
- **Each level** follows the same `{NN}-{name}` convention
- **Every folder** at any depth must have `00-overview.md`
- **Only top-level** and major subfolder boundaries require `99-consistency-report.md`

---

## Non-Contiguous Numbering

Some numbers are intentionally skipped:
- **22** — Reserved (previously used, now skipped)
- **24–27** — Consolidated into `03-coding-guidelines` subfolders (no longer standalone)

These gaps are preserved to avoid mass-renaming existing modules. New modules should use the **next available number** after the highest existing module.
