# 03 — Release Workflow

**File**: `.github/workflows/release.yml`
**Triggers**: Push to `release/**` branches (e.g. `release/v2.119.0`) **or** `v*` tags (e.g. `v2.119.0`)
**Concurrency**: Never cancelled — every release commit must produce a GitHub Release

## Environment

```yaml
env:
  FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
```

## Pipeline Steps

Steps 1–11 are identical to the CI workflow (lint → test → build).

After build, the release adds:

```
12. Strip source maps → Delete all .map files from chrome-extension/dist (logs count)
13. Package assets    → Create ZIP files for each component
14. Generate checksums → SHA256 checksums.txt for all assets
15. Generate notes    → Auto-generate release notes with commit, branch, build date
16. GitHub Release    → Create tagged release with all assets
```

## Source Map Removal

Source maps are **never shipped in release assets**. This is enforced at two levels:

1. **Build config** — `vite.config.extension.ts` sets `sourcemap: false` in production mode
2. **Release safety net** — The workflow runs `find chrome-extension/dist -name '*.map' -delete` before zipping, logging the count of removed files

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
| `changelog.md` | Full project changelog |
| `checksums.txt` | SHA256 checksums of all assets |

## Checksums

SHA256 checksums are generated for all assets and included as `checksums.txt`:

```bash
cd release-assets
sha256sum * > checksums.txt
```

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

Auto-generated with:
- **Release info table** — version, commit SHA (first 10 chars), branch, build date (UTC)
- **Categorized changelog** from conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
- **SHA256 checksums** block
- **Assets table** with descriptions
- **Quick install** commands for PowerShell and Bash (latest + pinned)
- **Manual install** instructions for Chromium browsers

## GitHub Release Action

Uses `softprops/action-gh-release@v2`:
```yaml
tag_name: v2.119.0
name: "Marco Extension v2.119.0"
body_path: release-assets/RELEASE_NOTES.md
files: release-assets/*
draft: false
prerelease: false          # true if version contains '-' (e.g. v2.119.0-beta)
make_latest: true          # false if prerelease
```

## Prerelease Detection

Versions containing `-` (e.g. `v2.119.0-beta`, `v2.119.0-rc.1`) are automatically marked as prerelease and not set as "latest".

## Permissions

Release workflow needs `contents: write` to create tags and releases.
CI workflow only needs `contents: read`.

## Actions Versions

| Action | Version |
|--------|---------|
| `actions/checkout` | v6 |
| `actions/setup-node` | v4 |
| `pnpm/action-setup` | v4 |
| `softprops/action-gh-release` | v2 |
