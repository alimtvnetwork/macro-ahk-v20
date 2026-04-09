# Memory: architecture/skipped-folders-policy
Updated: 2026-03-19

## Skipped Folders

All AHK automation folders have been moved to `skipped/` and must NOT be read, edited, or referenced:

- `skipped/marco-script-ahk-v7.latest/` — Former active AHK codebase (replaced by Chrome extension)
- `skipped/marco-script-ahk-v7.9.32/` — Archived snapshot
- `skipped/marco-script-ahk-v6.55/` — Archived baseline
- `skipped/Archives/` — Original AHK v1

**Rule**: Do not touch these folders unless the user gives a specific, explicit instruction.

## Active Codebase

- `chrome-extension/` — Chrome extension source
- `src/` — Shared React components and platform adapters
- `standalone-scripts/` — Standalone JS scripts (macro controller)
- `spec/` — Specifications and documentation

## See Also

- `spec/11-folder-policy.md` — Full folder policy
- `skipped/readme.md` — Skipped folder README
