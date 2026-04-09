# WordPress Plugin File Structure Standards

## Standard Directory Layout

```
my-plugin/
├── my-plugin.php              # Main entry point (same name as folder)
├── readme.md                  # Documentation
├── changelog.md               # Version history
├── LICENSE                    # License file
│
├── includes/                  # PSR-4 root (RiseupAsia\ namespace)
│   ├── Autoloader.php         # PSR-4 autoloader — only manual require_once
│   ├── Core/
│   │   └── Plugin.php         # Main plugin class (singleton)
│   ├── Admin/
│   │   └── Admin.php          # Admin interface
│   ├── Activation/
│   │   └── ActivationHandler.php
│   ├── Enums/                 # Backed enums (HookType, EndpointType, etc.)
│   ├── Helpers/               # Utility classes (PathHelper, BooleanHelpers)
│   ├── Logging/               # FileLogger, Logger
│   ├── Database/              # Orm, Database, FileCache
│   ├── ErrorHandling/         # FatalErrorHandler, FrameBuilder, ErrorResponse
│   └── ...                    # Other namespaced subdirectories
│
├── assets/                    # Static assets
│   ├── css/
│   │   └── admin.css
│   └── js/
│       └── admin.js
│
├── data/                      # Runtime data (git-ignored)
│   └── .gitkeep
│
└── languages/                 # Translations (optional)
    └── my-plugin.pot
```

## File Naming Conventions

### Class Files (PSR-4)
- Name: PascalCase matching the class name
- One class per file
- Directory structure mirrors namespace hierarchy

```
includes/Logging/FileLogger.php    → RiseupAsia\Logging\FileLogger
includes/Database/Database.php     → RiseupAsia\Database\Database
includes/Post/PostManager.php      → RiseupAsia\Post\PostManager
includes/Helpers/PathHelper.php    → RiseupAsia\Helpers\PathHelper
includes/Enums/HookType.php       → RiseupAsia\Enums\HookType
```

### Class Naming
- Fully namespaced under `RiseupAsia\`
- PascalCase, no prefix needed (namespace provides scope)
- Helper/utility classes use `Helper` suffix (not `Utils`)

```php
namespace RiseupAsia\Logging;
class FileLogger { }

namespace RiseupAsia\Database;
class Database { }

namespace RiseupAsia\Helpers;
class PathHelper { }
```

### Main Plugin File

The main plugin file MUST:
1. Have the same name as the plugin folder
2. Contain the plugin header comment
3. Register the PSR-4 autoloader (the **only** `require_once`)
4. Register the activation hook
5. Initialize the plugin via a `plugins_loaded` hook

**No manual `require_once` statements for classes are permitted** — the autoloader resolves all `RiseupAsia\` classes automatically.

```php
<?php
/**
 * Plugin Name: Riseup Asia Uploader
 * Version: 1.56.0
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

## Dependency Resolution

All classes are resolved via the PSR-4 autoloader. **Manual `require_once` and `DependencyLoader::loadManifest()` are prohibited** in the entry file.

- The autoloader maps the `RiseupAsia\` namespace to the `includes/` directory.
- Missing classes trigger a "Class not found" fatal error, caught by `FatalErrorHandler`'s registered shutdown function.
- `DependencyLoader` remains available as a utility for test harnesses or edge-case scenarios but is **not used** during normal plugin bootstrap.

## Data Directory

The `data/` directory stores runtime files during development:

```
data/
├── .gitkeep               # Ensures folder is in git
└── (runtime files)        # Ignored by git
```

**.gitignore entry:**
```
/data/*
!/data/.gitkeep
```

**Note:** Production data should be stored in `wp-content/uploads/plugin-slug/`, not in the plugin directory.

## Assets Directory

```
assets/
├── css/
│   ├── admin.css          # Admin styles
│   └── public.css         # Frontend styles (if any)
└── js/
    ├── admin.js           # Admin scripts
    └── public.js          # Frontend scripts (if any)
```

### Enqueue Assets Properly

```php
namespace RiseupAsia\Admin;

use RiseupAsia\Enums\PluginConfigType;
use RiseupAsia\Helpers\PathHelper;

class Admin {
    public function enqueueAdminAssets(string $hook): void {
        $isOurPage = str_contains($hook, 'riseup');

        if (!$isOurPage) {
            return;
        }

        wp_enqueue_style(
            'riseup-admin',
            PathHelper::pluginUrl() . 'assets/css/admin.css',
            [],
            PluginConfigType::Version->value,
        );

        wp_enqueue_script(
            'riseup-admin',
            PathHelper::pluginUrl() . 'assets/js/admin.js',
            ['jquery'],
            PluginConfigType::Version->value,
            true,
        );
    }
}
```

## Admin Views

Keep HTML templates separate from PHP logic:

```php
namespace RiseupAsia\Admin;

use RiseupAsia\Enums\PluginConfigType;

class AdminUi {
    public function renderDashboard(): void {
        $data = $this->getDashboardData();
        include PathHelper::pluginDir() . 'admin/views/dashboard.php';
    }
}

// admin/views/dashboard.php
<?php
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="wrap">
    <h1><?php echo esc_html(PluginConfigType::Name->value); ?></h1>
    <p>Version: <?php echo esc_html(PluginConfigType::Version->value); ?></p>
</div>
```

## Scaling Up

As the plugin grows, add namespaced subdirectories — the PSR-4 autoloader resolves them automatically:

```
includes/                       # RiseupAsia\ namespace root
├── Autoloader.php
├── Core/Plugin.php
├── Admin/Admin.php
├── Database/
│   ├── Database.php
│   ├── Orm.php
│   └── FileCache.php
├── Logging/
│   ├── FileLogger.php
│   └── Logger.php
├── Post/PostManager.php
├── Upload/UploadIgnore.php
├── Snapshot/
│   ├── SnapshotManager.php
│   └── ...
├── Helpers/
│   ├── PathHelper.php
│   ├── BooleanHelpers.php
│   └── EnvelopeBuilder.php
└── Enums/
    ├── HookType.php
    ├── EndpointType.php
    ├── PluginConfigType.php
    └── ...
```
