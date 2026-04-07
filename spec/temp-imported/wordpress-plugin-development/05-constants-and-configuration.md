# Constants and Configuration Management

## The Golden Rule

> **NEVER use magic strings in code. ALWAYS use backed enums or private class constants.**

Every string that represents a name, path, key, endpoint, or identifier must be defined as a backed enum case in the `RiseupAsia\Enums` namespace or as a `private const` within the owning class.

## Enum-Based Configuration (replaces `constants.php`)

The legacy `constants.php` file with global `define()` calls has been fully replaced by domain-specific backed enums in `includes/Enums/`. Each enum uses PascalCase naming with a `Type` suffix.

### Plugin Identity — `PluginConfigType`

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Enums;

enum PluginConfigType: string {
    case Slug       = 'riseup-asia-uploader';
    case Name       = 'Riseup Asia Uploader';
    case Version    = '1.56.0';
    case LogPrefix  = '[RiseupAsia]';
    case ApiBase    = 'riseup-asia-uploader';
    case ApiVersion = 'v1';

    public function isEqual(self $other): bool {
        return $this === $other;
    }
}
```

Access: `PluginConfigType::Slug->value`

### API Endpoints — `EndpointType`

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Enums;

enum EndpointType: string {
    case Health        = 'health';
    case Upload        = 'upload';
    case Status        = 'status';
    case Plugins       = 'plugins';
    case PluginEnable  = 'plugin-enable';
    case PluginDisable = 'plugin-disable';
    case Posts         = 'posts';
    case PostCreate    = 'post-create';
    case Categories    = 'categories';
    case Media         = 'media';

    /** Returns the endpoint path prefixed with a forward slash. */
    public function route(): string {
        return '/' . $this->value;
    }

    public function isEqual(self $other): bool {
        return $this === $other;
    }
}
```

### WordPress Options — `OptionNameType`

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Enums;

enum OptionNameType: string {
    case ApiToken = 'riseup_api_token';
    case Settings = 'riseup_settings';
    case LastSync = 'riseup_last_sync';

    public function isEqual(self $other): bool {
        return $this === $other;
    }
}
```

### WordPress Hooks — `HookType`

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Enums;

enum HookType: string {
    case PluginsLoaded = 'plugins_loaded';
    case AdminInit     = 'admin_init';
    case RestApiInit   = 'rest_api_init';
    case BeforeUpload  = 'riseup_before_upload';
    case AfterUpload   = 'riseup_after_upload';

    public function isEqual(self $other): bool {
        return $this === $other;
    }
}
```

### Operational Config — `SnapshotConfigType`, `UpdateConfigType`, `PaginationConfigType`

Numeric and sizing defaults are also backed enums with `int` backing:

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Enums;

enum SnapshotConfigType: int {
    case BatchSize       = 500;
    case RetentionDays   = 30;
    case MaxFileSizeBytes = 52428800; // 50 MB

    public function isEqual(self $other): bool {
        return $this === $other;
    }
}
```

### Private Class Constants

Values used only within a single class are defined as `private const`:

```php
class LogWriter {
    private const TIMESTAMP_FORMAT = 'Y-m-d\TH:i:s';
    private const SEPARATOR_WIDTH  = 80;
    private const MAX_CONTEXT_DEPTH = 3;
}
```

## Usage Examples

### REST Route Registration

```php
use RiseupAsia\Enums\PluginConfigType;
use RiseupAsia\Enums\EndpointType;

// ❌ WRONG — magic strings
register_rest_route('riseup-asia-uploader/v1', '/upload', [...]);

// ✅ CORRECT — enum values
$namespace = PluginConfigType::ApiBase->value . '/' . PluginConfigType::ApiVersion->value;

register_rest_route(
    $namespace,
    EndpointType::Upload->route(),
    [...],
);
```

### WordPress Options

```php
use RiseupAsia\Enums\OptionNameType;

// ❌ WRONG
update_option('riseup_api_token', $token);

// ✅ CORRECT
update_option(OptionNameType::ApiToken->value, $token);
```

### File Paths

```php
use RiseupAsia\Helpers\PathHelper;

// ❌ WRONG
$logPath = $uploadDir . '/riseup-asia-uploader/logs/log.txt';

// ✅ CORRECT
$logPath = PathHelper::logsDir() . '/log.txt';
```

### Hook Registration

```php
use RiseupAsia\Enums\HookType;

// ❌ WRONG
add_action('plugins_loaded', 'riseup_asia_init');

// ✅ CORRECT
add_action(HookType::PluginsLoaded->value, 'riseup_asia_init');
```

## Enum Exception: Property Defaults

Due to PHP language constraints, enum `->value` access is not permitted in constant expressions (property defaults, parameter defaults). This is the **only** accepted use of literal strings matching enum values:

```php
class Example {
    // PHP does not allow: private string $slug = PluginConfigType::Slug->value;
    // Literal is acceptable here:
    private string $slug = 'riseup-asia-uploader';
}
```

## Benefits of Backed Enums Over `define()`

| Feature | `define()` | Backed Enum |
|---|---|---|
| Type safety | ❌ Loose string | ✅ Strict enum type |
| IDE autocomplete | Partial | ✅ Full with `->value` |
| Namespace isolation | ❌ Global | ✅ PSR-4 namespaced |
| Grouping | ❌ Flat list | ✅ Domain-specific classes |
| Helper methods | ❌ None | ✅ `route()`, `isEqual()`, etc. |
| Pattern matching | ❌ N/A | ✅ `match()` expressions |
| Exhaustiveness checks | ❌ N/A | ✅ Compiler-enforced |
| Redefinition risk | ⚠️ Runtime error | ✅ Impossible |

## Environment-Specific Configuration

For sensitive or environment-specific values, use `wp-config.php` constants checked at runtime:

```php
class DebugConfig {
    public static function isDebug(): bool {
        return defined('RISEUP_DEBUG') && RISEUP_DEBUG;
    }

    /** @return list<string> */
    public static function getAllowedIps(): array {
        if (!defined('RISEUP_ALLOWED_IPS')) {
            return [];
        }

        return array_map('trim', explode(',', RISEUP_ALLOWED_IPS));
    }
}
```

These `wp-config.php` defines are the **only** acceptable use of `define()` — they are controlled by the hosting environment, not the plugin.
