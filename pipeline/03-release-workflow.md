# 03 — Release Workflow

**File**: `.github/workflows/release.yml`
**Triggers**: Push to `release/*` branches (e.g. `release/v2.119.0`) **or** `v*` tags (e.g. `v2.119.0`)
**Concurrency**: Never cancelled — every release commit must produce a GitHub Release

## Pipeline Steps

Steps 1–11 are identical to the CI workflow (lint → test → build).

After build, the release adds:

```
12. Strip source maps → Delete all .map files from chrome-extension/dist
13. Package assets    → Create ZIP files for each component
14. Generate notes    → Auto-generate release notes from git history
15. GitHub Release     → Create tagged release with all assets
```

## Source Map Removal

Source maps are **never shipped in release assets**. This is enforced at two levels:

1. **Build config** — `vite.config.extension.ts` sets `sourcemap: false` in production mode
2. **Release safety net** — The workflow runs `find chrome-extension/dist -name '*.map' -delete` before zipping, catching any maps that might slip through config changes

Standalone scripts (SDK, XPath, Macro Controller) also default to `sourcemap: false` in production mode via their respective Vite configs.

## Release Assets Produced

| Asset | Contents |
|-------|----------|
| `marco-extension-{VER}.zip` | Chrome extension dist (load unpacked) |
| `macro-controller-{VER}.zip` | Standalone macro controller |
| `marco-sdk-{VER}.zip` | SDK library |
| `xpath-{VER}.zip` | XPath utility |
| `prompts-{VER}.zip` | Prompt templates (if exists) |
| `install.sh` | Bash installer for Linux/macOS |
| `install.ps1` | PowerShell installer for Windows |
| `VERSION.txt` | Plain-text version identifier |
| `CHANGELOG.md` | Full project changelog |

## Version Extraction

The version is derived from the ref type:
```
refs/tags/v2.119.0             →  v2.119.0   (tag push)
refs/heads/release/v2.119.0    →  v2.119.0   (branch push)
```

This version is used for:
- ZIP filenames
- GitHub Release tag and title
- VERSION.txt content

## Release Notes Generation

Auto-generated from git commit history using conventional commit prefixes:
- `feat:` → Features section
- `fix:` → Bug Fixes section
- `refactor:`, `chore:`, `docs:`, etc. → Maintenance section

Includes an assets table and install instructions (PowerShell, Bash, manual).

## GitHub Release Action

Uses `softprops/action-gh-release@v2`:
```yaml
tag_name: v2.119.0
name: "Marco Extension v2.119.0"
body_path: release-assets/RELEASE_NOTES.md
files: release-assets/*
draft: false
prerelease: false
```

## Permissions

Release workflow needs `contents: write` to create tags and releases.
CI workflow only needs `contents: read`.
