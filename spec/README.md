# Spec Directory Index

> Reorganized: 2026-03-30 · See [spec-reorganization-plan.md](./spec-reorganization-plan.md) for migration history.

---

| Folder | Description |
|--------|-------------|
| **[01-overview/](./01-overview/)** | Master docs, README, architecture overview, version history, folder policy |
| **[02-app-issues/](./02-app-issues/)** | Bug reports, issue tracking, debugging notes, root cause analysis |
| **[03-data-and-api/](./03-data-and-api/)** | Data schemas, API response samples, DB join specs, JSON schema guides |
| **[04-tasks/](./04-tasks/)** | Roadmap, task breakdowns, feature planning |
| **[06-macro-controller/](./06-macro-controller/)** | Macro controller specs: credit system, workspace management, UI, TS migrations |
| **[07-chrome-extension/](./07-chrome-extension/)** | Chrome extension architecture, build system, message protocol, testing |
| **[08-coding-guidelines/](./08-coding-guidelines/)** | Unified coding standards: TypeScript, Go, PHP, Chrome extension, engineering |
| **[09-devtools-and-injection/](./09-devtools-and-injection/)** | DevTools injection, SDK conventions, per-project architecture, assets pipeline |
| **[10-features/](./10-features/)** | Feature specs: PStore marketplace, advanced automation, cross-project sync |
| **[11-imported/](./11-imported/)** | Imported external specs: error management, WordPress, PowerShell, etc. |
| **[12-prompts/](./12-prompts/)** | AI prompt samples, prompt folder structure |
| **[archive/](./archive/)** | Legacy AHK specs, performance audits, XMind files |

---

## Conventions

- **Numbering**: Folders `00–10` are ordered by dependency/priority. No gaps.
- **File naming**: kebab-case, descriptive names. No duplicate prefix numbers.
- **Single source**: Each spec topic lives in exactly one folder. No cross-folder duplication.
- **Cross-references**: Use relative paths from the referencing file.
- **Archive**: Historical/superseded specs go in `archive/`. Never delete — archive instead.
