# WordPress Plugin Initialization Patterns

## The Bootstrap Problem

WordPress plugins are loaded during PHP's compilation phase, before WordPress core is fully initialized. This means:

1. WordPress functions may not be available
2. Global objects may not exist
3. Hooks may not be registered
4. Database may not be connected

## Safe Initialization Sequence

### Phase 1: Autoloader Registration (Immediate Execution)

When WordPress includes your main plugin file, only the PSR-4 autoloader should load:

```php
<?php
/**
 * Plugin Name: My Plugin
 * Version: 1.0.0
 * Requires PHP: 8.2
 */

if (!defined('ABSPATH')) {
    exit;
}

// PSR-4 autoloader — the ONLY require_once permitted in the entry file
require_once __DIR__ . '/includes/Autoloader.php';
```

> **Important:** No manual `require_once` for individual classes or `DependencyLoader::loadManifest()` calls.
> The autoloader maps the `RiseupAsia\` namespace to `includes/` and resolves all classes on demand.

### Phase 2: Class Instantiation (Still Early)

Create instances, but constructors must NOT call WordPress functions:

```php
namespace RiseupAsia\Logging;

// ✅ SAFE — Constructor only sets defaults
class FileLogger {
    private ?string $logPath = null;
    private bool $isInitialized = false;

    public function __construct() {
        // Only set non-WP-dependent defaults
        $this->isInitialized = false;
    }
}
```

### Phase 3: Hook Registration (Safe Zone Begins)

Register hooks to defer work until WordPress is ready:

```php
use RiseupAsia\Enums\HookType;
use RiseupAsia\Core\Plugin;
use RiseupAsia\Admin\Admin;

function riseup_asia_init(): void {
    Plugin::getInstance();

    if (is_admin()) {
        Admin::getInstance();
    }
}

add_action(HookType::PluginsLoaded->value, 'riseup_asia_init');
```

### Phase 4: plugins_loaded Hook

First safe point for most WordPress function calls:

```php
public function onPluginsLoaded(): void {
    $this->initDatabase();
    $this->loadTextdomain();
}
```

### Phase 5: init Hook

All WordPress core is ready:

```php
public function onInit(): void {
    $this->registerPostTypes();
}
```

### Phase 6: rest_api_init Hook

REST API is ready:

```php
use RiseupAsia\Enums\EndpointType;
use RiseupAsia\Enums\HttpMethodType;
use RiseupAsia\Enums\PluginConfigType;

public function registerRoutes(): void {
    $namespace = PluginConfigType::ApiBase->value . '/' . PluginConfigType::ApiVersion->value;

    register_rest_route(
        $namespace,
        EndpointType::Health->route(),
        [
            'methods' => HttpMethodType::Get->value,
            'callback' => [$this, 'handleHealth'],
            'permission_callback' => '__return_true',
        ],
    );
}
```

## Lazy Initialization Pattern

The key pattern for avoiding early WordPress function calls:

```php
namespace RiseupAsia\Helpers;

class AssetLocator {
    private ?array $uploadDir = null;
    private ?string $dataPath = null;

    private function getUploadDir(): array {
        $this->uploadDir ??= wp_upload_dir();

        return $this->uploadDir;
    }

    public function getDataPath(): string {
        if ($this->dataPath === null) {
            $upload = $this->getUploadDir();
            $this->dataPath = $upload['basedir'] . '/' . PluginConfigType::Slug->value . '/data/';
        }

        return $this->dataPath;
    }

    private function ensureDirectory(string $path): string {
        $isCreateFailed = PathHelper::isDirMissing($path) && !@mkdir($path, 0755, true) && !is_dir($path);

        if ($isCreateFailed) {
            throw new RuntimeException("Failed to create directory: {$path}");
        }

        return $path;
    }
}
```

## Dependency Resolution Without Circular References

### Problem: Class A needs Class B, Class B needs Class A

```php
// ❌ CAUSES INFINITE LOOP
class Database {
    public function __construct(private Logger $logger) {}
}

class Logger {
    public function __construct(private Database $db) {}
}
```

### Solution: Lazy Dependency Loading

```php
namespace RiseupAsia\Logging;

use RiseupAsia\Database\Database;

// ✅ CORRECT — Lazy loading breaks the cycle
class Logger {
    private ?Database $db = null;

    private function getDb(): Database {
        $this->db ??= Database::getInstance();

        return $this->db;
    }

    public function logToDb(string $message): void {
        $db = $this->getDb();
        $db->insertLog($message);
    }
}
```

## Two-Tier Logging Strategy

For plugins that need to log during initialization (before Database is ready):

### Tier 1: File Logger (Always Available)

```php
namespace RiseupAsia\Logging;

use RiseupAsia\Helpers\PathHelper;

class FileLogger {
    private ?string $logPath = null;
    private ?string $errorPath = null;
    private bool $isInitialized = false;

    private function ensurePaths(): void {
        if ($this->isInitialized) {
            return;
        }

        $logsDir = PathHelper::logsDir();
        PathHelper::makeDirectory($logsDir, secure: true);

        $this->logPath = $logsDir . '/log.txt';
        $this->errorPath = $logsDir . '/error.txt';
        $this->isInitialized = true;
    }

    public function log(
        string $message,
        string $file = '',
        int $line = 0,
    ): bool {
        $this->ensurePaths();

        $entry = $this->formatEntry($message, $file, $line);
        @file_put_contents($this->logPath, $entry, FILE_APPEND | LOCK_EX);

        return true;
    }
}
```

### Tier 2: Database Logger (Available After Init)

```php
namespace RiseupAsia\Logging;

use RiseupAsia\Database\Database;
use Throwable;

class Logger {
    private ?Database $db = null;
    private bool $isDbAvailable = true;

    public function __construct(
        private readonly FileLogger $fileLogger,
    ) {}

    public function log(string $message, string $level = 'INFO'): void {
        $this->fileLogger->log("[{$level}] {$message}", __FILE__, __LINE__);

        try {
            $db = $this->getDb();

            if ($db?->isReady()) {
                $db->insertLog($message, $level);
            }
        } catch (Throwable $e) {
            $this->fileLogger->log("DB log failed: " . $e->getMessage(), __FILE__, __LINE__);
        }
    }
}
```

## Complete Bootstrap Template (PSR-4)

```php
<?php
/**
 * Plugin Name: My Plugin
 * Version: 1.0.0
 * Requires PHP: 8.2
 */

if (!defined('ABSPATH')) {
    exit;
}

use RiseupAsia\Enums\HookType;
use RiseupAsia\Activation\ActivationHandler;
use RiseupAsia\Core\Plugin;
use RiseupAsia\Admin\Admin;

// PSR-4 AUTOLOADER — all RiseupAsia\ classes resolve automatically
require_once __DIR__ . '/includes/Autoloader.php';

register_activation_hook(__FILE__, [ActivationHandler::class, 'activate']);

function riseup_asia_init(): void {
    Plugin::getInstance();

    if (is_admin()) {
        Admin::getInstance();
    }
}

add_action(HookType::PluginsLoaded->value, 'riseup_asia_init');
```

> **Note:** No `DependencyLoader::loadManifest()`, no manual `require_once` for classes.
> All `RiseupAsia\` classes are resolved by the autoloader on first use.

## Common Pitfalls

### 1. Using `plugin_dir_url()` in Constants

```php
// ❌ WRONG — Function call at parse time
define('MYPLUGIN_URL', plugin_dir_url(__FILE__));

// ✅ CORRECT — Use PathHelper or lazy resolution
$url = PathHelper::pluginUrl();
```

### 2. Database Connection in Constructor

```php
use PDO;

// ❌ WRONG
public function __construct() {
    $this->pdo = new PDO('sqlite:' . $this->getDbPath());
}

// ✅ CORRECT
public function __construct() {
    $this->pdo = null;
}

private function getPdo(): PDO {
    if ($this->pdo === null) {
        $this->pdo = new PDO('sqlite:' . $this->getDbPath());
    }

    return $this->pdo;
}
```

### 3. Calling `is_admin()` Too Early

```php
use RiseupAsia\Enums\HookType;

// ❌ WRONG — is_admin() may not work during plugin load
if (is_admin()) {
    require_once 'admin/Admin.php';
}

// ✅ CORRECT — Defer to appropriate hook
add_action(HookType::AdminInit->value, function(): void {
    Admin::getInstance();
});
```
