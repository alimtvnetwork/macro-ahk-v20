# Path Handling Standards

**Version:** 3.0.0
**Updated:** 2026-02-17
**Applies To:** PHP (WordPress Plugin), Go (Backend)

---

## 1. Core Principles

### 1.1 Enum-Based Path Origins

All base paths MUST originate from backed enums or `PathHelper` methods. Never hardcode directory names inline.

**PHP:** `RiseupAsia\Helpers\PathHelper` provides all path resolution methods.

**Go:** `internal/pathutil/` package with `ToAbsolute()`, `ForDisplay()`.

### 1.2 Centralized Path Joining

Never use raw string concatenation for paths. Always use `PathHelper`:

```php
use RiseupAsia\Helpers\PathHelper;

// ✅ CORRECT
$snapshotFile = PathHelper::join($snapshotsDir, $filename);

// ❌ WRONG — raw concatenation
$badPath = WP_CONTENT_DIR . '/uploads/riseup-asia-uploader/snapshots/' . $filename;
```

### 1.3 Validate Before Use

Before any file operation (read, write, list), validate that:
1. The directory exists (or create it)
2. The directory is writable (for write operations)
3. Log any failures with full context

---

## 2. PHP Implementation

### 2.1 PathHelper Class

Located at: `wp-plugins/riseup-asia-uploader/includes/Helpers/PathHelper.php`
Namespace: `RiseupAsia\Helpers`

```php
class PathHelper {
    // Core path operations (via PathHelperCoreTrait)
    public static function join(string ...$segments): string;
    public static function makeDirectory(string $path, bool $secure = false): bool;
    public static function makePath(bool $secure, string ...$segments): string|false;
    public static function getBaseDir(): string;
    public static function isSafePath(string $path, string $basePath): bool;

    // Semantic directory guards (via PathHelperDirTrait)
    public static function isDirExists(string $dirPath): bool;
    public static function isDirMissing(string $dirPath): bool;
    public static function isDirWritable(string $dirPath): bool;
    public static function isDirReadonly(string $dirPath): bool;
    public static function isDirEmpty(string $dirPath): bool;

    // Semantic file guards (via PathHelperFileTrait)
    public static function isFileExists(string $filePath): bool;
    public static function isFileMissing(string $filePath): bool;
    public static function isFileUnreadable(string $filePath): bool;
    public static function isIrregularPath(string $filePath): bool;
    public static function isCopyFailed(string $source, string $dest): bool;
}
```

### 2.2 Usage Pattern

```php
use RiseupAsia\Helpers\PathHelper;

// CORRECT: Guard with isDirMissing — single semantic call
$snapshotsDir = PathHelper::getSnapshotsDir();

if (!PathHelper::makeDirectory($snapshotsDir)) {
    $this->logger->error('Failed to create snapshots directory');

    return false;
}

$snapshotFile = PathHelper::join($snapshotsDir, $filename);

// INCORRECT: Raw concatenation
$badPath = WP_CONTENT_DIR . '/uploads/riseup-asia-uploader/snapshots/' . $filename;
```

### 2.3 Error Logging Requirements

Every path operation failure MUST log:
- The operation attempted (create, read, write, delete)
- The full path involved
- The error message from PHP
- Any relevant context (permissions, disk space, etc.)

```php
if (!@mkdir($path, 0755, true)) {
    $error = error_get_last();
    $this->logger->error('Directory creation failed', [
        'path' => $path,
        'error' => $error ? $error['message'] : 'Unknown error',
        'operation' => 'mkdir',
        'permissions' => decoct(fileperms(dirname($path)) & 0777),
    ]);

    return false;
}
```

---

## 3. Go Implementation

### 3.1 Path Utility Package

Located at: `backend/internal/pathutil/pathutil.go`

Already exists with:
- `ToAbsolute()` — Resolve and normalize paths
- `ForDisplay()` — Format for logging
- Windows long path support (`\\?\` prefix)

### 3.2 Additional Requirements

```go
func EnsureDir(path string, log *logger.Logger) error {
    absPath, err := pathutil.ToAbsolute(path)
    if err != nil {
        log.Error("path resolution failed",
            "path", path,
            "error", err)

        return err
    }

    if err := os.MkdirAll(absPath, 0755); err != nil {
        log.Error("directory creation failed",
            "path", absPath,
            "error", err)

        return err
    }

    log.Debug("directory ensured", "path", absPath)

    return nil
}
```

---

## 4. Security Considerations

### 4.1 Path Traversal Prevention

Always validate paths don't escape their intended boundaries:

```php
public static function isSafePath(string $path, string $basePath): bool {
    $realBase = realpath($basePath);
    $realPath = realpath($path);

    if ($realPath === false) {
        $realPath = realpath(dirname($path));
    }

    if ($realPath === false) {
        return false;
    }

    return str_starts_with($realPath, $realBase);
}
```

### 4.2 Protected Directories

Directories containing sensitive data must have:
- `.htaccess` with `Deny from all`
- `index.php` with `// Silence is golden`
- Proper file permissions (0755 for dirs, 0644 for files)

---

## 5. Logging Format

Path-related log entries must follow this format:

```
[TIMESTAMP] [LEVEL] [PATH] Operation: {op}, Path: {path}, Result: {result}
```

Examples:
```
[2026-02-06 14:30:22] [INFO] [PATH] Directory created: /snapshots, secure: true
[2026-02-06 14:30:22] [ERROR] [PATH] mkdir failed: /snapshots, error: Permission denied
[2026-02-06 14:30:22] [DEBUG] [PATH] Path validated: /snapshots/001.sqlite, safe: true
```

---

## 6. Checklist for Path Operations

Before any path operation:

- [ ] Base path comes from `PathHelper` or a backed enum
- [ ] Path is joined using `PathHelper::join()`
- [ ] Directory existence is validated
- [ ] Directory is created if missing
- [ ] Security files added (if sensitive)
- [ ] Failure is logged with context
- [ ] Path traversal is prevented

---

*Specification Version: 3.0.0*
*Last Updated: 2026-02-17*
