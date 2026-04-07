# Spec Directory Index

> Reorganized: 2026-04-07 · See [spec-reorganization-plan.md](./spec-reorganization-plan.md) for migration history.

---

| Folder | Description |
|--------|-------------|
| **[01-overview/](./01-overview/)** | Master docs, README, architecture overview, version history, folder policy |
| **[02-spec-authoring-guide/](./02-spec-authoring-guide/)** | Spec authoring templates, conventions, structural standards |
| **[03-coding-guidelines/](./03-coding-guidelines/)** | Unified coding standards: TypeScript, Go, PHP, Rust, C#, AI optimization |
| **[04-error-manage-spec/](./04-error-manage-spec/)** | Error management specifications, error handling patterns |
| **[05-split-db-architecture/](./05-split-db-architecture/)** | Split database architecture, SQLite organization patterns |
| **[06-seedable-config-architecture/](./06-seedable-config-architecture/)** | Seedable config, changelog versioning, RAG validation |
| **[07-data-and-api/](./07-data-and-api/)** | Data schemas, API response samples, DB join specs, JSON schema guides |
| **[08-design-diagram/](./08-design-diagram/)** | Diagram design specifications, Mermaid design system, visual standards |
| **[09-design-system/](./09-design-system/)** | Design system tokens, UI component standards |
| **[10-macro-controller/](./10-macro-controller/)** | Macro controller specs: credit system, workspace management, UI, TS migrations |
| **[11-chrome-extension/](./11-chrome-extension/)** | Chrome extension architecture, build system, message protocol, testing |
| **[12-devtools-and-injection/](./12-devtools-and-injection/)** | DevTools injection, SDK conventions, per-project architecture, assets pipeline |
| **[13-features/](./13-features/)** | Feature specs: PStore marketplace, advanced automation, cross-project sync |
| **[14-imported/](./14-imported/)** | Imported external specs: error management, WordPress, PowerShell, etc. |
| **[15-prompts/](./15-prompts/)** | AI prompt samples, prompt folder structure |
| **[16-tasks/](./16-tasks/)** | Roadmap, task breakdowns, feature planning |
| **[17-app-issues/](./17-app-issues/)** | Bug reports, issue tracking, debugging notes, root cause analysis |
| **[archive/](./archive/)** | Legacy AHK specs, performance audits, XMind files |

---

## Conventions

- **Numbering**: Folders `01–17` are ordered by dependency/priority. No gaps.
- **File naming**: kebab-case, descriptive names. No duplicate prefix numbers.
- **Single source**: Each spec topic lives in exactly one folder. No cross-folder duplication.
- **Cross-references**: Use relative paths from the referencing file.
- **Archive**: Historical/superseded specs go in `archive/`. Never delete — archive instead.
