# Seedable Config Architecture + Changelog Versioning

> **Version:** 2.0.0  
> **Created:** 2026-02-01  
> **Updated:** 2026-02-01  
> **Status:** Active  
> **Purpose:** Reusable pattern for version-controlled configuration with automatic changelog updates and initial seeding

---

## Summary

The **Seedable Config Architecture + Changelog Versioning** defines a pattern for managing application configuration where:

1. **First-run seeding** populates SQLite DB from `config.seed.json`
2. **Every config change updates the version**
3. **Every version change logs to changelog.md**
4. **Subsequent runs respect version** to avoid duplicate seeds

This ensures configuration is always traceable, auditable, and version-aware.

---

## Core Concepts

### 1. Configuration Files

| File | Purpose |
|------|---------|
| `config.seed.json` | Default seed values for first-time setup |
| `config.schema.json` | JSON Schema for validation |
| `config.json` | Runtime configuration (gitignored) |
| `changelog.md` | Version history of config changes |

### 2. Version Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CW CONFIG VERSION FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  config.seed.json                                                        │
│  ┌─────────────────────────────────────────┐                             │
│  │ {                                       │                             │
│  │   "version": "1.2.0",                   │ ← Source of truth           │
│  │   "categories": { ... }                 │                             │
│  │ }                                       │                             │
│  └──────────────────┬──────────────────────┘                             │
│                     │                                                    │
│                     ▼                                                    │
│  ┌─────────────────────────────────────────┐                             │
│  │        Version Change Detected?          │                             │
│  └──────────────────┬──────────────────────┘                             │
│                     │                                                    │
│         ┌───────────┴───────────┐                                        │
│         │                       │                                        │
│         ▼                       ▼                                        │
│   ┌───────────┐          ┌───────────────┐                               │
│   │    NO     │          │     YES       │                               │
│   │ Skip Seed │          │ Merge + Seed  │                               │
│   └───────────┘          └───────┬───────┘                               │
│                                  │                                        │
│                                  ▼                                        │
│                          ┌───────────────┐                               │
│                          │ Update        │                               │
│                          │ changelog.md  │                               │
│                          └───────────────┘                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## File Specifications

### config.seed.json

The seed file contains default values and metadata:

```json
{
  "$schema": "./config.schema.json",
  "version": "1.2.0",
  "changelog": "Added new cache settings for improved performance",
  "categories": {
    "general": {
      "displayName": "General",
      "description": "General application settings",
      "settings": {
        "theme": {
          "type": "select",
          "label": "Theme",
          "description": "Application color theme",
          "default": "system",
          "options": ["light", "dark", "system", "high-contrast"]
        },
        "language": {
          "type": "select",
          "label": "Language",
          "default": "en",
          "options": ["en", "es", "fr", "de", "zh", "ja"]
        },
        "autoSave": {
          "type": "boolean",
          "label": "Auto Save",
          "description": "Automatically save changes",
          "default": true
        }
      }
    },
    "cache": {
      "displayName": "Cache",
      "description": "Caching configuration",
      "version": "1.2.0",
      "addedIn": "1.2.0",
      "settings": {
        "enabled": {
          "type": "boolean",
          "label": "Enable Cache",
          "default": true
        },
        "maxSizeMB": {
          "type": "number",
          "label": "Max Cache Size (MB)",
          "default": 100,
          "min": 10,
          "max": 1000
        },
        "ttlHours": {
          "type": "number",
          "label": "Cache TTL (hours)",
          "default": 24,
          "min": 1,
          "max": 168
        }
      }
    }
  }
}
```

### config.schema.json

JSON Schema for validation:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Application Configuration",
  "type": "object",
  "required": ["version", "categories"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$",
      "description": "Semantic version of configuration"
    },
    "changelog": {
      "type": "string",
      "description": "Description of changes in this version"
    },
    "categories": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/category"
      }
    }
  },
  "definitions": {
    "category": {
      "type": "object",
      "required": ["displayName", "settings"],
      "properties": {
        "displayName": { "type": "string" },
        "description": { "type": "string" },
        "version": { "type": "string" },
        "addedIn": { "type": "string" },
        "settings": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/definitions/setting"
          }
        }
      }
    },
    "setting": {
      "type": "object",
      "required": ["type", "label", "default"],
      "properties": {
        "type": {
          "type": "string",
          "enum": ["string", "number", "boolean", "select", "array", "object"]
        },
        "label": { "type": "string" },
        "description": { "type": "string" },
        "default": {},
        "min": { "type": "number" },
        "max": { "type": "number" },
        "options": { "type": "array" },
        "addedIn": { "type": "string" },
        "deprecatedIn": { "type": "string" }
      }
    }
  }
}
```

### changelog.md Format

```markdown
# Changelog

All notable configuration changes are documented here.

## [1.2.0] - 2026-02-01

### Added
- Cache category with enabled, maxSizeMB, ttlHours settings

### Changed
- Theme options now include "high-contrast"

## [1.1.0] - 2026-01-15

### Added
- Network category with port and timeout settings

## [1.0.0] - 2026-01-01

### Initial Release
- General category with theme, language, autoSave
```

---

## Database Schema

### Table: config_meta

```sql
CREATE TABLE config_meta (
    id TEXT PRIMARY KEY DEFAULT 'singleton',
    seed_version TEXT NOT NULL,
    current_version TEXT NOT NULL,
    last_seeded_at DATETIME,
    changelog_updated_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Table: settings

```sql
CREATE TABLE settings (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,           -- JSON encoded
    type TEXT NOT NULL,
    added_in_version TEXT,         -- Version when setting was added
    modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(category, key)
);

CREATE INDEX idx_settings_category ON settings(category);
```

### Table: settings_history

```sql
CREATE TABLE settings_history (
    id TEXT PRIMARY KEY,
    setting_id TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT NOT NULL,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    changed_by TEXT,               -- user, system, seed
    version TEXT,                  -- Version at time of change
    FOREIGN KEY (setting_id) REFERENCES settings(id)
);

CREATE INDEX idx_history_setting ON settings_history(setting_id);
CREATE INDEX idx_history_changed ON settings_history(changed_at);
```

---

## Go Implementation

### ConfigService

```go
package config

import (
    "encoding/json"
    "fmt"
    "os"
    "time"
    
    "github.com/Masterminds/semver/v3"
    "gorm.io/gorm"
)

type ConfigService struct {
    db           *gorm.DB
    seedPath     string
    changelogPath string
}

// configMetaUpdate is a typed struct for GORM Updates() calls on config_meta
type configMetaUpdate struct {
    SeedVersion    string    `gorm:"column:seed_version"`
    CurrentVersion string    `gorm:"column:current_version"`
    LastSeededAt   time.Time `gorm:"column:last_seeded_at"`
    UpdatedAt      time.Time `gorm:"column:updated_at"`
}

type SeedConfig struct {
    Version    string                       `json:"version"`
    Changelog  string                       `json:"changelog"`
    Categories map[string]CategoryConfig    `json:"categories"`
}

type CategoryConfig struct {
    DisplayName string                    `json:"displayName"`
    Description string                    `json:"description"`
    Version     string                    `json:"version,omitempty"`
    AddedIn     string                    `json:"addedIn,omitempty"`
    Settings    map[string]SettingConfig  `json:"settings"`
}

type SettingConfig struct {
    Type        string      `json:"type"`
    Label       string      `json:"label"`
    Description string      `json:"description,omitempty"`
    Default     any         `json:"default"`
    Min         *float64    `json:"min,omitempty"`
    Max         *float64    `json:"max,omitempty"`
    Options     []string    `json:"options,omitempty"`
    AddedIn     string      `json:"addedIn,omitempty"`
}

// SeedWithVersionCheck seeds config if version changed
func (s *ConfigService) SeedWithVersionCheck() error {
    seed, err := s.loadSeedFile()
    if err != nil {
        return fmt.Errorf("failed to load seed: %w", err)
    }
    
    meta, err := s.getMeta()
    if err != nil {
        return s.fullSeed(seed)
    }
    
    return s.seedIfVersionChanged(seed, meta)
}

func (s *ConfigService) seedIfVersionChanged(seed SeedConfig, meta *ConfigMeta) error {
    currentVer, _ := semver.NewVersion(meta.SeedVersion)
    seedVer, _ := semver.NewVersion(seed.Version)
    
    if !seedVer.GreaterThan(currentVer) {
        return nil
    }
    
    if err := s.mergeSeed(seed, meta.SeedVersion); err != nil {
        return err
    }
    
    return s.updateChangelog(seed)
}

// mergeSeed adds new settings without overwriting existing
func (s *ConfigService) mergeSeed(seed SeedConfig, previousVersion string) error {
    for catKey, cat := range seed.Categories {
        s.seedCategory(catKey, cat, seed.Version)
    }

    return s.updateMetaVersion(seed.Version)
}

func (s *ConfigService) seedCategory(
	catKey string,
	cat CategoryConfig,
	version string,
) {
    for settingKey, setting := range cat.Settings {
        s.seedSettingIfNew(catKey, settingKey, setting, version)
    }
}

func (s *ConfigService) seedSettingIfNew(
	catKey string,
	settingKey string,
	setting SettingConfig,
	version string,
) {
    var existing Setting
    err := s.db.Where("category = ? AND key = ?", catKey, settingKey).First(&existing).Error

    if err != gorm.ErrRecordNotFound {
        return
    }

    s.createNewSetting(catKey, settingKey, setting, version)
}

func (s *ConfigService) createNewSetting(
	catKey string,
	settingKey string,
	setting SettingConfig,
	version string,
) {
    valueJSON, _ := json.Marshal(setting.Default)
    newSetting := Setting{
        ID:             generateID(),
        Category:       catKey,
        Key:            settingKey,
        Value:          string(valueJSON),
        Type:           setting.Type,
        AddedInVersion: version,
    }

    s.db.Create(&newSetting)
}

func (s *ConfigService) updateMetaVersion(version string) error {
    return s.db.Model(&ConfigMeta{}).Where("id = 'singleton'").Updates(configMetaUpdate{
        SeedVersion:    version,
        CurrentVersion: version,
        LastSeededAt:   time.Now(),
        UpdatedAt:      time.Now(),
    }).Error
}

// updateChangelog appends version entry to changelog.md
func (s *ConfigService) updateChangelog(seed SeedConfig) error {
    isChangelogEmpty := seed.Changelog == ""

    if isChangelogEmpty {
        return nil
    }

    entry := formatChangelogEntry(seed.Version, seed.Changelog)
    content := s.readOrCreateChangelog()

    return s.writeChangelogWithEntry(content, entry)
}

func formatChangelogEntry(version, changelog string) string {
    return fmt.Sprintf("\n## [%s] - %s\n\n%s\n",
        version,
        time.Now().Format("2006-01-02"),
        changelog,
    )
}

func (s *ConfigService) readOrCreateChangelog() []byte {
    header := "# Changelog\n\nAll notable configuration changes are documented here.\n"

    content, err := os.ReadFile(s.changelogPath)
    isReadFailed := err != nil
    isContentEmpty := len(content) == 0
    isChangelogUnavailable := isReadFailed || isContentEmpty

    if isChangelogUnavailable {
        return []byte(header)
    }

    return content
}

func (s *ConfigService) writeChangelogWithEntry(content []byte, entry string) error {
    header := "# Changelog\n\nAll notable configuration changes are documented here.\n"
    insertPos := len(header)
    newContent := string(content[:insertPos]) + entry + string(content[insertPos:])

    return os.WriteFile(s.changelogPath, []byte(newContent), 0644)
}
```

---

## Version Bumping Rules

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| New category added | Minor | 1.0.0 → 1.1.0 |
| New setting added | Minor | 1.1.0 → 1.2.0 |
| Default value changed | Patch | 1.2.0 → 1.2.1 |
| Setting deprecated | Patch | 1.2.1 → 1.2.2 |
| Breaking change (setting removed) | Major | 1.2.2 → 2.0.0 |

---

## UI Integration

### Version Badge Component

```typescript
// components/VersionBadge.tsx
import { Badge } from '@/components/ui/badge';
import { useConfig } from '@/hooks/useConfig';

export function VersionBadge() {
  const { meta } = useConfig();
  
  const isNew = meta.seedVersion !== meta.currentVersion;
  
  return (
    <Badge variant={isNew ? "default" : "secondary"}>
      v{meta.currentVersion}
      {isNew && " (updated)"}
    </Badge>
  );
}
```

### New Settings Highlight

```typescript
// Highlight settings added in current version
function SettingItem({ setting, currentVersion }: Props) {
  const isNew = setting.addedInVersion === currentVersion;
  
  return (
    <div className={cn("setting-item", isNew && "ring-2 ring-primary")}>
      {isNew && <Badge variant="outline">New in v{currentVersion}</Badge>}
      {/* ... setting content */}
    </div>
  );
}
```

---

## Theme Support

### Comprehensive Theme System

The Seedable Config pattern supports a rich theme system with multiple customization options:

```json
{
  "categories": {
    "appearance": {
      "displayName": "Appearance",
      "description": "Visual customization options",
      "settings": {
        "theme": {
          "type": "select",
          "label": "Theme",
          "description": "Base color scheme",
          "default": "system",
          "options": [
            "light",
            "dark",
            "system",
            "high-contrast",
            "high-contrast-dark",
            "colorful-light",
            "colorful-dark",
            "ocean-blue",
            "ocean-dark",
            "forest-green",
            "forest-dark",
            "sunset-orange",
            "sunset-dark",
            "midnight-purple",
            "rose-pink",
            "slate-gray",
            "nord-light",
            "nord-dark",
            "solarized-light",
            "solarized-dark",
            "dracula",
            "monokai",
            "github-light",
            "github-dark"
          ]
        },
        "accentColor": {
          "type": "select",
          "label": "Accent Color",
          "description": "Primary action color",
          "default": "blue",
          "options": [
            "blue",
            "indigo",
            "violet",
            "purple",
            "fuchsia",
            "pink",
            "rose",
            "red",
            "orange",
            "amber",
            "yellow",
            "lime",
            "green",
            "emerald",
            "teal",
            "cyan",
            "sky"
          ]
        },
        "fontSize": {
          "type": "select",
          "label": "Font Size",
          "description": "Base text size",
          "default": "medium",
          "options": ["x-small", "small", "medium", "large", "x-large"]
        },
        "fontFamily": {
          "type": "select",
          "label": "Font Family",
          "description": "Text font style",
          "default": "system",
          "options": [
            "system",
            "inter",
            "roboto",
            "open-sans",
            "lato",
            "poppins",
            "source-sans",
            "jetbrains-mono",
            "fira-code"
          ]
        },
        "borderRadius": {
          "type": "select",
          "label": "Border Radius",
          "description": "Corner rounding style",
          "default": "medium",
          "options": ["none", "small", "medium", "large", "full"]
        },
        "animationSpeed": {
          "type": "select",
          "label": "Animation Speed",
          "description": "UI transition speed",
          "default": "normal",
          "options": ["none", "reduced", "normal", "fast"]
        },
        "compactMode": {
          "type": "boolean",
          "label": "Compact Mode",
          "description": "Reduce padding and spacing",
          "default": false
        },
        "showIcons": {
          "type": "boolean",
          "label": "Show Icons",
          "description": "Display icons in navigation",
          "default": true
        }
      }
    }
  }
}
```

### Theme CSS Variables

Each theme maps to CSS custom properties:

```css
/* Example: ocean-blue theme */
[data-theme="ocean-blue"] {
  --background: 200 30% 98%;
  --foreground: 200 50% 10%;
  --primary: 200 80% 50%;
  --primary-foreground: 200 10% 98%;
  --secondary: 180 40% 90%;
  --muted: 200 20% 95%;
  --accent: 180 60% 45%;
  --destructive: 0 70% 50%;
  --border: 200 20% 85%;
  --ring: 200 80% 50%;
  --radius: 0.5rem;
}

/* Example: dracula theme */
[data-theme="dracula"] {
  --background: 231 15% 18%;
  --foreground: 60 30% 96%;
  --primary: 265 89% 78%;
  --primary-foreground: 231 15% 18%;
  --secondary: 225 27% 26%;
  --muted: 232 14% 31%;
  --accent: 135 94% 65%;
  --destructive: 0 100% 67%;
  --border: 232 14% 31%;
  --ring: 265 89% 78%;
}
```

### React Theme Provider

```typescript
// hooks/useTheme.ts
import { useSettings } from './useSettings';

export function useTheme() {
  const { settings, updateSetting } = useSettings();
  
  const theme = settings?.appearance?.theme ?? 'system';
  const accentColor = settings?.appearance?.accentColor ?? 'blue';
  
  const setTheme = (newTheme: string) => {
    updateSetting('appearance', 'theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };
  
  const setAccentColor = (color: string) => {
    updateSetting('appearance', 'accentColor', color);
    document.documentElement.setAttribute('data-accent', color);
  };
  
  return { theme, accentColor, setTheme, setAccentColor };
}
```

---

## Integration with WP Plugin Publish

For this project, the seedable config pattern applies to:

| Config Area | Seed File Location |
|-------------|-------------------|
| Backend settings | `backend/config.seed.json` |
| Watcher settings | Included in backend seed |
| Backup settings | Included in backend seed |
| WordPress settings | Included in backend seed |

### Migration from config.json

The existing `backend/config.json` will be renamed to `config.seed.json` and enhanced with:
- Version field
- Changelog field  
- Category structure for UI rendering

---

## Cross-References

| Reference | Location |
|-----------|----------|
| Config System | [03-config-system.md](./03-config-system.md) |
| Database Schema | [02-database-schema.md](./02-database-schema.md) |
| Settings Page UI | [../02-frontend/25-settings-page.md](../02-frontend/25-settings-page.md) |

---

*This pattern ensures all configuration changes are versioned and documented.*
