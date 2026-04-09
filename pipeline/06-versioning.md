# 06 — Versioning

## Version Format

`MAJOR.MINOR.PATCH` — e.g. `2.119.0`

- **MAJOR**: Breaking changes (rare)
- **MINOR**: New features, refactors, non-trivial changes
- **PATCH**: Bug fixes only

## Policy

- **Every code change** must bump at least the minor version
- **All version files must be in sync** — enforced by `check-version-sync.mjs`

## Files That Carry the Version

| # | File | Format | Example |
|---|------|--------|---------|
| 1 | `chrome-extension/manifest.json` | `"version": "X.Y.Z"` | `"version": "2.119.0"` |
| 2 | `chrome-extension/manifest.json` | `"version_name": "X.Y.Z"` | `"version_name": "2.119.0"` |
| 3 | `src/shared/constants.ts` | `EXTENSION_VERSION = "X.Y.Z"` | `export const EXTENSION_VERSION = "2.119.0"` |
| 4 | `standalone-scripts/macro-controller/src/shared-state.ts` | `VERSION = 'X.Y.Z'` | `export const VERSION = '2.119.0'` |
| 5 | `standalone-scripts/macro-controller/src/instruction.ts` | `version: "X.Y.Z"` | `version: "2.119.0"` |
| 6 | `standalone-scripts/marco-sdk/src/instruction.ts` | `version: "X.Y.Z"` | `version: "2.119.0"` |
| 7 | `standalone-scripts/xpath/src/instruction.ts` | `version: "X.Y.Z"` | `version: "2.119.0"` |

## How to Bump

### Option A: Automated (preferred)
```bash
pnpm run bump
# Runs scripts/bump-version.mjs — updates all 7 files
```

### Option B: Manual
```bash
# Replace old version with new in all files at once
sed -i 's/2\.118\.0/2.119.0/g' \
  src/shared/constants.ts \
  chrome-extension/manifest.json \
  standalone-scripts/macro-controller/src/shared-state.ts \
  standalone-scripts/macro-controller/src/instruction.ts \
  standalone-scripts/marco-sdk/src/instruction.ts \
  standalone-scripts/xpath/src/instruction.ts
```

### Option C: AI assistant
Tell the AI: "bump the version" — it should update all 7 locations and changelog.md.

## changelog.md

After bumping, add an entry at the top of `changelog.md`:
```markdown
## [v2.120.0] — YYYY-MM-DD

### Added / Changed / Fixed
- Description of what changed
```

## Release Branch Convention

To trigger a release build:
```bash
git checkout -b release/v2.119.0
git push origin release/v2.119.0
```

The release workflow extracts the version from the branch name.
