# WordPress Plugin Development Specification

> Comprehensive guidelines for building robust, production-ready WordPress plugins.
> All examples target **PHP 8.2+** with PSR-4 namespacing under `RiseupAsia\`.

## Document Structure

| File | Description |
|------|-------------|
| [01-initialization-patterns.md](./01-initialization-patterns.md) | Safe loading order, dependency management, and bootstrap patterns |
| [02-logging-standards.md](./02-logging-standards.md) | Logging infrastructure with file paths, line numbers, and error handling |
| [03-database-patterns.md](./03-database-patterns.md) | SQLite/MySQL patterns, migrations, and schema versioning |
| [04-api-design.md](./04-api-design.md) | REST API design, endpoint registration, and authentication |
| [05-constants-and-configuration.md](./05-constants-and-configuration.md) | Backed enums and configuration management |
| [06-file-structure.md](./06-file-structure.md) | Directory layout and file organization standards |
| [07-error-handling.md](./07-error-handling.md) | Try-catch patterns, error logging, and graceful degradation |
| [08-compatibility.md](./08-compatibility.md) | PHP 8.2+ requirements and WordPress version requirements |
| [13-path-handling.md](./13-path-handling.md) | Path resolution, security, and PathHelper usage |
| [09-security.md](./09-security.md) | Authentication, sanitization, and security best practices |
| [10-testing.md](./10-testing.md) | Manual and automated testing strategies |
| [11-coding-guidelines.md](./11-coding-guidelines.md) | Mandatory development standards for the WordPress companion plugin |
| [12-phase-7-completion-report.md](./12-phase-7-completion-report.md) | PSR-4 autoloading & namespace migration completion report |

## Critical Lessons Learned

### 1. Never Call WordPress Functions During Early Plugin Load

**Problem**: Calling functions like `wp_upload_dir()`, `get_option()`, or database functions in class constructors or during file include causes fatal errors because WordPress core may not be fully initialized.

**Solution**: Use lazy initialization patterns — resolve paths and dependencies only when first needed, not at class instantiation.

```php
namespace RiseupAsia\Logging;

// ❌ WRONG — Causes crash during plugin load
class FileLogger {
    private ?string $logPath;

    public function __construct() {
        $uploadDir = wp_upload_dir(); // FATAL: WordPress not ready!
        $this->logPath = $uploadDir['basedir'] . '/riseup-asia-uploader/logs/';
    }
}

// ✅ CORRECT — Lazy initialization
class FileLogger {
    private ?string $logPath = null;

    private function getLogPath(): string {
        $this->logPath ??= PathHelper::logsDir() . '/log.txt';

        return $this->logPath;
    }

    public function log(
        string $message,
        string $file = '',
        int $line = 0,
    ): void {
        $path = $this->getLogPath();
        // ... write log
    }
}
```

### 2. Avoid Circular Dependencies

**Problem**: Class A requires Class B in constructor, and Class B requires Class A, causing infinite loop.

**Solution**: Use lazy loading via getter methods instead of constructor injection.

```php
namespace RiseupAsia\Logging;

use RiseupAsia\Database\Database;

// ❌ WRONG — Circular dependency
class Logger {
    public function __construct(private Database $db) {}
}

// ✅ CORRECT — Lazy loading
class Logger {
    private ?Database $db = null;

    private function getDb(): Database {
        $this->db ??= Database::getInstance();

        return $this->db;
    }
}
```

### 3. Always Use Backed Enums for Configuration

**Problem**: Hardcoded strings scattered throughout code lead to typos, inconsistencies, and maintenance nightmares.

**Solution**: Define ALL strings (endpoints, table names, option keys) as backed enum cases.

```php
use RiseupAsia\Enums\EndpointType;
use RiseupAsia\Enums\PluginConfigType;

$namespace = PluginConfigType::ApiBase->value . '/' . PluginConfigType::ApiVersion->value;

register_rest_route(
    $namespace,
    EndpointType::Upload->route(),
    [...],
);
```

### 4. Eager Database Migrations with Schema Versioning

**Problem**: Database tables don't exist when needed, or migrations run multiple times.

**Solution**: Run migrations immediately on plugin load with version tracking.

```php
public function init(): void {
    $this->fileLogger->log('Database init starting', __FILE__, __LINE__);
    $this->ensureDataDirectory();
    $this->createTables();
}

private function createTables(): void {
    $currentVersion = $this->getSchemaVersion();

    if ($currentVersion < 1) {
        $this->pdo->exec($createTableSql);
        $this->setSchemaVersion(1);
        $this->fileLogger->log('Migration v1 complete', __FILE__, __LINE__);
    }
}
```

### 5. Comprehensive Logging with Context

**Problem**: Errors occur but there's no way to trace what happened or where.

**Solution**: Log every significant operation with file path, line number, and context.

```php
$this->logger->log(
    sprintf('Creating table %s', $tableName),
    __FILE__,
    __LINE__,
);
```

## Quick Reference: Plugin Load Order

```
1. WordPress core loads
2. Plugin file included (PSR-4 autoloader registered)
3. Activation hook registered
4. 'plugins_loaded' hook fires → Plugin::getInstance()
5. 'init' hook fires (safe to use most WP functions)
6. 'rest_api_init' hook fires (register REST routes here)
```

## File Structure Template

```
my-plugin/
├── my-plugin.php              # Entry point (autoloader + hooks only)
├── includes/                  # PSR-4 root (RiseupAsia\ namespace)
│   ├── Autoloader.php         # PSR-4 autoloader — only manual require_once
│   ├── Core/Plugin.php        # Main plugin class (singleton)
│   ├── Enums/                 # Backed enums (HookType, EndpointType, etc.)
│   ├── Helpers/PathHelper.php # Centralized path resolution
│   ├── Logging/FileLogger.php # Low-level file logging
│   ├── Database/Database.php  # Database management
│   └── ...                    # Other namespaced subdirectories
├── assets/
│   ├── css/admin.css
│   └── js/admin.js
└── readme.md
```

## Author

**MD ALIM UL KARIM**  
https://rasia.pro/alim-r-profile-v1
