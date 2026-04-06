# WordPress Plugin Error Handling

> **Version:** 3.0.0
> **Updated:** 2026-02-17

## Core Principle

> **Every operation that can fail MUST be wrapped in try-catch with logging.**
> **Always catch `Throwable`, not just `Exception`.**

Errors should never cause silent failures or unexplained crashes. Every error must be:
1. Caught (as `Throwable`)
2. Logged with context
3. Handled gracefully

---

## Try-Catch Pattern

### Rule: Catch `Throwable`, Not `Exception`

PHP 7+ introduces `Error` and `TypeError` that are **not** subclasses of `Exception`. Catching only `Exception` will miss fatal-class errors like missing classes, type mismatches, and division by zero.

```php
use Throwable;
use RiseupAsia\ErrorHandling\ErrorResponse;

// ❌ FORBIDDEN: Misses PHP 7+ Error types
try {
    $result = $manager->process();
} catch (Exception $e) {
    $this->fileLogger->error($e->getMessage(), __FILE__, __LINE__);
}

// ✅ REQUIRED: Catches all throwables
try {
    $result = $manager->process();
} catch (Throwable $e) {
    $this->fileLogger->logException($e, 'process_failed');
    wp_send_json_error([
        'message'          => $e->getMessage(),
        'stackTrace'       => $e->getTraceAsString(),
        'stackTraceFrames' => $this->formatStackFrames($e),
    ], 500);
}
```

### With Specific Exception Types

When you need to handle specific error types differently, catch them first, then catch `Throwable` as the final fallback:

```php
use PDOException;
use Throwable;

public function databaseOperation(): array {
    try {
        return $this->executeDatabaseQuery($sql, $params);
    } catch (PDOException $e) {
        $this->logDatabaseError($e);

        return [];
    } catch (Throwable $e) {
        $this->logUnexpectedError($e);

        throw $e;
    }
}

private function executeDatabaseQuery(string $sql, array $params): array {
    $pdo = $this->getPdo();
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    return $stmt->fetchAll();
}

private function logDatabaseError(PDOException $e): void {
    $this->fileLogger->error(
        sprintf('Database error [%s]: %s', $e->getCode(), $e->getMessage()),
        __FILE__,
        __LINE__,
    );
}

private function logUnexpectedError(Throwable $e): void {
    $this->fileLogger->error(
        sprintf('Unexpected error: %s', $e->getMessage()),
        __FILE__,
        __LINE__,
    );
}
```

---

## Safe Execute Wrapper

All REST endpoint handlers must be wrapped in `safeExecute`:

```php
use Throwable;
use WP_REST_Request;
use WP_REST_Response;

public function handleUpload(WP_REST_Request $request): WP_REST_Response {
    return $this->safeExecute(function() use ($request): WP_REST_Response {
        return $this->envelope->success($result);
    });
}

private function safeExecute(callable $callback): WP_REST_Response {
    try {
        return $callback();
    } catch (Throwable $e) {
        $this->logger->logException($e, 'endpoint_error');

        return $this->envelope->error($e->getMessage(), 500);
    }
}
```

---

## Fatal Error Handler — ErrorChecker

### Rule: Centralize Fatal Error Detection

Never write inline `in_array($error['type'], [E_ERROR, ...])` checks. Use `ErrorChecker::isFatalError()` which delegates to `ErrorTypeEnum::FATAL_TYPES`.

### ErrorChecker Implementation

```php
namespace RiseupAsia\ErrorHandling;

use RiseupAsia\Enums\ErrorTypeEnum;

class ErrorChecker {
    /** @param array<string, mixed>|null $error Value returned by error_get_last() */
    public static function isFatalError(?array $error): bool {
        if ($error === null) {
            return false;
        }

        return in_array($error['type'], ErrorTypeEnum::FATAL_TYPES, true);
    }

    /** @param array<string, mixed>|null $error */
    public static function isWarning(?array $error): bool {
        if ($error === null) {
            return false;
        }

        return in_array($error['type'], ErrorTypeEnum::WARNING_TYPES, true);
    }

    /** @param array<string, mixed>|null $error */
    public static function getSeverityLabel(?array $error): string {
        if (self::isFatalError($error)) {
            return 'fatal';
        }

        if (self::isWarning($error)) {
            return 'warning';
        }

        return 'unknown';
    }
}
```

### ErrorTypeEnum (Backing Constants)

```php
namespace RiseupAsia\Enums;

class ErrorTypeEnum {
    /** @var list<int> Error types that terminate PHP execution */
    public const FATAL_TYPES = [
        E_ERROR,
        E_PARSE,
        E_CORE_ERROR,
        E_COMPILE_ERROR,
    ];

    /** @var list<int> Warning-level error types (non-fatal, logged) */
    public const WARNING_TYPES = [
        E_WARNING,
        E_CORE_WARNING,
        E_NOTICE,
        E_DEPRECATED,
    ];
}
```

### Shutdown Handler Registration

```php
use RiseupAsia\ErrorHandling\ErrorChecker;

// ❌ FORBIDDEN: Inline error-type checking
register_shutdown_function(function(): void {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_CORE_ERROR, E_COMPILE_ERROR])) {
        // ...
    }
});

// ✅ REQUIRED: Use ErrorChecker for readable, centralized detection
register_shutdown_function(function(): void {
    $error = error_get_last();
    if (ErrorChecker::isFatalError($error)) {
        // Log to fatal-errors.log with memory usage
    }
});
```

### Complete Shutdown Handler

```php
namespace RiseupAsia\ErrorHandling;

use RiseupAsia\Enums\WpErrorCodeType;
use RiseupAsia\Helpers\PathHelper;

class FatalErrorHandler {
    public function register(): void {
        register_shutdown_function([$this, 'handleShutdown']);
    }

    public function handleShutdown(): void {
        $error = error_get_last();

        if (!ErrorChecker::isFatalError($error)) {
            return;
        }

        $this->logFatalError($error);

        if ($this->isRestRequest()) {
            $this->sendFatalJsonResponse($error);
        }
    }

    private function logFatalError(array $error): void {
        $severity = ErrorChecker::getSeverityLabel($error);
        $logPath = PathHelper::getFatalErrorLog();
        $timestamp = gmdate('Y-m-d\TH:i:s.') . sprintf('%03d', (int) ((microtime(true) * 1000) % 1000)) . 'Z';
        $memoryPeak = memory_get_peak_usage(true);

        $entry = sprintf(
            "[%s] [%s] %s in %s on line %d | Memory peak: %s\n",
            $timestamp,
            strtoupper($severity),
            $error['message'],
            $error['file'],
            $error['line'],
            size_format($memoryPeak),
        );

        @file_put_contents($logPath, $entry, FILE_APPEND | LOCK_EX);
    }

    private function sendFatalJsonResponse(array $error): void {
        @header('Content-Type: application/json; charset=utf-8');
        echo wp_json_encode([
            'success' => false,
            'error' => [
                'code'    => WpErrorCodeType::FatalError->value,
                'message' => 'A fatal error occurred',
                'file'    => basename($error['file']),
                'line'    => $error['line'],
            ],
        ]);
    }

    private function isRestRequest(): bool {
        return defined('REST_REQUEST') && REST_REQUEST;
    }
}
```

---

## Operations That MUST Have Error Handling

### 1. Database Operations

```php
use PDOException;
use Throwable;

public function insertRecord(array $data): int|false {
    $this->fileLogger->log(
        sprintf('Inserting record into %s', $tableName),
        __FILE__,
        __LINE__,
    );

    try {
        return $this->executeInsert($sql, $values);
    } catch (PDOException $e) {
        $this->logInsertError($e, $sql);

        return false;
    } catch (Throwable $e) {
        $this->logUnexpectedInsertError($e);

        return false;
    }
}

private function executeInsert(string $sql, array $values): int {
    $pdo = $this->db->getPdo();
    $stmt = $pdo->prepare($sql);
    $stmt->execute($values);

    $id = (int) $pdo->lastInsertId();
    $this->fileLogger->log(sprintf('Inserted record ID: %d', $id), __FILE__, __LINE__);

    return $id;
}

private function logInsertError(PDOException $e, string $sql): void {
    $this->fileLogger->error(
        sprintf('Insert failed: %s | SQL: %s', $e->getMessage(), $sql),
        __FILE__,
        __LINE__,
    );
}

private function logUnexpectedInsertError(Throwable $e): void {
    $this->fileLogger->error(
        sprintf('Unexpected insert error: %s', $e->getMessage()),
        __FILE__,
        __LINE__,
    );
}
```

### 2. File Operations

```php
use RuntimeException;
use Throwable;
use RiseupAsia\Helpers\PathHelper;

public function saveFile(string $path, string $content): bool {
    $this->fileLogger->log(sprintf('Saving file: %s', $path), __FILE__, __LINE__);

    try {
        $this->ensureParentDirectory($path);
        $bytes = $this->writeFileContent($path, $content);
        $this->fileLogger->log(sprintf('Saved %d bytes to %s', $bytes, $path), __FILE__, __LINE__);

        return true;
    } catch (Throwable $e) {
        $this->fileLogger->error($e->getMessage(), __FILE__, __LINE__);

        return false;
    }
}

private function ensureParentDirectory(string $path): void {
    $dir = dirname($path);

    if (PathHelper::isDirMissing($dir) && !@mkdir($dir, 0755, true)) {
        throw new RuntimeException("Failed to create directory: {$dir}");
    }
}

private function writeFileContent(string $path, string $content): int {
    $bytes = @file_put_contents($path, $content, LOCK_EX);

    if ($bytes === false) {
        throw new RuntimeException("Failed to write file: {$path}");
    }

    return $bytes;
}
```

### 3. External API Calls

```php
use RuntimeException;
use Throwable;

public function callExternalApi(string $url, array $data): ?array {
    $this->fileLogger->log(sprintf('API request: POST %s', $url), __FILE__, __LINE__);

    try {
        $response = $this->sendPostRequest($url, $data);
        $this->validateApiResponse($response);

        return json_decode(wp_remote_retrieve_body($response), true);
    } catch (Throwable $e) {
        $this->fileLogger->error(
            sprintf('API call failed: %s', $e->getMessage()),
            __FILE__,
            __LINE__,
        );

        return null;
    }
}

private function sendPostRequest(string $url, array $data): array {
    $response = wp_remote_post($url, [
        'body' => wp_json_encode($data),
        'headers' => ['Content-Type' => 'application/json'],
        'timeout' => 30,
    ]);

    if (is_wp_error($response)) {
        throw new RuntimeException($response->get_error_message());
    }

    return $response;
}

private function validateApiResponse(array $response): void {
    $code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);

    $this->fileLogger->log(
        sprintf('API response: %d | Body length: %d', $code, strlen($body)),
        __FILE__,
        __LINE__,
    );

    if ($code >= 400) {
        throw new RuntimeException("API error {$code}: {$body}");
    }
}
```

### 4. Plugin Initialization

```php
use Throwable;
use RiseupAsia\Database\Database;
use RiseupAsia\Enums\HookType;
use RiseupAsia\Enums\PluginConfigType;

public function init(): void {
    $this->fileLogger->log('Plugin initialization starting', __FILE__, __LINE__);

    try {
        $this->db = Database::getInstance();
        $this->db->init();

        $this->logger = new Logger($this->fileLogger);

        $this->fileLogger->log('Plugin initialized successfully', __FILE__, __LINE__);
    } catch (Throwable $e) {
        $this->fileLogger->error(
            sprintf('Plugin initialization failed: %s', $e->getMessage()),
            __FILE__,
            __LINE__,
        );

        add_action(HookType::AdminNotices->value, [$this, 'showInitErrorNotice']);
    }
}

public function showInitErrorNotice(): void {
    echo '<div class="notice notice-error">';
    echo '<p><strong>' . esc_html(PluginConfigType::Name->value) . ':</strong> ';
    echo 'Failed to initialize. Please check the error logs.</p>';
    echo '</div>';
}
```

---

## Graceful Degradation

When errors occur, the plugin should:
1. Log the error with full context
2. Return a safe default value
3. Continue operating in a degraded mode if possible
4. Notify the admin of issues

### Example: Database Unavailable

```php
namespace RiseupAsia\Logging;

use Throwable;
use RiseupAsia\Database\Database;

class Logger {
    private ?Database $db = null;
    private bool $isDbAvailable = true;

    public function __construct(
        private readonly FileLogger $fileLogger,
    ) {}

    private function getDb(): ?Database {
        if (!$this->isDbAvailable) {
            return null;
        }

        if ($this->db === null) {
            $this->db = $this->attemptDbConnection();
        }

        return $this->db;
    }

    private function attemptDbConnection(): ?Database {
        try {
            return Database::getInstance();
        } catch (Throwable $e) {
            $this->fileLogger->error(
                'Database unavailable, falling back to file-only logging',
                __FILE__,
                __LINE__,
            );
            $this->isDbAvailable = false;

            return null;
        }
    }

    public function log(string $message, string $level = 'INFO'): void {
        $this->fileLogger->log("[{$level}] {$message}", __FILE__, __LINE__);

        $db = $this->getDb();
        $isDbReady = $db !== null && $db->isReady();

        if ($isDbReady) {
            try {
                $db->insertLog($message, $level);
            } catch (Throwable) {
                // Silently fail — already logged to file
            }
        }
    }
}
```

---

## REST API Error Responses

### Standard Error Format

```php
use Throwable;
use WP_REST_Request;
use WP_REST_Response;

public function handleRequest(WP_REST_Request $request): WP_REST_Response {
    return $this->safeExecute(function() use ($request): WP_REST_Response {
        $result = $this->processRequest($request);

        return new WP_REST_Response([
            'success' => true,
            'data' => $result,
        ], 200);
    });
}
```

For cases where you need specific HTTP status codes per exception type:

```php
use RiseupAsia\Enums\WpErrorCodeType;
use Throwable;
use WP_REST_Request;
use WP_REST_Response;

public function handleRequest(WP_REST_Request $request): WP_REST_Response {
    try {
        $result = $this->processRequest($request);

        return new WP_REST_Response([
            'success' => true,
            'data' => $result,
        ], 200);
    } catch (ValidationException $e) {
        return $this->envelope->error($e->getMessage(), 400, WpErrorCodeType::ValidationError->value);
    } catch (AuthenticationException $e) {
        return $this->envelope->error($e->getMessage(), 401, WpErrorCodeType::AuthenticationFailed->value);
    } catch (Throwable $e) {
        return $this->handleUnexpectedError($e);
    }
}

private function handleUnexpectedError(Throwable $e): WP_REST_Response {
    $this->fileLogger->error(
        sprintf('Unhandled error in API: %s', $e->getMessage()),
        __FILE__,
        __LINE__,
    );

    return $this->envelope->error('An unexpected error occurred', 500);
}
```

---

## Logging Stack Traces

For serious errors, capture dual outputs:

```php
use Throwable;
use RiseupAsia\Helpers\PathHelper;

public function logException(Throwable $e, string $context = ''): void {
    $this->writeStacktraceFile($e);
    $this->writeErrorEntry($e, $context);
}

private function writeStacktraceFile(Throwable $e): void {
    $backtrace = debug_backtrace(0, 0);
    $stacktracePath = PathHelper::getStacktraceFile();

    @file_put_contents($stacktracePath, $this->formatBacktrace($backtrace), FILE_APPEND);
}

private function writeErrorEntry(Throwable $e, string $context): void {
    $errorPath = PathHelper::getErrorFile();
    $entry = sprintf(
        "[%s] [%s] %s: %s\n  File: %s:%d\n  Trace: %s\n",
        gmdate('c'),
        $context,
        get_class($e),
        $e->getMessage(),
        $e->getFile(),
        $e->getLine(),
        $e->getTraceAsString(),
    );

    @file_put_contents($errorPath, $entry, FILE_APPEND | LOCK_EX);
}
```

---

## Common Error Scenarios

### 1. Missing Directory Permissions

```php
use RiseupAsia\Helpers\PathHelper;
use RuntimeException;

if (PathHelper::isDirReadonly($dir)) {
    $this->fileLogger->error(sprintf('Directory not writable: %s', $dir), __FILE__, __LINE__);

    throw new RuntimeException("Cannot write to directory: {$dir}");
}
```

### 2. Database Connection Failed

```php
use PDO;
use PDOException;
use RuntimeException;
use RiseupAsia\Helpers\PathHelper;

try {
    $dbPath = PathHelper::getRootDb();
    $this->pdo = new PDO('sqlite:' . $dbPath);
} catch (PDOException $e) {
    $this->fileLogger->error(
        sprintf('Database connection failed: %s | Path: %s', $e->getMessage(), $dbPath),
        __FILE__,
        __LINE__,
    );

    throw new RuntimeException('Database connection failed. Check logs for details.');
}
```

### 3. Invalid JSON Data

```php
use RuntimeException;

$data = json_decode($json, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    $this->fileLogger->error(
        sprintf('JSON decode failed: %s | Input: %s', json_last_error_msg(), substr($json, 0, 100)),
        __FILE__,
        __LINE__,
    );

    throw new RuntimeException('Invalid JSON data');
}
```

---

## Forbidden Patterns

| Pattern | Why | Required Alternative |
|---------|-----|---------------------|
| `catch (Exception $e)` | Misses `Error`, `TypeError` | `catch (Throwable $e)` |
| Inline `in_array($error['type'], [...])` | Duplicated, hard to read | `ErrorChecker::isFatalError()` |
| `$db_available` (no prefix) | Ambiguous boolean name | `$isDbAvailable` |
| `error_log()` | No structure | `$this->fileLogger->error()` |
| Magic string paths in error logs | Fragile | `PathHelper::getFatalErrorLog()` |
| `wp_die()` in REST handlers | Breaks JSON responses | `wp_send_json_error()` or envelope |
| `add_action('admin_notices', ...)` | Magic string hook | `add_action(HookType::AdminNotices->value, ...)` |

---

## Cross-References

- [PHP Coding Standards](../../08-coding-guidelines/php-standards/readme.md) — ErrorChecker, safeExecute, boolean rules
- [PHP Enum Spec](../../08-coding-guidelines/php-standards/enums.md) — ErrorTypeEnum, HookType full listings
- [Error Handling Cross-Stack](../error-management/01-error-handling/readme.md) — Three-tier error architecture
- [WordPress Initialization](./01-initialization-patterns.md) — Shutdown handler registration timing

---

*WordPress Error Handling v3.0.0 — 2026-02-17*
