# Memory: project/documentation-hierarchy
Updated: 2026-04-07

Project documentation is consolidated in the `spec/` directory using a numbered hierarchy:

| Folder | Content |
|--------|---------|
| `01-overview/` | Master docs, architecture overview, version history |
| `02-spec-authoring-guide/` | Spec authoring templates, conventions, structural standards |
| `03-coding-guidelines/` | Unified coding standards (TS, Go, PHP, Rust, C#, AI optimization) |
| `04-error-manage-spec/` | Error management specifications, error handling patterns |
| `05-split-db-architecture/` | Split database architecture, SQLite organization patterns |
| `06-seedable-config-architecture/` | Seedable config, changelog versioning, RAG validation |
| `07-data-and-api/` | Data schemas, API samples, DB join specs, JSON schema guides |
| `08-design-diagram/` | Diagram design specs, Mermaid design system, visual standards |
| `09-design-system/` | Design system tokens, UI component standards |
| `10-macro-controller/` | Macro controller specs: credits, workspaces, UI, TS migrations |
| `11-chrome-extension/` | Extension architecture, build, message protocol, testing |
| `12-devtools-and-injection/` | DevTools injection, SDK conventions, per-project architecture |
| `13-features/` | Feature specs: PStore, advanced automation, cross-project sync |
| `14-imported/` | Imported external specs: error management, WordPress, PowerShell |
| `15-prompts/` | AI prompt samples and prompt folder structure |
| `16-tasks/` | Roadmap, task breakdowns, feature planning |
| `17-app-issues/` | Bug reports, issue tracking, debugging notes |
| `archive/` | Legacy AHK specs, performance audits, XMind files |

## Conventions

- Folders `01–17` ordered by dependency/priority, no gaps.
- File naming: kebab-case, descriptive. No duplicate prefix numbers.
- Single source of truth: each topic in exactly one folder.
- Cross-references use relative paths. Historical specs go to `archive/`.
- Full index: `spec/readme.md`. Migration history: `spec/spec-reorganization-plan.md`.

## 08-design-diagram Structure

```
spec/08-design-diagram/
└── mermaid-design-diagram-spec/
    └── 01-diagram-spec/
        ├── diagram-standards.md
        └── mermaid-diagram-design-system.md
```
