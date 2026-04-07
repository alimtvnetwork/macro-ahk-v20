# 04 — Site Service

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The Site Service manages WordPress site connections, including CRUD operations, credential encryption, and connection testing.

---

## Interface

```go
// internal/services/site/service.go
package site

import (
    "context"
    
    "wp-plugin-publish/internal/models"
)

type Service interface {
    // CRUD operations
    List(ctx context.Context) ([]models.Site, error)
    GetByID(ctx context.Context, id int64) (*models.Site, error)
    GetByURL(ctx context.Context, url string) (*models.Site, error)
    Create(ctx context.Context, input CreateInput) (*models.Site, error)
    Update(ctx context.Context, id int64, input UpdateInput) (*models.Site, error)
    Delete(ctx context.Context, id int64) error
    
    // Connection management
    TestConnection(ctx context.Context, id int64) (*ConnectionResult, error)
    TestCredentials(ctx context.Context, url, username, password string) (*ConnectionResult, error)
    
    // Status updates
    UpdateLastSync(ctx context.Context, id int64) error
    SetActive(ctx context.Context, id int64, active bool) error
}
```

---

## Data Types

### Site Model

```go
// internal/models/site.go
package models

import "time"

type Site struct {
    ID           int64      `json:"id"`
    Name         string     `json:"name"`
    URL          string     `json:"url"`
    Username     string     `json:"username"`
    AppPassword  string     `json:"-"`  // Never exposed in JSON
    IsActive     bool       `json:"isActive"`
    LastSyncAt   *time.Time `json:"lastSyncAt,omitempty"`
    CreatedAt    time.Time  `json:"createdAt"`
    UpdatedAt    time.Time  `json:"updatedAt"`
}

// SiteWithStatus includes connection status for UI display
type SiteWithStatus struct {
    Site
    IsConnected   bool   `json:"isConnected"`
    WPVersion     string `json:"wpVersion,omitempty"`
    PluginCount   int    `json:"pluginCount"`
    LastError     string `json:"lastError,omitempty"`
}
```

### Input Types

```go
// internal/services/site/types.go
package site

type CreateInput struct {
    Name        string `json:"name" validate:"required,max=255"`
    URL         string `json:"url" validate:"required,url,max=2048"`
    Username    string `json:"username" validate:"required,max=255"`
    AppPassword string `json:"appPassword" validate:"required"`
}

type UpdateInput struct {
    Name        *string `json:"name,omitempty" validate:"omitempty,max=255"`
    URL         *string `json:"url,omitempty" validate:"omitempty,url,max=2048"`
    Username    *string `json:"username,omitempty" validate:"omitempty,max=255"`
    AppPassword *string `json:"appPassword,omitempty"`
    IsActive    *bool   `json:"isActive,omitempty"`
}

type ConnectionResult struct {
    Success     bool   `json:"success"`
    WPVersion   string `json:"wpVersion,omitempty"`
    SiteName    string `json:"siteName,omitempty"`
    PluginCount int    `json:"pluginCount,omitempty"`
    Error       string `json:"error,omitempty"`
    ErrorCode   string `json:"errorCode,omitempty"`
}
```

---

## Implementation

### Service Constructor

```go
// internal/services/site/service.go
package site

import (
    "database/sql"
    
    "wp-plugin-publish/internal/logger"
    "wp-plugin-publish/internal/wordpress"
)

type serviceImpl struct {
    db        *sql.DB
    wpClient  *wordpress.Client
    log       *logger.Logger
    encKey    []byte  // AES-256 encryption key
}

func New(
	db *sql.DB,
	wpClient *wordpress.Client,
	log *logger.Logger,
	encKey []byte,
) Service {
    return &serviceImpl{
        db:       db,
        wpClient: wpClient,
        log:      log,
        encKey:   encKey,
    }
}
```

### CRUD Operations

```go
// internal/services/site/crud.go
package site

import (
    "context"
    "database/sql"
    "strings"
    "time"
    
    "wp-plugin-publish/internal/models"
    "wp-plugin-publish/pkg/apperror"
)

// --- SQL constants ---

const siteListQuery = `
    SELECT Id, Name, Url, Username, AppPassword, IsActive, LastSyncAt, CreatedAt, UpdatedAt
    FROM Sites
    ORDER BY Name ASC
`

const siteGetByIDQuery = `
    SELECT Id, Name, Url, Username, AppPassword, IsActive, LastSyncAt, CreatedAt, UpdatedAt
    FROM Sites WHERE Id = ?
`

const siteGetByURLQuery = `
    SELECT Id, Name, Url, Username, AppPassword, IsActive, LastSyncAt, CreatedAt, UpdatedAt
    FROM Sites WHERE Url = ?
`

const siteInsertQuery = `
    INSERT INTO Sites (Name, Url, Username, AppPassword, IsActive, CreatedAt, UpdatedAt)
    VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
`

// --- List ---

func (s *serviceImpl) List(ctx context.Context) ([]models.Site, error) {
    s.log.Debug("Listing all sites")
    
    rows, err := s.db.QueryContext(ctx, siteListQuery)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to list sites")
    }
    defer rows.Close()
    
    return s.scanSiteRows(rows)
}

func (s *serviceImpl) scanSiteRows(rows *sql.Rows) ([]models.Site, error) {
    var sites []models.Site
    for rows.Next() {
        site, err := s.scanSingleSite(rows)
        if err != nil {
            return nil, err
        }

        sites = append(sites, site)
    }
    
    s.log.Info("Listed sites", "count", len(sites))

    return sites, nil
}

func (s *serviceImpl) scanSingleSite(rows *sql.Rows) (models.Site, error) {
    var site models.Site
    encryptedPassword, lastSyncAt, err := s.scanSiteColumns(rows, &site)
    if err != nil {
        return site, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to scan site row")
    }

    site.AppPassword, _ = DecryptPassword(encryptedPassword, s.encKey)
    s.parseSiteLastSync(&site, lastSyncAt)

    return site, nil
}

func (s *serviceImpl) scanSiteColumns(rows *sql.Rows, site *models.Site) (string, sql.NullString, error) {
    var encryptedPassword string
    var lastSyncAt sql.NullString

    err := rows.Scan(
        &site.ID, &site.Name, &site.URL, &site.Username,
        &encryptedPassword, &site.IsActive, &lastSyncAt,
        &site.CreatedAt, &site.UpdatedAt,
    )

    return encryptedPassword, lastSyncAt, err
}

func (s *serviceImpl) parseSiteLastSync(site *models.Site, lastSyncAt sql.NullString) {
    if lastSyncAt.Valid {
        t, _ := time.Parse(time.RFC3339, lastSyncAt.String)
        site.LastSyncAt = &t
    }
}

// --- GetByID ---

func (s *serviceImpl) GetByID(ctx context.Context, id int64) (*models.Site, error) {
    s.log.Debug("Getting site by ID", "site_id", id)

    return s.querySiteByID(ctx, id)
}

func (s *serviceImpl) querySiteByID(ctx context.Context, id int64) (*models.Site, error) {
    site, encPwd, lastSync, err := s.scanSiteByID(ctx, id)
    if err == sql.ErrNoRows {
        return nil, apperror.New(apperror.ErrNotFound, "site not found").WithContext("site_id", id)
    }
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseQuery, "failed to get site")
    }

    site.AppPassword, _ = DecryptPassword(encPwd, s.encKey)
    s.parseSiteLastSync(&site, lastSync)

    return &site, nil
}

func (s *serviceImpl) scanSiteByID(ctx context.Context, id int64) (models.Site, string, sql.NullString, error) {
    var site models.Site
    var encryptedPassword string
    var lastSyncAt sql.NullString

    err := s.db.QueryRowContext(ctx, siteGetByIDQuery, id).Scan(
        &site.ID, &site.Name, &site.URL, &site.Username,
        &encryptedPassword, &site.IsActive, &lastSyncAt,
        &site.CreatedAt, &site.UpdatedAt,
    )

    return site, encryptedPassword, lastSyncAt, err
}

// --- GetByURL ---

func (s *serviceImpl) GetByURL(ctx context.Context, url string) (*models.Site, error) {
    site, encPwd, lastSync, err := s.scanSiteByURL(ctx, url)
    if err != nil {
        return nil, err
    }

    site.AppPassword, _ = DecryptPassword(encPwd, s.encKey)
    s.parseSiteLastSync(&site, lastSync)

    return &site, nil
}

func (s *serviceImpl) scanSiteByURL(ctx context.Context, url string) (models.Site, string, sql.NullString, error) {
    var site models.Site
    var encryptedPassword string
    var lastSyncAt sql.NullString

    err := s.db.QueryRowContext(ctx, siteGetByURLQuery, url).Scan(
        &site.ID, &site.Name, &site.URL, &site.Username,
        &encryptedPassword, &site.IsActive, &lastSyncAt,
        &site.CreatedAt, &site.UpdatedAt,
    )

    return site, encryptedPassword, lastSyncAt, err
}

// --- Create ---

func (s *serviceImpl) Create(ctx context.Context, input CreateInput) (*models.Site, error) {
    s.log.Info("Creating site", "name", input.Name, "url", input.URL)

    if err := s.validateCreateInput(input); err != nil {
        return nil, err
    }

    url := strings.TrimSuffix(input.URL, "/")

    if err := s.checkDuplicateURL(ctx, url); err != nil {
        return nil, err
    }

    id, err := s.insertSite(ctx, input, url)
    if err != nil {
        return nil, err
    }

    s.log.Info("Site created", "site_id", id, "name", input.Name)

    return s.GetByID(ctx, id)
}

func (s *serviceImpl) checkDuplicateURL(ctx context.Context, url string) error {
    existing, _ := s.GetByURL(ctx, url)
    if existing != nil {
        return apperror.New(apperror.ErrDuplicate, "site with this URL already exists").
            WithContext("url", url)
    }

    return nil
}

func (s *serviceImpl) insertSite(
    ctx context.Context,
    input CreateInput,
    url string,
) (int64, error) {
    encryptedPassword, err := EncryptPassword(input.AppPassword, s.encKey)
    if err != nil {
        return 0, apperror.Wrap(err, apperror.ErrInternal, "failed to encrypt password")
    }

    return s.executeSiteInsert(ctx, input, url, encryptedPassword)
}

func (s *serviceImpl) executeSiteInsert(
    ctx context.Context,
    input CreateInput,
    url, encryptedPassword string,
) (int64, error) {
    result, err := s.db.ExecContext(ctx, siteInsertQuery, input.Name, url, input.Username, encryptedPassword)
    if err != nil {
        return 0, apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to create site")
    }

    id, _ := result.LastInsertId()

    return id, nil
}

// --- Update ---

func (s *serviceImpl) Update(
	ctx context.Context,
	id int64,
	input UpdateInput,
) (*models.Site, error) {
    s.log.Info("Updating site", "site_id", id)
    
    existing, err := s.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    
    updates, args, err := s.buildSiteUpdateFields(input)
    if err != nil {
        return nil, err
    }
    
    if len(updates) == 0 {
        return existing, nil
    }
    
    return s.executeSiteUpdate(ctx, id, updates, args)
}

func (s *serviceImpl) buildSiteUpdateFields(input UpdateInput) ([]string, []any, error) {
    var updates []string
    var args []any

    s.appendSiteNameUpdate(input, &updates, &args)
    s.appendSiteURLUpdate(input, &updates, &args)
    s.appendSiteUsernameUpdate(input, &updates, &args)

    if err := s.appendSitePasswordUpdate(input, &updates, &args); err != nil {
        return nil, nil, err
    }

    s.appendSiteActiveUpdate(input, &updates, &args)

    return updates, args, nil
}

func (s *serviceImpl) appendSiteNameUpdate(
    input UpdateInput,
    updates *[]string,
    args *[]any,
) {
    if input.Name == nil {
        return
    }

    *updates = append(*updates, "Name = ?")
    *args = append(*args, *input.Name)
}

func (s *serviceImpl) appendSiteURLUpdate(
    input UpdateInput,
    updates *[]string,
    args *[]any,
) {
    if input.URL == nil {
        return
    }

    url := strings.TrimSuffix(*input.URL, "/")
    *updates = append(*updates, "Url = ?")
    *args = append(*args, url)
}

func (s *serviceImpl) appendSiteUsernameUpdate(
    input UpdateInput,
    updates *[]string,
    args *[]any,
) {
    if input.Username == nil {
        return
    }

    *updates = append(*updates, "Username = ?")
    *args = append(*args, *input.Username)
}

func (s *serviceImpl) appendSitePasswordUpdate(
    input UpdateInput,
    updates *[]string,
    args *[]any,
) error {
    if input.AppPassword == nil {
        return nil
    }

    encrypted, err := EncryptPassword(*input.AppPassword, s.encKey)
    if err != nil {
        return apperror.Wrap(err, apperror.ErrInternal, "failed to encrypt password")
    }

    *updates = append(*updates, "AppPassword = ?")
    *args = append(*args, encrypted)

    return nil
}

func (s *serviceImpl) appendSiteActiveUpdate(
    input UpdateInput,
    updates *[]string,
    args *[]any,
) {
    if input.IsActive == nil {
        return
    }

    active := 0
    if *input.IsActive {
        active = 1
    }

    *updates = append(*updates, "IsActive = ?")
    *args = append(*args, active)
}

func (s *serviceImpl) executeSiteUpdate(
    ctx context.Context,
    id int64,
    updates []string,
    args []any,
) (*models.Site, error) {
    updates = append(updates, "UpdatedAt = datetime('now')")
    args = append(args, id)
    
    query := "UPDATE Sites SET " + strings.Join(updates, ", ") + " WHERE Id = ?"

    _, err := s.db.ExecContext(ctx, query, args...)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update site")
    }
    
    s.log.Info("Site updated", "site_id", id)

    return s.GetByID(ctx, id)
}

// --- Delete ---

func (s *serviceImpl) Delete(ctx context.Context, id int64) error {
    s.log.Info("Deleting site", "site_id", id)
    
    if _, err := s.GetByID(ctx, id); err != nil {
        return err
    }
    
    _, err := s.db.ExecContext(ctx, "DELETE FROM Sites WHERE Id = ?", id)
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to delete site")
    }
    
    s.log.Info("Site deleted", "site_id", id)

    return nil
}
```

### Connection Testing

```go
// internal/services/site/connection.go
package site

import (
    "context"
    
    "wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) TestConnection(ctx context.Context, id int64) (*ConnectionResult, error) {
    s.log.Info("Testing connection", "site_id", id)
    
    site, err := s.GetByID(ctx, id)
    if err != nil {
        return nil, err
    }
    
    return s.TestCredentials(ctx, site.URL, site.Username, site.AppPassword)
}

func (s *serviceImpl) TestCredentials(
	ctx context.Context,
	url string,
	username string,
	password string,
) (*ConnectionResult, error) {
    s.log.Debug("Testing credentials", "url", url, "username", username)

    info, err := s.wpClient.GetSiteInfo(ctx, url, username, password)
    if err != nil {
        return s.buildFailedConnectionResult(err), nil
    }

    return s.buildSuccessConnectionResult(ctx, url, username, password, info), nil
}

func (s *serviceImpl) buildSuccessConnectionResult(
	ctx context.Context,
	url string,
	username string,
	password string,
	info *wordpress.SiteInfo,
) *ConnectionResult {
    pluginCount := s.countRemotePlugins(ctx, url, username, password)

    s.log.Info("Connection test successful", "url", url, "wp_version", info.Version, "site_name", info.Name)

    return &ConnectionResult{
        Success:     true,
        WPVersion:   info.Version,
        SiteName:    info.Name,
        PluginCount: pluginCount,
    }
}

func (s *serviceImpl) buildFailedConnectionResult(err error) *ConnectionResult {
    appErr, ok := err.(*apperror.AppError)
    if ok {
        return &ConnectionResult{
            Success:   false,
            Error:     appErr.Message,
            ErrorCode: appErr.Code,
        }
    }

    return &ConnectionResult{
        Success:   false,
        Error:     err.Error(),
        ErrorCode: apperror.ErrWPConnect,
    }
}

func (s *serviceImpl) countRemotePlugins(
    ctx context.Context,
    url string,
    username string,
    password string,
) int {
    plugins, err := s.wpClient.ListPlugins(ctx, url, username, password)
    if err != nil {
        return 0
    }

    return len(plugins)
}

func (s *serviceImpl) UpdateLastSync(ctx context.Context, id int64) error {
    _, err := s.db.ExecContext(ctx,
        "UPDATE Sites SET LastSyncAt = datetime('now'), UpdatedAt = datetime('now') WHERE Id = ?",
        id,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update last sync")
    }

    return nil
}

func (s *serviceImpl) SetActive(
	ctx context.Context,
	id int64,
	active bool,
) error {
    activeInt := 0
    if active {
        activeInt = 1
    }
    
    _, err := s.db.ExecContext(ctx,
        "UPDATE Sites SET IsActive = ?, UpdatedAt = datetime('now') WHERE Id = ?",
        activeInt, id,
    )
    if err != nil {
        return apperror.Wrap(err, apperror.ErrDatabaseExec, "failed to update site active status")
    }

    return nil
}
```

### Validation

```go
// internal/services/site/validator.go
package site

import (
    "net/url"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

func (s *serviceImpl) validateCreateInput(input CreateInput) error {
    if err := s.validateSiteName(input.Name); err != nil {
        return err
    }

    if err := s.validateSiteURL(input.URL); err != nil {
        return err
    }

    return s.validateSiteCredentials(input.Username, input.AppPassword)
}

func (s *serviceImpl) validateSiteName(name string) error {
    if strings.TrimSpace(name) == "" {
        return apperror.New(apperror.ErrValidationEmpty, "site name is required")
    }

    if len(name) > 255 {
        return apperror.New(apperror.ErrValidationLength, "site name must be 255 characters or less")
    }

    return nil
}

func (s *serviceImpl) validateSiteURL(rawURL string) error {
    if strings.TrimSpace(rawURL) == "" {
        return apperror.New(apperror.ErrValidationEmpty, "site URL is required")
    }
    if err := validateURLScheme(rawURL); err != nil {
        return err
    }
    if len(rawURL) > 2048 {
        return apperror.New(apperror.ErrValidationLength, "site URL must be 2048 characters or less")
    }

    return nil
}

func validateURLScheme(rawURL string) error {
    parsedURL, err := url.Parse(rawURL)
    isInvalidScheme := err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https")

    if isInvalidScheme {
        return apperror.New(apperror.ErrValidationURL, "invalid site URL format")
    }

    return nil
}

func (s *serviceImpl) validateSiteCredentials(username, appPassword string) error {
    if strings.TrimSpace(username) == "" {
        return apperror.New(apperror.ErrValidationEmpty, "username is required")
    }

    if strings.TrimSpace(appPassword) == "" {
        return apperror.New(apperror.ErrValidationEmpty, "application password is required")
    }

    return s.validateAppPasswordFormat(appPassword)
}

func (s *serviceImpl) validateAppPasswordFormat(appPassword string) error {
    normalized := strings.ReplaceAll(appPassword, " ", "")

    if len(normalized) != 24 {
        return apperror.New(apperror.ErrValidationFormat,
            "application password must be 24 characters (format: xxxx xxxx xxxx xxxx xxxx xxxx)")
    }

    return nil
}
```

### Encryption

```go
// internal/services/site/encryption.go
package site

import (
    "crypto/aes"
    "crypto/cipher"
    "crypto/rand"
    "encoding/base64"
    "io"
    
    "wp-plugin-publish/pkg/apperror"
)

func EncryptPassword(plaintext string, key []byte) (string, error) {
    gcm, err := createGCM(key)
    if err != nil {
        return "", err
    }

    nonce, err := generateNonce(gcm.NonceSize())
    if err != nil {
        return "", err
    }

    ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)

    return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func DecryptPassword(ciphertext string, key []byte) (string, error) {
    data, err := base64.StdEncoding.DecodeString(ciphertext)
    if err != nil {
        return "", apperror.Wrap(err, apperror.ErrInternal, "failed to decode ciphertext")
    }

    gcm, err := createGCM(key)
    if err != nil {
        return "", err
    }

    return decryptGCMPayload(gcm, data)
}

func createGCM(key []byte) (cipher.AEAD, error) {
    block, err := aes.NewCipher(key)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrInternal, "failed to create cipher")
    }

    gcm, err := cipher.NewGCM(block)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrInternal, "failed to create GCM")
    }

    return gcm, nil
}

func generateNonce(size int) ([]byte, error) {
    nonce := make([]byte, size)
    if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
        return nil, apperror.Wrap(err, apperror.ErrInternal, "failed to generate nonce")
    }

    return nonce, nil
}

func decryptGCMPayload(gcm cipher.AEAD, data []byte) (string, error) {
    if len(data) < gcm.NonceSize() {
        return "", apperror.New(apperror.ErrInternal, "ciphertext too short")
    }

    nonce := data[:gcm.NonceSize()]
    ciphertextBytes := data[gcm.NonceSize():]

    plaintext, err := gcm.Open(nil, nonce, ciphertextBytes, nil)
    if err != nil {
        return "", apperror.Wrap(err, apperror.ErrInternal, "failed to decrypt")
    }

    return string(plaintext), nil
}
```

---

## Error Scenarios

| Scenario | Error Code | HTTP Status |
|----------|------------|-------------|
| Site not found | E2005 | 404 |
| Duplicate URL | E2006 | 409 |
| Invalid URL format | E6002 | 400 |
| Empty required field | E6004 | 400 |
| Connection failed | E3001 | 502 |
| Auth failed | E3002 | 401 |

---

## Next Document

See [05-plugin-service.md](./05-plugin-service.md) for plugin management.
