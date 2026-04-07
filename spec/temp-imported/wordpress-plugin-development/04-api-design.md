# WordPress REST API Design Standards

## Overview

WordPress plugins should use the REST API for external communication. This provides:
- Standardized HTTP endpoints
- Built-in authentication
- Permission callbacks
- JSON request/response handling

## API Namespace Convention

```php
use RiseupAsia\Enums\PluginConfigType;
use RiseupAsia\Enums\EndpointType;

// Namespace built from enum values
$namespace = PluginConfigType::ApiBase->value . '/' . PluginConfigType::ApiVersion->value;
// Result: 'riseup-asia-uploader/v1'
```

## Route Registration Pattern

Register routes during `rest_api_init` hook:

```php
namespace RiseupAsia\Api;

use WP_Error;
use WP_REST_Request;
use WP_REST_Response;
use RiseupAsia\Enums\HookType;
use RiseupAsia\Enums\EndpointType;
use RiseupAsia\Enums\HttpMethodType;
use RiseupAsia\Enums\PluginConfigType;
use RiseupAsia\Logging\FileLogger;

class RouteRegistrar {
    private FileLogger $fileLogger;
    private string $namespace;

    public function __construct(private readonly FileLogger $logger) {
        $this->fileLogger = $logger;
        $this->namespace = PluginConfigType::ApiBase->value . '/' . PluginConfigType::ApiVersion->value;
    }

    public function register(): void {
        add_action(HookType::RestApiInit->value, [$this, 'registerRoutes']);
    }

    public function registerRoutes(): void {
        $this->fileLogger->log('Registering REST routes', __FILE__, __LINE__);

        register_rest_route(
            $this->namespace,
            EndpointType::Health->route(),
            [
                'methods' => HttpMethodType::Get->value,
                'callback' => [$this, 'handleHealth'],
                'permission_callback' => '__return_true',
            ],
        );

        register_rest_route(
            $this->namespace,
            EndpointType::Upload->route(),
            [
                'methods' => HttpMethodType::Post->value,
                'callback' => [$this, 'handleUpload'],
                'permission_callback' => [$this, 'checkUploadPermission'],
            ],
        );

        $this->fileLogger->log('REST routes registered', __FILE__, __LINE__);
    }
}
```

## Endpoint Naming Standards

### DO
```
/riseup-asia-uploader/v1/health          # Health check
/riseup-asia-uploader/v1/upload          # Upload files
/riseup-asia-uploader/v1/plugins         # List plugins
/riseup-asia-uploader/v1/sync            # Sync operation
```

### DON'T
```
/riseup-asia-uploader/v1/getHealth       # Don't prefix with HTTP verb
/riseup-asia-uploader/v1/plugin_list     # Don't use underscores
/riseup-asia-uploader/v1/doUpload        # Don't use action prefixes
```

## Plain String Endpoints (Avoid Regex)

**Critical**: Always use plain string endpoints, NOT regex patterns.

```php
// ❌ WRONG — Regex patterns are error-prone
register_rest_route(
    'riseup-asia-uploader/v1',
    '/plugins/(?P<id>\d+)',
    [...],
);

// ✅ CORRECT — Use EndpointType enum with route() helper
register_rest_route(
    $this->namespace,
    EndpointType::Plugins->route(),
    [
        'methods' => HttpMethodType::Get->value,
        'callback' => [$this, 'handleListPlugins'],
        'permission_callback' => [$this, 'checkPermission'],
    ],
);
```

## Permission Callbacks

### Public Endpoints
```php
'permission_callback' => '__return_true',
```

### Authenticated Endpoints (Application Passwords)
```php
use RiseupAsia\Enums\WpErrorCodeType;
use WP_Error;
use WP_REST_Request;

public function checkPermission(WP_REST_Request $request): bool|WP_Error {
    $user = wp_get_current_user();
    $isUnauthenticated = !$user || $user->ID === 0;

    if ($isUnauthenticated) {
        $this->fileLogger->log('Permission denied: not authenticated', __FILE__, __LINE__);

        return new WP_Error(
            WpErrorCodeType::RestForbidden->value,
            'Authentication required',
            ['status' => 401],
        );
    }

    if (!current_user_can('manage_options')) {
        $this->fileLogger->log(
            sprintf('Permission denied: user %d lacks capability', $user->ID),
            __FILE__,
            __LINE__,
        );

        return new WP_Error(
            WpErrorCodeType::RestForbidden->value,
            'Insufficient permissions',
            ['status' => 403],
        );
    }

    return true;
}
```

### IP Whitelist + Auth
```php
public function checkPermissionWithIp(WP_REST_Request $request): bool|WP_Error {
    $clientIp = $_SERVER['REMOTE_ADDR'] ?? '';
    $allowedIps = get_option('riseup_allowed_ips', []);
    $isIpBlocked = !empty($allowedIps) && !in_array($clientIp, $allowedIps, true);

    if ($isIpBlocked) {
        $this->fileLogger->log(
            sprintf('Permission denied: IP %s not whitelisted', $clientIp),
            __FILE__,
            __LINE__,
        );

        return new WP_Error(
            WpErrorCodeType::RestForbidden->value,
            'IP not allowed',
            ['status' => 403],
        );
    }

    return $this->checkPermission($request);
}
```

## Request Handlers

### Standard Response Format

```php
use WP_REST_Request;
use WP_REST_Response;
use RiseupAsia\Enums\PluginConfigType;

public function handleHealth(WP_REST_Request $request): WP_REST_Response {
    $this->fileLogger->log('Health check requested', __FILE__, __LINE__);

    return new WP_REST_Response([
        'status' => 'healthy',
        'version' => PluginConfigType::Version->value,
        'timestamp' => gmdate('c'),
    ], 200);
}
```

### Error Response Format

```php
use RiseupAsia\Enums\WpErrorCodeType;
use Throwable;
use WP_REST_Request;
use WP_REST_Response;

public function handleUpload(WP_REST_Request $request): WP_REST_Response {
    $this->fileLogger->log('Upload requested', __FILE__, __LINE__);

    try {
        // Process upload...

        return new WP_REST_Response([
            'success' => true,
            'message' => 'File uploaded successfully',
            'data' => [
                'filename' => $filename,
                'size' => $size,
            ],
        ], 200);
    } catch (Throwable $e) {
        $this->fileLogger->error(
            sprintf('Upload failed: %s', $e->getMessage()),
            __FILE__,
            __LINE__,
        );

        return new WP_REST_Response([
            'success' => false,
            'error' => [
                'code' => WpErrorCodeType::UploadFailed->value,
                'message' => $e->getMessage(),
            ],
        ], 500);
    }
}
```

### Input Validation

```php
register_rest_route(
    $this->namespace,
    EndpointType::Update->route(),
    [
        'methods' => HttpMethodType::Post->value,
        'callback' => [$this, 'handleUpdate'],
        'permission_callback' => [$this, 'checkPermission'],
        'args' => [
            'name' => [
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => fn(string $value): bool => strlen($value) >= 3 && strlen($value) <= 100,
            ],
            'status' => [
                'required' => false,
                'type' => 'string',
                'enum' => ['active', 'inactive', 'pending'],
                'default' => 'pending',
            ],
            'priority' => [
                'required' => false,
                'type' => 'integer',
                'minimum' => 1,
                'maximum' => 100,
                'default' => 50,
            ],
        ],
    ],
);
```

## Authentication Methods

### 1. Application Passwords (Recommended)

WordPress 5.6+ supports Application Passwords natively:

```php
// Client sends Basic Auth header
// Authorization: Basic base64(username:application_password)

// WordPress handles authentication automatically
// Just check if user is logged in
public function checkPermission(WP_REST_Request $request): bool {
    return is_user_logged_in() && current_user_can('manage_options');
}
```

### 2. Custom Token (for backward compatibility)

```php
use RiseupAsia\Enums\OptionNameType;
use RiseupAsia\Enums\WpErrorCodeType;
use WP_Error;
use WP_REST_Request;

public function checkTokenPermission(WP_REST_Request $request): bool|WP_Error {
    $token = $request->get_header('X-API-Token');

    if (empty($token)) {
        return new WP_Error(WpErrorCodeType::NoToken->value, 'API token required', ['status' => 401]);
    }

    $storedToken = get_option(OptionNameType::ApiToken->value);

    $isTokenMismatch = !hash_equals($storedToken, $token);

    if ($isTokenMismatch) {
        return new WP_Error(WpErrorCodeType::InvalidToken->value, 'Invalid API token', ['status' => 403]);
    }

    return true;
}
```

## Rate Limiting

```php
namespace RiseupAsia\Security;

use WP_Error;
use WP_REST_Request;

class RateLimiter {
    private const PREFIX = 'riseup_rate_';
    private const DEFAULT_LIMIT = 60;
    private const DEFAULT_WINDOW = 60;

    public function check(string $identifier): bool {
        $key = self::PREFIX . md5($identifier);
        $count = get_transient($key) ?: 0;

        if ($count >= self::DEFAULT_LIMIT) {
            return false;
        }

        set_transient($key, $count + 1, self::DEFAULT_WINDOW);

        return true;
    }
}

// In permission callback
public function checkPermission(WP_REST_Request $request): bool|WP_Error {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';

    if (!$this->rateLimiter->check($ip)) {
        return new WP_Error(
            WpErrorCodeType::RateLimited->value,
            'Too many requests',
            ['status' => 429],
        );
    }

    return $this->checkAuth($request);
}
```
