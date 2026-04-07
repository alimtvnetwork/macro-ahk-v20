# PHP and WordPress Compatibility

## PHP Version Requirements

### Minimum: PHP 8.2

Both plugins (`riseup-asia-uploader` and `plugins-onboard`) target **PHP 8.2+** exclusively. No backward-compatibility shims, polyfills, or PHP 7.x/8.0/8.1 fallback code should be written.

```php
/**
 * Plugin Name: My Plugin
 * Requires PHP: 8.2
 */
```

### Version Check in Plugin

```php
if (version_compare(PHP_VERSION, '8.2', '<')) {
    add_action('admin_notices', function(): void {
        echo '<div class="notice notice-error">';
        echo '<p><strong>My Plugin</strong> requires PHP 8.2 or higher. ';
        echo 'Current version: ' . PHP_VERSION . '</p>';
        echo '</div>';
    });

    return;
}
```

## PHP 8.2 Features in Active Use

All of these are available and **expected** throughout the codebase:

```php
// Backed enums (PHP 8.1+)
enum EndpointType: string {
    case Upload = 'upload';
    case Status = 'status';

    public function route(): string {
        return '/' . $this->value;
    }
}

// Constructor property promotion (PHP 8.0+)
public function __construct(
    private readonly string $name,
    private readonly int $version,
) {}

// Readonly properties and classes (PHP 8.1+/8.2+)
readonly class Config {
    public function __construct(
        public string $pluginDir,
        public string $pluginUrl,
    ) {}
}

// Named arguments (PHP 8.0+)
$response = new WP_REST_Response(
    data: $payload,
    status: 200,
);

// Match expressions (PHP 8.0+)
$label = match($status) {
    'active' => 'Running',
    'paused' => 'On Hold',
    default  => 'Unknown',
};

// Nullsafe operator (PHP 8.0+)
$name = $user?->profile()?->displayName();

// Union and intersection types (PHP 8.0+/8.1+)
public function resolve(string $url): string|WP_Error {}

// Fibers (PHP 8.1+)
// Disjunctive Normal Form types (PHP 8.2+)
// True/false/null standalone types (PHP 8.2+)
// Constants in traits (PHP 8.2+)
```

## WordPress Version Requirements

### Minimum: WordPress 5.6

```php
/**
 * Plugin Name: My Plugin
 * Requires at least: 5.6
 */
```

### WordPress Version Compatibility Matrix

| WordPress Version | Support Level | REST API | Notes |
|-------------------|--------------|----------|-------|
| 5.6 | ✅ Minimum supported | Full REST API + Application Passwords | Minimum baseline |
| 5.9 | ✅ Tested | Full | Block Editor 2.0 |
| 6.0–6.3 | ✅ Tested | Full | Stable, widely deployed |
| 6.4–6.5 | ✅ Tested | Full | Current LTS range |
| 6.6+ | ✅ Expected compatible | Full | Future versions; test before certifying |

**Known WordPress REST API Behavior Differences:**

| WP Version | Behavior | Impact |
|------------|----------|--------|
| < 5.6 | No Application Passwords | Cannot authenticate via REST; unsupported |
| 5.6–5.8 | Application Passwords available but no auto-updates UI | Manual plugin updates only |
| 5.9+ | Full auto-update support | Can use `auto_update_plugin` filter |
| 6.0+ | REST API batch endpoint available | Can batch multiple API calls |
| Any | Security plugins (Wordfence, iThemes) may block REST API | 401/403 errors; need IP whitelisting |
| Any | Hosting WAFs may block large uploads | HTTP 413; need upload size config |

### WordPress 5.6+ Features

- **Application Passwords** — Native REST API authentication
- **Auto-updates for plugins/themes**
- **Block Editor improvements**

## Early Loading Compatibility

### Functions NOT Available During Plugin Load

These functions require WordPress to be fully loaded:

```php
// ❌ NOT AVAILABLE during plugin file include
wp_upload_dir()        // Needs WordPress fully loaded
get_option()           // Needs database connected
is_admin()             // May not be set yet
current_user_can()     // User not authenticated yet
plugin_dir_url()       // May fail on some servers

// ✅ AVAILABLE during plugin file include
plugin_dir_path()      // Safe — just path manipulation
defined('ABSPATH')     // Constants are set
```

### Safe Alternatives During Load

Use lazy initialization via class methods:

```php
class AssetLocator {
    private ?array $uploadDir = null;

    private function getUploadDir(): array {
        $this->uploadDir ??= wp_upload_dir();

        return $this->uploadDir;
    }
}
```

## Filesystem Compatibility

### Cross-Platform Paths

```php
// Use WordPress constants
$wpContent = WP_CONTENT_DIR;
$plugins   = WP_PLUGIN_DIR;

// Forward slashes work on all platforms
$path = PathHelper::pluginDir() . 'includes/Core/Plugin.php';
```

### Use Native PHP for Critical Operations

During plugin initialization, prefer native PHP over WordPress wrappers:

```php
if (PathHelper::isDirMissing($path)) {
    @mkdir($path, 0755, true);
}

@file_put_contents($path, $content, LOCK_EX);
```

## SQLite Compatibility

### PDO SQLite

```php
use PDO;
use PDOException;

if (!extension_loaded('pdo_sqlite')) {
    throw new RuntimeException('PDO SQLite extension is required');
}

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    // Handle missing SQLite support
}
```

### DateTime Handling in SQLite

SQLite has no native DATETIME type — store as TEXT in ISO 8601:

```php
$now = microtime(true);
$seconds = (int) floor($now);
$milliseconds = (int) round(($now - $seconds) * 1000);
$createdAt = gmdate('Y-m-d\TH:i:s', $seconds) . sprintf('.%03dZ', $milliseconds);
```

## PHP Memory and Timeout Requirements

### Minimum Server Requirements

| Resource | Minimum | Recommended | Purpose |
|----------|---------|-------------|---------|
| `memory_limit` | 128M | 256M | Plugin operations, ZIP handling |
| `max_execution_time` | 60s | 120s | Large plugin uploads, snapshot operations |
| `upload_max_filesize` | 10M | 50M | Plugin ZIP file uploads |
| `post_max_size` | 10M | 50M | Must be ≥ `upload_max_filesize` |
| `max_input_vars` | 1000 | 3000 | Large forms, bulk operations |

### Critical Operations and Memory

| Operation | Memory Impact | Timeout Risk | Mitigation |
|-----------|-------------|-------------|------------|
| Plugin ZIP upload | High (entire file in memory) | Medium | Chunked upload for files > 20MB |
| Snapshot full backup | High (all tables serialized) | High | Incremental backup mode |
| Snapshot restore | High (full DB replacement) | High | Transaction-based with rollback |
| Plugin activation | Low | Low | Standard WP activation hook |
| REST API listing | Low | Low | Paginated responses |
| File browser (remote) | Medium (directory tree) | Low | Lazy loading, depth limit |

### Detection and Graceful Degradation

```php
// Check memory before heavy operations
$memoryLimit = wp_convert_hr_to_bytes(ini_get('memory_limit'));
$memoryUsed  = memory_get_usage(true);
$memoryFree  = $memoryLimit - $memoryUsed;

if ($memoryFree < 32 * 1024 * 1024) { // < 32MB free
    return new WP_Error(
        'insufficient_memory',
        'Not enough memory for this operation. Free: ' . size_format($memoryFree),
    );
}

// Check max execution time before long operations
$maxTime     = (int) ini_get('max_execution_time');
$elapsedTime = microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'];

if ($maxTime > 0 && ($maxTime - $elapsedTime) < 10) {
    return new WP_Error(
        'timeout_risk',
        'Not enough execution time remaining',
    );
}
```

### Hosting Compatibility Notes

| Hosting Type | Common Limits | Notes |
|-------------|--------------|-------|
| Shared (GoDaddy, Bluehost) | 128M memory, 30s timeout | May need manual php.ini overrides |
| Managed WP (WP Engine, Kinsta) | 256M memory, 60s timeout | Usually sufficient; WAF may block REST |
| VPS/Dedicated | Configurable | Best compatibility |
| Docker/Local | Configurable | Development environment |

## Testing Across Versions

### Minimum Viable Testing

| Environment | Purpose |
|---|---|
| PHP 8.2 + WordPress 5.6 | Minimum supported |
| PHP 8.3 + Latest WordPress | Current production |

```bash
docker run -v $(pwd):/app -w /app php:8.2-cli php -l my-plugin.php
docker run -v $(pwd):/app -w /app php:8.3-cli php -l my-plugin.php
```
