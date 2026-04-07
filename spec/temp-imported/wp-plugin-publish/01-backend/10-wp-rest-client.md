# 10 — WP REST API Client

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The WordPress REST API Client handles all communication with remote WordPress sites, including authentication, plugin management, and file uploads.

---

## Interface

```go
// internal/wordpress/client.go
package wordpress

import (
    "context"
)

type Client interface {
    // Site information
    GetSiteInfo(ctx context.Context, url, username, password string) (*SiteInfo, error)
    
    // Plugin operations
    ListPlugins(ctx context.Context, url, username, password string) ([]Plugin, error)
    GetPlugin(ctx context.Context, url, username, password, slug string) (*Plugin, error)
    ActivatePlugin(ctx context.Context, url, username, password, slug string) error
    DeactivatePlugin(ctx context.Context, url, username, password, slug string) error
    DeletePlugin(ctx context.Context, url, username, password, slug string) error
    
    // Upload operations
    UploadPlugin(ctx context.Context, url, username, password string, zipPath string) (*UploadResult, error)
    
    // Plugin files (if supported by a companion plugin)
    GetPluginFiles(ctx context.Context, url, username, password, slug string) ([]RemoteFile, error)
    UploadPluginFile(ctx context.Context, url, username, password, slug, filePath string, content []byte) error
    
    // Health check
    Ping(ctx context.Context, url string) error
}
```

---

## Data Types

```go
// internal/wordpress/types.go
package wordpress

// WPPluginStatusType represents the WordPress plugin status from the REST API
type WPPluginStatusType string

const (
	WPPluginStatusActive   WPPluginStatusType = "active"
	WPPluginStatusInactive WPPluginStatusType = "inactive"
)

type SiteInfo struct {
    Name        string `json:"name"`
    Description string `json:"description"`
    URL         string `json:"url"`
    Home        string `json:"home"`
    GMTOffset   int    `json:"gmt_offset"`
    Timezone    string `json:"timezone_string"`
    Version     string `json:"version,omitempty"`
}

type Plugin struct {
    Slug        string             `json:"slug,omitempty"`
    Plugin      string             `json:"plugin"`
    Status      WPPluginStatusType `json:"status"`
    Name        string            `json:"name"`
    PluginURI   string            `json:"plugin_uri"`
    Author      string            `json:"author"`
    AuthorURI   string            `json:"author_uri"`
    Description Description       `json:"description"`
    Version     string            `json:"version"`
    NetworkOnly bool              `json:"network_only"`
    RequiresWP  string            `json:"requires_wp"`
    RequiresPHP string            `json:"requires_php"`
    TextDomain  string            `json:"text_domain"`
}

type Description struct {
    Raw      string `json:"raw"`
    Rendered string `json:"rendered"`
}

type UploadResult struct {
    Success     bool   `json:"success"`
    PluginSlug  string `json:"pluginSlug,omitempty"`
    Version     string `json:"version,omitempty"`
    WasUpdated  bool   `json:"wasUpdated"`
    Error       string `json:"error,omitempty"`
}

type RemoteFile struct {
    Path       string `json:"path"`
    Size       int64  `json:"size"`
    Hash       string `json:"hash"`
    ModifiedAt string `json:"modifiedAt"`
}
```

---

## Implementation

### HTTP Client

```go
// internal/wordpress/client.go
package wordpress

import (
    "bytes"
    "context"
    "encoding/base64"
    "encoding/json"
    "fmt"
    "io"
    "mime/multipart"
    "net/http"
    "os"
    "path/filepath"
    "strings"
    "time"
    
    "wp-plugin-publish/internal/logger"
    "wp-plugin-publish/pkg/apperror"
)

type clientImpl struct {
    httpClient *http.Client
    log        *logger.Logger
}

func NewClient(log *logger.Logger) Client {
    return &clientImpl{
        httpClient: &http.Client{
            Timeout: 60 * time.Second,
        },
        log: log,
    }
}

func (c *clientImpl) doRequest(
	ctx context.Context,
	method string,
	url string,
	username string,
	password string,
	body io.Reader,
	contentType string,
) (*http.Response, error) {
    req, err := c.buildAuthenticatedRequest(ctx, method, url, username, password, body)
    if err != nil {
        return nil, err
    }

    c.setCommonHeaders(req, contentType)

    return c.executeRequest(req, method, url)
}

func (c *clientImpl) buildAuthenticatedRequest(
	ctx context.Context,
	method string,
	url string,
	username string,
	password string,
	body io.Reader,
) (*http.Request, error) {
    req, err := http.NewRequestWithContext(ctx, method, url, body)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrWPConnect, "failed to create request")
    }

    auth := base64.StdEncoding.EncodeToString([]byte(username + ":" + password))
    req.Header.Set("Authorization", "Basic "+auth)

    return req, nil
}

func (c *clientImpl) setCommonHeaders(req *http.Request, contentType string) {
    hasContentType := contentType != ""

    if hasContentType {
        req.Header.Set("Content-Type", contentType)
    }

    req.Header.Set("Accept", "application/json")
    req.Header.Set("User-Agent", "WP-Plugin-Publish/1.0")
}

func (c *clientImpl) executeRequest(
    req *http.Request,
    method, url string,
) (*http.Response, error) {
    c.log.Debug("Making WP API request", "method", method, "url", url)

    resp, err := c.httpClient.Do(req)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrWPConnect, "request failed")
    }

    return resp, nil
}

func (c *clientImpl) parseResponse(resp *http.Response, target any) error {
    defer resp.Body.Close()
    
    body, err := io.ReadAll(resp.Body)
    if err != nil {
        return apperror.Wrap(err, apperror.ErrWPAPI, "failed to read response body")
    }
    
    if err := c.checkStatusCode(resp.StatusCode, body); err != nil {
        return err
    }
    
    return c.unmarshalIfNeeded(body, target)
}

func (c *clientImpl) unmarshalIfNeeded(body []byte, target any) error {
    if target == nil {
        return nil
    }

    if err := json.Unmarshal(body, target); err != nil {
        return apperror.Wrap(err, apperror.ErrWPAPI, "failed to parse response")
    }

    return nil
}

func (c *clientImpl) checkStatusCode(statusCode int, body []byte) error {
    if err := c.checkKnownStatusError(statusCode); err != nil {
        return err
    }

    if statusCode >= 400 {
        return c.parseWPError(statusCode, body)
    }
    
    return nil
}

func (c *clientImpl) checkKnownStatusError(statusCode int) error {
    switch statusCode {
    case 401:
        return apperror.New(apperror.ErrWPAuth, "authentication failed - check username and application password").
            WithContext("status", statusCode)
    case 403:
        return apperror.New(apperror.ErrWPAuth, "access forbidden - user may lack required permissions").
            WithContext("status", statusCode)
    case 404:
        return apperror.New(apperror.ErrNotFound, "endpoint not found").
            WithContext("status", statusCode)
    }

    return nil
}

func (c *clientImpl) parseWPError(statusCode int, body []byte) error {
    var wpErr struct {
        Code    string `json:"code"`
        Message string `json:"message"`
    }

    isWPError := json.Unmarshal(body, &wpErr) == nil && wpErr.Message != ""

    if isWPError {
        return apperror.New(apperror.ErrWPAPI, wpErr.Message).
            WithContext("wp_code", wpErr.Code).
            WithContext("status", statusCode)
    }
    
    return apperror.New(apperror.ErrWPAPI, "WordPress API error").
        WithContext("status", statusCode).
        WithContext("body", string(body))
}
```

### Site Information

```go
// internal/wordpress/site.go
package wordpress

import (
    "context"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

func (c *clientImpl) GetSiteInfo(
	ctx context.Context,
	url string,
	username string,
	password string,
) (*SiteInfo, error) {
    c.log.Info("Getting site info", "url", url)
    
    url = strings.TrimSuffix(url, "/")
    
    indexResponse, err := c.fetchWPIndex(ctx, url, username, password)
    if err != nil {
        return nil, err
    }
    
    if err := c.validateWPv2Namespace(indexResponse.Namespaces); err != nil {
        return nil, err
    }
    
    version := c.fetchWPVersion(ctx, url, username, password)
    
    return c.buildSiteInfo(indexResponse, version), nil
}

type wpIndexResponse struct {
    Name        string   `json:"name"`
    Description string   `json:"description"`
    URL         string   `json:"url"`
    Home        string   `json:"home"`
    GMTOffset   int      `json:"gmt_offset"`
    Timezone    string   `json:"timezone_string"`
    Namespaces  []string `json:"namespaces"`
}

func (c *clientImpl) fetchWPIndex(
    ctx context.Context,
    url string,
    username string,
    password string,
) (*wpIndexResponse, error) {
    resp, err := c.doRequest(ctx, "GET", url+"/wp-json", username, password, nil, "")
    if err != nil {
        return nil, err
    }
    
    var indexResponse wpIndexResponse
    if err := c.parseResponse(resp, &indexResponse); err != nil {
        return nil, err
    }
    
    return &indexResponse, nil
}

func (c *clientImpl) validateWPv2Namespace(namespaces []string) error {
    for _, ns := range namespaces {
        if ns == "wp/v2" {
            return nil
        }
    }
    
    return apperror.New(apperror.ErrWPVersion,
        "WordPress REST API v2 not available - WordPress 4.7+ required")
}

func (c *clientImpl) fetchWPVersion(
    ctx context.Context,
    url string,
    username string,
    password string,
) string {
    resp, err := c.doRequest(ctx, "GET", url+"/wp-json/wp/v2", username, password, nil, "")
    if err != nil {
        return ""
    }
    
    var v2Info struct {
        Version string `json:"wp_version"`
    }
    if c.parseResponse(resp, &v2Info) == nil {
        return v2Info.Version
    }
    
    return ""
}

func (c *clientImpl) buildSiteInfo(idx *wpIndexResponse, version string) *SiteInfo {
    return &SiteInfo{
        Name:        idx.Name,
        Description: idx.Description,
        URL:         idx.URL,
        Home:        idx.Home,
        GMTOffset:   idx.GMTOffset,
        Timezone:    idx.Timezone,
        Version:     version,
    }
}

func (c *clientImpl) Ping(ctx context.Context, url string) error {
    url = strings.TrimSuffix(url, "/")
    
    resp, err := c.httpClient.Get(url + "/wp-json")
    if err != nil {
        return apperror.Wrap(err, apperror.ErrWPConnect, "failed to ping site")
    }
    defer resp.Body.Close()
    
    if resp.StatusCode >= 400 {
        return apperror.New(apperror.ErrWPConnect, "site not reachable").
            WithContext("status", resp.StatusCode)
    }
    
    return nil
}
```

### Plugin Operations

```go
// internal/wordpress/plugins.go
package wordpress

import (
    "bytes"
    "context"
    "encoding/json"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

func (c *clientImpl) ListPlugins(
	ctx context.Context,
	url string,
	username string,
	password string,
) ([]Plugin, error) {
    c.log.Debug("Listing plugins", "url", url)

    plugins, err := c.fetchPlugins(ctx, url, username, password)
    if err != nil {
        return nil, err
    }

    c.extractPluginSlugs(plugins)
    c.log.Info("Listed plugins", "url", url, "count", len(plugins))

    return plugins, nil
}

func (c *clientImpl) fetchPlugins(
	ctx context.Context,
	url string,
	username string,
	password string,
) ([]Plugin, error) {
    url = strings.TrimSuffix(url, "/")

    resp, err := c.doRequest(ctx, "GET", url+"/wp-json/wp/v2/plugins", username, password, nil, "")
    if err != nil {
        return nil, err
    }

    var plugins []Plugin
    if err := c.parseResponse(resp, &plugins); err != nil {
        return nil, err
    }

    return plugins, nil
}

func (c *clientImpl) extractPluginSlugs(plugins []Plugin) {
    for i := range plugins {
        isPluginPathEmpty := plugins[i].Plugin == ""

        if isPluginPathEmpty {
            continue
        }

        parts := strings.Split(plugins[i].Plugin, "/")
        hasParts := len(parts) > 0

        if hasParts {
            plugins[i].Slug = parts[0]
        }
    }
}

func (c *clientImpl) GetPlugin(
	ctx context.Context,
	url string,
	username string,
	password string,
	slug string,
) (*Plugin, error) {
    c.log.Debug("Getting plugin", "url", url, "slug", slug)
    
    plugins, err := c.ListPlugins(ctx, url, username, password)
    if err != nil {
        return nil, err
    }
    
    return c.findPluginBySlug(plugins, slug)
}

func (c *clientImpl) findPluginBySlug(plugins []Plugin, slug string) (*Plugin, error) {
    for _, p := range plugins {
        isMatch := p.Slug == slug || strings.HasPrefix(p.Plugin, slug+"/")
        if isMatch {
            return &p, nil
        }
    }

    return nil, apperror.New(apperror.ErrNotFound, "plugin not found on remote site").
        WithContext("slug", slug)
}

func (c *clientImpl) ActivatePlugin(
	ctx context.Context,
	url string,
	username string,
	password string,
	slug string,
) error {
    c.log.Info("Activating plugin", "url", url, "slug", slug)
    
    plugin, err := c.GetPlugin(ctx, url, username, password, slug)
    if err != nil {
        return err
    }
    
    if plugin.Status == WPPluginStatusActive {
        c.log.Debug("Plugin already active", "slug", slug)

        return nil
    }
    
    return c.setPluginStatus(ctx, url, username, password, plugin.Plugin, WPPluginStatusActive, apperror.ErrWPActivate, "activate")
}

func (c *clientImpl) setPluginStatus(
    ctx context.Context,
    url string,
    username string,
    password string,
    pluginPath string,
    status WPPluginStatusType,
    errCode string,
    action string,
) error {
    endpoint := strings.TrimSuffix(url, "/") + "/wp-json/wp/v2/plugins/" + pluginPath
    body, _ := json.Marshal(map[string]WPPluginStatusType{"status": status})

    resp, err := c.doRequest(ctx, "PUT", endpoint, username, password, bytes.NewReader(body), "application/json")
    if err != nil {
        return apperror.Wrap(err, errCode, "failed to "+action+" plugin")
    }

    if err := c.parseResponse(resp, nil); err != nil {
        return apperror.Wrap(err, errCode, "plugin "+action+" failed")
    }

    c.log.Info("Plugin "+action+"d", "plugin", pluginPath)

    return nil
}

func (c *clientImpl) DeactivatePlugin(
	ctx context.Context,
	url string,
	username string,
	password string,
	slug string,
) error {
    c.log.Info("Deactivating plugin", "url", url, "slug", slug)
    
    plugin, err := c.GetPlugin(ctx, url, username, password, slug)
    if err != nil {
        return err
    }
    
    if plugin.Status == WPPluginStatusInactive {
        c.log.Debug("Plugin already inactive", "slug", slug)

        return nil
    }
    
    return c.setPluginStatus(ctx, url, username, password, plugin.Plugin, WPPluginStatusInactive, apperror.ErrWPDeactivate, "deactivate")
}

func (c *clientImpl) DeletePlugin(
	ctx context.Context,
	url string,
	username string,
	password string,
	slug string,
) error {
    c.log.Info("Deleting plugin", "url", url, "slug", slug)

    plugin, err := c.GetPlugin(ctx, url, username, password, slug)
    if err != nil {
        return err
    }

    if err := c.ensurePluginDeactivated(ctx, url, username, password, plugin); err != nil {
        return err
    }

    return c.executeDeletePlugin(ctx, url, username, password, plugin.Plugin)
}

func (c *clientImpl) ensurePluginDeactivated(
	ctx context.Context,
	url string,
	username string,
	password string,
	plugin *Plugin,
) error {
    if plugin.Status != WPPluginStatusActive {
        return nil
    }

    return c.DeactivatePlugin(ctx, url, username, password, plugin.Slug)
}

func (c *clientImpl) executeDeletePlugin(
	ctx context.Context,
	url string,
	username string,
	password string,
	pluginPath string,
) error {
    endpoint := strings.TrimSuffix(url, "/") + "/wp-json/wp/v2/plugins/" + pluginPath

    resp, err := c.doRequest(ctx, "DELETE", endpoint, username, password, nil, "")
    if err != nil {
        return apperror.Wrap(err, apperror.ErrWPPlugin, "failed to delete plugin")
    }

    if err := c.parseResponse(resp, nil); err != nil {
        return apperror.Wrap(err, apperror.ErrWPPlugin, "plugin deletion failed")
    }

    c.log.Info("Plugin deleted", "plugin", pluginPath)

    return nil
}
```

### Upload Operations

```go
// internal/wordpress/upload.go
package wordpress

import (
    "bytes"
    "context"
    "io"
    "mime/multipart"
    "os"
    "path/filepath"
    "strings"
    
    "wp-plugin-publish/pkg/apperror"
)

func (c *clientImpl) UploadPlugin(
	ctx context.Context,
	url string,
	username string,
	password string,
	zipPath string,
) (*UploadResult, error) {
    c.log.Info("Uploading plugin", "url", url, "zip", zipPath)

    file, stat, err := c.openZipFile(zipPath)
    if err != nil {
        return nil, err
    }
    defer file.Close()

    c.log.Debug("Uploading plugin zip", "size", stat.Size(), "filename", filepath.Base(zipPath))

    return c.uploadZipFile(ctx, url, username, password, file, zipPath)
}

func (c *clientImpl) uploadZipFile(
	ctx context.Context,
	url string,
	username string,
	password string,
	file *os.File,
	zipPath string,
) (*UploadResult, error) {
    body, contentType, err := c.buildMultipartUpload(file, zipPath)
    if err != nil {
        return nil, err
    }

    return c.executeUpload(ctx, url, username, password, body, contentType)
}

func (c *clientImpl) openZipFile(zipPath string) (*os.File, os.FileInfo, error) {
    file, err := os.Open(zipPath)
    if err != nil {
        return nil, nil, apperror.Wrap(err, apperror.ErrFileRead, "failed to open zip file")
    }
    
    stat, err := file.Stat()
    if err != nil {
        file.Close()

        return nil, nil, apperror.Wrap(err, apperror.ErrFileRead, "failed to stat zip file")
    }
    
    return file, stat, nil
}

func (c *clientImpl) buildMultipartUpload(file *os.File, zipPath string) (*bytes.Buffer, string, error) {
    var body bytes.Buffer
    writer := multipart.NewWriter(&body)

    if err := c.writeFormFile(writer, file, zipPath); err != nil {
        return nil, "", err
    }

    writer.WriteField("overwrite", "true")
    writer.Close()

    return &body, writer.FormDataContentType(), nil
}

func (c *clientImpl) writeFormFile(
    writer *multipart.Writer,
    file *os.File,
    zipPath string,
) error {
    part, err := writer.CreateFormFile("pluginzip", filepath.Base(zipPath))
    if err != nil {
        return apperror.Wrap(err, apperror.ErrInternal, "failed to create form file")
    }
    
    if _, err := io.Copy(part, file); err != nil {
        return apperror.Wrap(err, apperror.ErrInternal, "failed to copy file content")
    }

    return nil
}

func (c *clientImpl) executeUpload(
    ctx context.Context,
    url string,
    username string,
    password string,
    body *bytes.Buffer,
    contentType string,
) (*UploadResult, error) {
    endpoint := strings.TrimSuffix(url, "/") + "/wp-json/wp/v2/plugins"

    resp, err := c.doRequest(ctx, "POST", endpoint, username, password, body, contentType)
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrWPUpload, "failed to upload plugin")
    }

    return c.parseUploadResponse(resp)
}

func (c *clientImpl) parseUploadResponse(resp *http.Response) (*UploadResult, error) {
    var uploadResp struct {
        Plugin  string `json:"plugin"`
        Status  string `json:"status"`
        Name    string `json:"name"`
        Version string `json:"version"`
    }

    if err := c.parseResponse(resp, &uploadResp); err != nil {
        return &UploadResult{Success: false, Error: err.Error()}, nil
    }

    return c.buildUploadResult(uploadResp.Plugin, uploadResp.Version), nil
}

func (c *clientImpl) buildUploadResult(pluginPath, version string) *UploadResult {
    slug := extractSlugFromPath(pluginPath)

    c.log.Info("Plugin uploaded successfully", "slug", slug, "version", version)

    return &UploadResult{
        Success:    true,
        PluginSlug: slug,
        Version:    version,
        WasUpdated: true,
    }
}

func extractSlugFromPath(pluginPath string) string {
    isPathEmpty := pluginPath == ""

    if isPathEmpty {
        return ""
    }

    parts := strings.Split(pluginPath, "/")
    hasParts := len(parts) > 0

    if hasParts {
        return parts[0]
    }

    return ""
}

// --- Plugin Files (companion plugin endpoints) ---

func (c *clientImpl) GetPluginFiles(
	ctx context.Context,
	url string,
	username string,
	password string,
	slug string,
) ([]RemoteFile, error) {
    c.log.Debug("Getting plugin files", "url", url, "slug", slug)

    endpoint := c.companionEndpoint(url, slug, "/files")

    resp, err := c.doRequest(ctx, "GET", endpoint, username, password, nil, "")
    if err != nil {
        return nil, apperror.Wrap(err, apperror.ErrWPAPI,
            "failed to get plugin files - wp-plugin-publish companion plugin may not be installed")
    }

    var files []RemoteFile
    if err := c.parseResponse(resp, &files); err != nil {
        return nil, err
    }

    return files, nil
}

func (c *clientImpl) UploadPluginFile(
	ctx context.Context,
	url string,
	username string,
	password string,
	slug string,
	filePath string,
	content []byte,
) error {
    c.log.Debug("Uploading single file", "url", url, "slug", slug, "file", filePath)

    endpoint := c.companionEndpoint(url, slug, "/files")
    body, contentType, err := c.buildFileUploadForm(filePath, content)

    if err != nil {
        return err
    }

    resp, err := c.doRequest(ctx, "POST", endpoint, username, password, body, contentType)
    if err != nil {
        return apperror.Wrap(err, apperror.ErrWPUpload,
            "failed to upload file - wp-plugin-publish companion plugin may not be installed")
    }

    return c.parseResponse(resp, nil)
}

func (c *clientImpl) companionEndpoint(
    url, slug, suffix string,
) string {
    return strings.TrimSuffix(url, "/") + "/wp-json/wp-plugin-publish/v1/plugins/" + slug + suffix
}

func (c *clientImpl) buildFileUploadForm(filePath string, content []byte) (*bytes.Buffer, string, error) {
    var body bytes.Buffer
    writer := multipart.NewWriter(&body)

    writer.WriteField("path", filePath)

    if err := c.writeFileContent(writer, filePath, content); err != nil {
        return nil, "", err
    }

    writer.Close()

    return &body, writer.FormDataContentType(), nil
}

func (c *clientImpl) writeFileContent(
    writer *multipart.Writer,
    filePath string,
    content []byte,
) error {
    part, err := writer.CreateFormFile("file", filepath.Base(filePath))
    if err != nil {
        return apperror.Wrap(err, apperror.ErrInternal, "failed to create form file")
    }

    if _, err := part.Write(content); err != nil {
        return apperror.Wrap(err, apperror.ErrInternal, "failed to write file content")
    }

    return nil
}
```

---

## Error Handling

| HTTP Status | Error Code | Meaning |
|-------------|------------|---------|
| 401 | E3002 | Invalid credentials |
| 403 | E3002 | Insufficient permissions |
| 404 | E2005 | Plugin/endpoint not found |
| 500+ | E3003 | WordPress server error |

### Concrete Error Response Examples

#### 401 Unauthorized — Invalid Application Password

**Cause:** Wrong username, expired/revoked application password, or Application Passwords feature disabled.

```json
{
  "code": "rest_cannot_access",
  "message": "Sorry, you are not allowed to do that.",
  "data": {
    "status": 401
  }
}
```

**Alternative (malformed Basic Auth header):**

```json
{
  "code": "rest_not_logged_in",
  "message": "You are not currently logged in.",
  "data": {
    "status": 401
  }
}
```

**Common causes:**
- Application password contains spaces (WordPress formats them as `xxxx xxxx xxxx` but they must be sent without spaces)
- The user account was deleted or disabled
- A security plugin (Wordfence, iThemes) is blocking REST API authentication
- `.htaccess` or server-level Basic Auth is intercepting the header before WordPress processes it (common on CGI/FastCGI setups)

**Recovery:** Verify username, regenerate application password in WordPress admin → Users → Application Passwords. Check that no security plugin blocks REST API auth.

---

#### 403 Forbidden — Insufficient Capabilities

**Cause:** User exists and authenticates, but lacks the required WordPress capability (e.g., `activate_plugins`, `install_plugins`, `delete_plugins`).

```json
{
  "code": "rest_cannot_manage_plugins",
  "message": "Sorry, you are not allowed to manage plugins for this site.",
  "data": {
    "status": 403
  }
}
```

**Activation-specific 403:**

```json
{
  "code": "rest_cannot_activate_plugin",
  "message": "Sorry, you are not allowed to activate this plugin.",
  "data": {
    "status": 403
  }
}
```

**Multisite-specific 403:**

```json
{
  "code": "rest_cannot_manage_plugins",
  "message": "Sorry, you are not allowed to manage network plugins.",
  "data": {
    "status": 403
  }
}
```

**Common causes:**
- User role is Editor or lower (needs Administrator)
- On WordPress Multisite, only Super Admins can manage plugins
- A capability manager plugin (e.g., Members, User Role Editor) has restricted plugin capabilities
- `DISALLOW_FILE_MODS` is set to `true` in `wp-config.php` (blocks install/delete but not activate)

**Recovery:** Ensure the user has the `Administrator` role. On Multisite, the user must be a Super Admin. Check `wp-config.php` for `DISALLOW_FILE_MODS`.

---

#### 404 Not Found — Plugin or Endpoint Missing

**Cause:** Plugin slug doesn't exist on the remote site, or the REST API endpoint is not registered.

```json
{
  "code": "rest_plugin_not_found",
  "message": "Plugin not found.",
  "data": {
    "status": 404
  }
}
```

**Endpoint not found (REST API disabled or not registered):**

```json
{
  "code": "rest_no_route",
  "message": "No route was found matching the URL and request method.",
  "data": {
    "status": 404
  }
}
```

**Common causes:**
- Plugin was manually deleted from the filesystem
- Plugin slug contains a `/` character that breaks URL routing (this project uses JSON body parameters to avoid this)
- WordPress REST API is disabled by a security plugin or `.htaccess` rule
- Permalink structure is set to "Plain" and REST API routes don't resolve

**Recovery:** Use the pre-flight existence check (`/plugins/exists` endpoint) before lifecycle operations. Verify REST API is accessible via `GET /wp-json`.

---

#### 500 Internal Server Error — Remote Server Crash

**Cause:** PHP fatal error, memory exhaustion, or database failure on the remote WordPress site.

```json
{
  "code": "internal_server_error",
  "message": "There has been a critical error on this website.",
  "data": {
    "status": 500
  }
}
```

**Plugin activation crash (plugin's own code throws fatal error on activation):**

```json
{
  "code": "rest_plugin_activation_error",
  "message": "Plugin activation failed: Call to undefined function my_custom_function()",
  "data": {
    "status": 500,
    "plugin": "my-plugin/my-plugin.php"
  }
}
```

**Memory exhaustion:**

```
<html><body>
<b>Fatal error</b>: Allowed memory size of 268435456 bytes exhausted
</body></html>
```

> **Note:** When WordPress crashes hard (OOM, segfault), the response may be HTML instead of JSON. The Go client's `parseResponse` detects non-JSON responses and wraps them in an `apperror.ErrWPAPI` with the raw body in context.

**Common causes:**
- Plugin activation hook runs code that depends on missing classes or extensions
- PHP memory limit too low for ZIP extraction during upload (increase `memory_limit` to `256M+`)
- Database connection lost during plugin table creation
- Plugin conflicts — activating one plugin crashes another

**Recovery:** Check remote site error logs. If activation crashed, use rollback. Increase PHP `memory_limit` and `max_execution_time` if needed.

---

#### 409 Conflict — Plugin Already Exists (Upload)

```json
{
  "code": "rest_upload_plugin_exists",
  "message": "The plugin already exists. Use overwrite=true to replace.",
  "data": {
    "status": 409,
    "existing_version": "1.35.0"
  }
}
```

**Recovery:** The Go client always sends `overwrite=true` in the multipart form, so this should not occur in normal operation. If it does, check that the WordPress version supports the `overwrite` parameter (WP 5.5+).

---

#### Non-JSON Responses

When WordPress fails catastrophically, the response may be plain HTML or an empty body. The Go client handles this:

```go
// In parseResponse: detect HTML responses
isHTMLResponse := strings.Contains(string(body), "<html") || strings.Contains(string(body), "<!DOCTYPE")
if isHTMLResponse {
    return apperror.New(apperror.ErrWPAPI, "WordPress returned HTML instead of JSON - likely a fatal PHP error").
        WithContext("status", resp.StatusCode).
        WithContext("body_preview", string(body[:min(500, len(body))]))
}
```

**Common causes:**
- PHP fatal error before WordPress could set JSON content-type
- Apache/Nginx error page intercepted the response
- WordPress debug display is enabled (`WP_DEBUG_DISPLAY = true`) and outputs HTML before JSON

---

## Rate Limiting

The client respects WordPress rate limiting:

```go
// internal/wordpress/ratelimit.go
package wordpress

import (
    "sync"
    "time"
)

type RateLimiter struct {
    mu          sync.Mutex
    lastRequest map[string]time.Time
    minInterval time.Duration
}

func NewRateLimiter(minInterval time.Duration) *RateLimiter {
    return &RateLimiter{
        lastRequest: make(map[string]time.Time),
        minInterval: minInterval,
    }
}

func (rl *RateLimiter) Wait(host string) {
    rl.mu.Lock()
    defer rl.mu.Unlock()
    
    if last, ok := rl.lastRequest[host]; ok {
        elapsed := time.Since(last)
        if elapsed < rl.minInterval {
            time.Sleep(rl.minInterval - elapsed)
        }
    }
    
    rl.lastRequest[host] = time.Now()
}
```

---

## Next Document

See [11-rest-api-endpoints.md](./11-rest-api-endpoints.md) for backend HTTP API.
