# 03 — Config System

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The configuration system uses a **JSON seed file** for initial setup and version-controlled defaults, while **SQLite** serves as the runtime data store.

### Key Principles

1. **JSON is for seeding only** — Not read at runtime after initial seed
2. **SQLite is the source of truth** — All runtime reads come from the database
3. **Version-controlled seeding** — Changes to config.json trigger re-seeding of new data
4. **No duplicate entries** — Seeding skips existing records (matched by unique keys)

---

## Config File Structure

### config.json

```json
{
  "version": 3,
  "settings": {
    "port": 8080,
    "watchDebounceMs": 500,
    "backupRetentionDays": 30,
    "maxBackupsPerPlugin": 10,
    "tempDirectory": ".temp",
    "backupDirectory": "backups",
    "logLevel": "info"
  },
  "sites": [
    {
      "name": "Production Site",
      "url": "https://example.com",
      "username": "admin",
      "appPassword": ""
    }
  ],
  "plugins": [
    {
      "name": "My Plugin",
      "localPath": "/path/to/my-plugin",
      "remoteSlug": "my-plugin",
      "siteName": "Production Site"
    }
  ]
}
```

---

## Version-Based Seeding

### How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    Application Start                     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  Load config.json     │
                │  Read file version    │
                └───────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  Get DB seed_version  │
                │  from AppConfig       │
                └───────────────────────┘
                            │
                            ▼
              ┌─────────────────────────────┐
              │  file_version > db_version? │
              └─────────────────────────────┘
                     │              │
                    Yes             No
                     │              │
                     ▼              ▼
          ┌──────────────────┐   ┌──────────────┐
          │  Seed new data   │   │  Skip seed   │
          │  (skip existing) │   │              │
          └──────────────────┘   └──────────────┘
                     │              │
                     ▼              ▼
          ┌──────────────────┐   ┌──────────────┐
          │  Update db       │   │  Continue    │
          │  seed_version    │   │  startup     │
          └──────────────────┘   └──────────────┘
```

### Implementation

```go
// internal/config/seed.go
package config

import (
    "database/sql"
    "encoding/json"
    "os"
    
    "wp-plugin-publish/internal/models"
    "wp-plugin-publish/pkg/apperror"
)

type SeedConfig struct {
    Version  int            `json:"version"`
    Settings Settings       `json:"settings"`
    Sites    []SiteSeed     `json:"sites"`
    Plugins  []PluginSeed   `json:"plugins"`
}

type Settings struct {
    Port                int    `json:"port"`
    WatchDebounceMs     int    `json:"watchDebounceMs"`
    BackupRetentionDays int    `json:"backupRetentionDays"`
    MaxBackupsPerPlugin int    `json:"maxBackupsPerPlugin"`
    TempDirectory       string `json:"tempDirectory"`
    BackupDirectory     string `json:"backupDirectory"`
    LogLevel            string `json:"logLevel"`
}

type SiteSeed struct {
    Name        string `json:"name"`
    URL         string `json:"url"`
    Username    string `json:"username"`
    AppPassword string `json:"appPassword"`
}

type PluginSeed struct {
    Name       string `json:"name"`
    LocalPath  string `json:"localPath"`
    RemoteSlug string `json:"remoteSlug"`
    SiteName   string `json:"siteName"`  // References site by name
}

func SeedIfNeeded(db *sql.DB, configPath string) error {
    cfg, err := loadSeedConfig(configPath)
    isSeedUnavailable := cfg == nil || err != nil

    if isSeedUnavailable {
        return err
    }

    dbVersion := currentSeedVersion(db)
    if cfg.Version <= dbVersion {
        return nil
    }

    return applySeed(db, cfg)
}

func loadSeedConfig(configPath string) (*SeedConfig, error) {
    data, err := os.ReadFile(configPath)
    if os.IsNotExist(err) {
        return nil, nil
    }
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrConfigLoad, "failed to read config file")
    }

    var cfg SeedConfig
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, apperror.Wrap(err, apperror.ErrConfigParse, "failed to parse config file")
    }

    return &cfg, nil
}

func currentSeedVersion(db *sql.DB) int {
    var dbVersion int
    err := db.QueryRow("SELECT Value FROM AppConfig WHERE Key = 'seed_version'").Scan(&dbVersion)
    if err != nil {
        return 0
    }

    return dbVersion
}

func applySeed(db *sql.DB, cfg *SeedConfig) error {
    if err := seedSettings(db, cfg.Settings); err != nil {
        return err
    }

    siteMap, err := seedAllSites(db, cfg.Sites)
    if err != nil {
        return err
    }

    if err := seedAllPlugins(db, cfg.Plugins, siteMap); err != nil {
        return err
    }

    return updateSeedVersion(db, cfg.Version)
}

func seedAllSites(db *sql.DB, sites []SiteSeed) (map[string]int64, error) {
    siteMap := make(map[string]int64)

    for _, site := range sites {
        id, err := seedSite(db, site)
        if err != nil {
            return nil, err
        }
        siteMap[site.Name] = id
    }

    return siteMap, nil
}

func seedAllPlugins(
    db *sql.DB,
    plugins []PluginSeed,
    siteMap map[string]int64,
) error {
    for _, plugin := range plugins {
        siteID, ok := siteMap[plugin.SiteName]
        if !ok {
            continue
        }
        if err := seedPlugin(db, plugin, siteID); err != nil {
            return err
        }
    }

    return nil
}

func updateSeedVersion(db *sql.DB, version int) error {
    _, err := db.Exec(
        "INSERT OR REPLACE INTO AppConfig (Key, Value, UpdatedAt) VALUES ('seed_version', ?, datetime('now'))",
        version,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update seed version")
    }

    return nil
}

func seedSite(db *sql.DB, site SiteSeed) (int64, error) {
    existingID, err := findExistingSite(db, site.URL)
    hasSiteRecord := existingID > 0

    if hasSiteRecord {
        return existingID, nil
    }
    if err != nil {
        return 0, err
    }

    return insertSite(db, site)
}

func findExistingSite(db *sql.DB, url string) (int64, error) {
    var id int64
    err := db.QueryRow("SELECT Id FROM Sites WHERE Url = ?", url).Scan(&id)
    isSiteFound := err == nil

    if isSiteFound {
        return id, nil
    }
    if err != sql.ErrNoRows {
        return 0, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to check site existence")
    }

    return 0, nil
}

func insertSite(db *sql.DB, site SiteSeed) (int64, error) {
    result, err := db.Exec(
        `INSERT INTO Sites (Name, Url, Username, AppPassword, IsActive) 
         VALUES (?, ?, ?, ?, 1)`,
        site.Name, site.URL, site.Username, site.AppPassword,
    )
    if err != nil {
        return 0, apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to insert site")
    }

    return result.LastInsertId()
}

func seedPlugin(
	db *sql.DB,
	plugin PluginSeed,
	siteID int64,
) error {
    exists := pluginExists(db, plugin.LocalPath, siteID)
    if exists {
        return nil
    }

    return insertPlugin(db, plugin, siteID)
}

func pluginExists(
    db *sql.DB,
    localPath string,
    siteID int64,
) bool {
    var dummy bool
    err := db.QueryRow(
        "SELECT 1 FROM Plugins WHERE LocalPath = ? AND SiteId = ?",
        localPath, siteID,
    ).Scan(&dummy)
    isPluginExists := err == nil

    return isPluginExists
}

func insertPlugin(
    db *sql.DB,
    plugin PluginSeed,
    siteID int64,
) error {
    _, err := db.Exec(
        `INSERT INTO Plugins (Name, LocalPath, RemoteSlug, SiteId, IsActive) 
         VALUES (?, ?, ?, ?, 1)`,
        plugin.Name, plugin.LocalPath, plugin.RemoteSlug, siteID,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to insert plugin")
    }

    return nil
}
```

---

## Settings Management

Settings are stored in AppConfig table as key-value pairs:

```go
// internal/config/settings.go
func seedSettings(db *sql.DB, settings Settings) error {
    pairs := buildSettingPairs(settings)

    for _, p := range pairs {
        if err := insertSettingIfNew(db, p.key, p.value); err != nil {
            return err
        }
    }

    return nil
}

func buildSettingPairs(settings Settings) []struct{ key, value string } {
    return []struct{ key, value string }{
        {"port", fmt.Sprintf("%d", settings.Port)},
        {"watch_debounce_ms", fmt.Sprintf("%d", settings.WatchDebounceMs)},
        {"backup_retention_days", fmt.Sprintf("%d", settings.BackupRetentionDays)},
        {"max_backups_per_plugin", fmt.Sprintf("%d", settings.MaxBackupsPerPlugin)},
        {"temp_directory", settings.TempDirectory},
        {"backup_directory", settings.BackupDirectory},
        {"log_level", settings.LogLevel},
    }
}

func insertSettingIfNew(
    db *sql.DB,
    key string,
    value string,
) error {
    _, err := db.Exec(
        `INSERT OR IGNORE INTO AppConfig (Key, Value, UpdatedAt) 
         VALUES (?, ?, datetime('now'))`,
        key, value,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to seed setting: "+key)
    }

    return nil
}

func GetSetting(db *sql.DB, key string) (string, error) {
    var value string
    err := db.QueryRow("SELECT Value FROM AppConfig WHERE Key = ?", key).Scan(&value)
    if err != nil {
        return "", apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to get setting: "+key)
    }
    return value, nil
}

func SetSetting(
	db *sql.DB,
	key string,
	value string,
) error {
    _, err := db.Exec(
        `INSERT OR REPLACE INTO AppConfig (Key, Value, UpdatedAt) 
         VALUES (?, ?, datetime('now'))`,
        key, value,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to set setting: "+key)
    }
    return nil
}
```

---

## Workflow Example

### First Run (Fresh Install)

1. User copies `config.json.example` to `config.json`
2. User edits with their sites and plugin paths
3. User sets `version: 1`
4. Application starts, reads `version: 1`
5. DB has `seed_version: 0`
6. All sites and plugins are seeded
7. DB updated to `seed_version: 1`

### Adding a New Site via Config

1. User adds new site to `config.json`
2. User increments to `version: 2`
3. Application restarts
4. DB has `seed_version: 1`
5. New site is seeded (existing sites skipped)
6. DB updated to `seed_version: 2`

### User Edits via UI

1. User changes site password via React UI
2. Change saved directly to SQLite
3. `config.json` not touched
4. Re-seeding won't overwrite (unique constraint)

---

## Next Document

See [04-site-service.md](./04-site-service.md) for site management implementation.
