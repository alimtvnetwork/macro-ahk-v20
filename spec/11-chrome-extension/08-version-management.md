# Chrome Extension — Version Management

**Version**: v0.2 (Phase 5 Expansion)
**Date**: 2026-02-28
**Changes in v0.2**: Added micro-bump policy, git hook spec, changelog automation

---

## Purpose

Define how version numbers are assigned, bumped, tracked, and displayed across the Chrome extension. This replaces the AHK dual-sync model (`AHK_BUILD_VERSION` + `config.ini ScriptVersion`) with a single source of truth in `manifest.json`.

---

## Version Format

**Semantic Versioning** with Chrome's 4-part constraint:

```
MAJOR.MINOR.PATCH.BUILD
  │     │     │     │
  │     │     │     └── Auto-incremented on every publish/build
  │     │     └──────── Bug fixes, XPath updates, config tweaks
  │     └────────────── New features, new scripts, new config sections
  └──────────────────── Breaking changes (schema migration required)
```

### Examples

| Version | Meaning |
|---------|---------|
| `1.0.0.0` | Initial release (MVP) |
| `1.1.0.0` | Added XPath recorder |
| `1.1.1.0` | Fixed cookie read timing |
| `1.1.1.42` | 42nd build of patch 1.1.1 |
| `2.0.0.0` | Breaking config schema change (migration needed) |

### Chrome Constraints

- `manifest.json` `version` field: Must be 1-4 dot-separated integers, each 0–65535
- `manifest.json` `version_name` field: Free-form string for display (e.g., `"1.1.0-beta"`)

```json
{
  "version": "1.1.0.42",
  "version_name": "1.1.0 (build 42)"
}
```

---

## Single Source of Truth

```
manifest.json → version field
       │
       ├──► background.js reads at startup via chrome.runtime.getManifest()
       ├──► popup.js reads and displays in popup UI
       ├──► content scripts receive via GET_CONFIG response
       ├──► logs.db sessions table stores per-session
       └──► config.json general.scriptVersion (REMOVED — no longer needed)
```

### Reading the Version

```javascript
// Anywhere in the extension
const manifest = chrome.runtime.getManifest();
const version = manifest.version;        // "1.1.0.42"
const versionName = manifest.version_name; // "1.1.0 (build 42)"
```

No hardcoded version constants in any JS file. Always read from manifest.

---

## Where the Version Appears

### 1. Popup UI — Header

```
┌─────────────────────────────────────┐
│  🔧 Marco Extension  v1.1.0 (42)   │
│─────────────────────────────────────│
│  Status: ✅ Connected               │
│  Workspace: Production              │
│  Token: Valid (expires in 23h)      │
│                                     │
│  [🔴 Record XPaths]  [⚙ Settings]  │
│─────────────────────────────────────│
│  combo.js: ✅ injected              │
│  macro-loop: ✅ injected            │
│  Last config fetch: 2m ago          │
└─────────────────────────────────────┘
```

```javascript
// popup.js
document.getElementById('version-label').textContent =
  'v' + chrome.runtime.getManifest().version_name;
```

### 2. Content Script Panels

Both combo.js and macro-looping.js display the version in their floating panel headers:

```
[ComboSwitch v1.1.0] ── [−] [×]
[MacroLoop v1.1.0]   ── [−] [×]
```

```javascript
// Content script receives version via config
chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, function(config) {
  const version = config._extensionVersion; // Injected by background
  // Use in panel title
});
```

### 3. Console Logs

Every log line includes version in the prefix (matching current AHK behavior):

```
[Marco v1.1.0] [combo] Initialized with 5 workspaces
[Marco v1.1.0] [macro-loop] Starting cycle #42
```

### 4. SQLite Sessions Table

Each session row records the version for debugging across upgrades:

```sql
INSERT INTO sessions (id, started_at, version, ...)
VALUES ('uuid', '2026-02-25T14:30:00Z', '1.1.0.42', ...);
```

### 5. Export Headers

All exported files (`.db`, JSON, CSV) include the version:

```json
{
  "exportedBy": "Marco Extension",
  "version": "1.1.0.42",
  "exportedAt": "2026-02-25T14:30:00Z",
  "session": "uuid-here",
  ...
}
```

### 6. Options Page — Footer

```
Marco Extension v1.1.0 (build 42) | Config schema v1.0.0
```

---

## Version Bumping

### Manual Bumps (MAJOR.MINOR.PATCH)

Semantic parts are bumped manually in `manifest.json` before publishing:

| When | Bump | Example |
|------|------|---------|
| Breaking config schema change | MAJOR | `1.x.x` → `2.0.0` |
| New feature (remote config, recorder) | MINOR | `1.1.x` → `1.2.0` |
| Bug fix, XPath update, text change | PATCH | `1.1.0` → `1.1.1` |

### Auto-Increment BUILD (v0.2 — Micro-Bump Policy)

**Rule**: The BUILD number increments on **every commit** to the extension directory, including minor changes. This ensures every deployed version is uniquely identifiable in logs and error reports.

#### Git Hook (Pre-Commit)

```bash
#!/bin/sh
# .git/hooks/pre-commit — auto-bump BUILD number

# Check if any chrome-extension files are staged
STAGED=$(git diff --cached --name-only -- chrome-extension/)
if [ -z "$STAGED" ]; then
  exit 0  # No extension changes, skip bump
fi

MANIFEST="chrome-extension/manifest.json"
if [ ! -f "$MANIFEST" ]; then
  exit 0
fi

# Read current version
VERSION=$(grep '"version"' "$MANIFEST" | head -1 | sed 's/.*: *"\([^"]*\)".*/\1/')
MAJOR=$(echo "$VERSION" | cut -d. -f1)
MINOR=$(echo "$VERSION" | cut -d. -f2)
PATCH=$(echo "$VERSION" | cut -d. -f3)
BUILD=$(echo "$VERSION" | cut -d. -f4)

# Increment BUILD
NEW_BUILD=$((BUILD + 1))
NEW_VERSION="$MAJOR.$MINOR.$PATCH.$NEW_BUILD"
NEW_VERSION_NAME="$MAJOR.$MINOR.$PATCH (build $NEW_BUILD)"

# Update manifest.json
sed -i "s/\"version\": \"$VERSION\"/\"version\": \"$NEW_VERSION\"/" "$MANIFEST"
sed -i "s/\"version_name\": \"[^\"]*\"/\"version_name\": \"$NEW_VERSION_NAME\"/" "$MANIFEST"

# Re-stage manifest
git add "$MANIFEST"

echo "[version] Auto-bumped BUILD: $VERSION → $NEW_VERSION"
```

#### PowerShell Equivalent (for Windows)

```powershell
# build.ps1 — Run before publishing or as pre-commit hook
$manifest = Get-Content "chrome-extension/manifest.json" -Raw | ConvertFrom-Json
$parts = $manifest.version.Split('.')
$parts[3] = [int]$parts[3] + 1
$manifest.version = $parts -join '.'
$manifest.version_name = "$($parts[0]).$($parts[1]).$($parts[2]) (build $($parts[3]))"
$manifest | ConvertTo-Json -Depth 10 | Set-Content "chrome-extension/manifest.json" -Encoding UTF8
Write-Host "[version] Bumped to $($manifest.version)"
```

### Bump Decision Matrix

| Change | MAJOR | MINOR | PATCH | BUILD |
|--------|-------|-------|-------|-------|
| Config schema breaking change | ✅ bump | reset | reset | reset |
| New feature (e.g., project model) | — | ✅ bump | reset | reset |
| Bug fix, XPath update | — | — | ✅ bump | reset |
| Any commit to extension dir | — | — | — | ✅ auto |
| Spec-only change (no code) | — | — | — | — |
| README/docs change | — | — | — | — |

### Version History Log

Maintain a `changelog.md` in the extension root. Format follows [Keep a Changelog](https://keepachangelog.com/):

```markdown
# Changelog

## [Unreleased]
### Added
- Project model with URL rules, script/config bindings
- Drag-and-drop file upload for scripts and configs
- ZIP export for session diagnostics

## [1.1.0] - 2026-02-25
### Added
- XPath Recorder with click-to-capture
- Remote config endpoint support
### Changed
- All injection is now programmatic only (no static content_scripts)

## [1.0.0] - 2026-02-20
### Added
- Initial release: combo.js + macro-looping.js as content scripts
- SQLite logging with logs.db + errors.db
- Cookie-based authentication
- Basic popup UI
```

### Changelog Automation

On MINOR or PATCH bump, the developer should:
1. Move `[Unreleased]` items to a new version section
2. Add the date
3. Commit changelog with the version bump

The git hook only handles BUILD auto-increment — MAJOR/MINOR/PATCH bumps and changelog updates are manual and intentional.

---

## Mapping from AHK Versioning

| AHK (Current) | Chrome Extension (New) |
|---------------|----------------------|
| `AHK_BUILD_VERSION := "7.17"` in `Automator.ahk` | `"version": "1.0.0.0"` in `manifest.json` |
| `ScriptVersion=7.11` in `config.ini` | Removed — single source in manifest |
| Dual-sync required (AHK + INI must match) | Single source — no sync needed |
| Manual version string in JS: `var VERSION = '__VERSION__'` | `chrome.runtime.getManifest().version` — always current |
| No build number | Auto-incrementing BUILD part |

### Starting Version

The Chrome extension starts at **`1.0.0.0`** (not continuing from `7.17`) because it's a new platform with a new architecture. The AHK lineage is documented but the version number resets.

---

## Version Compatibility Checks

### Config Schema Version

`config.json` has its own `version` field for schema compatibility:

```json
{
  "version": "1.0.0",
  ...
}
```

On load, the background service worker checks compatibility:

```javascript
async function checkConfigCompatibility(config) {
  const extVersion = chrome.runtime.getManifest().version;
  const configVersion = config.version || '0.0.0';

  const extMajor = parseInt(extVersion.split('.')[0]);
  const cfgMajor = parseInt(configVersion.split('.')[0]);

  if (cfgMajor < extMajor) {
    log('WARN', 'background', 'CONFIG', 'version_mismatch',
        'Config schema v' + configVersion + ' is older than extension v' + extVersion +
        '. Running migration...');
    config = await migrateConfig(config, configVersion, extVersion);
  }

  return config;
}
```

### Migration Example

```javascript
async function migrateConfig(config, fromVersion, toVersion) {
  // v1.x → v2.x: scriptInjection rules format changed
  if (fromVersion.startsWith('1.') && toVersion.startsWith('2.')) {
    // Transform old format to new format
    if (config.scriptInjection?.rules) {
      config.scriptInjection.rules = config.scriptInjection.rules.map(rule => ({
        ...rule,
        // v2 adds 'priority' field
        priority: rule.priority || 100
      }));
    }
    config.version = '2.0.0';
  }
  await chrome.storage.local.set({ config });
  return config;
}
```

---

## Update Detection

When the extension updates (via CWS auto-update or manual reload):

```javascript
// background.js
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'update') {
    const prev = details.previousVersion;
    const curr = chrome.runtime.getManifest().version;
    log('INFO', 'background', 'LIFECYCLE', 'extension_updated',
        'Updated from v' + prev + ' to v' + curr);

    // Run any necessary migrations
    checkConfigCompatibility(await loadConfig());

    // Notify content scripts to reload
    chrome.tabs.query({ url: 'https://lovable.dev/*' }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'EXTENSION_UPDATED',
          from: prev,
          to: curr
        });
      });
    });
  }

  if (details.reason === 'install') {
    log('INFO', 'background', 'LIFECYCLE', 'extension_installed',
        'Marco Extension v' + chrome.runtime.getManifest().version + ' installed');
  }
});
```

Content scripts receiving `EXTENSION_UPDATED` should log the event and optionally show a notification in the panel UI.
