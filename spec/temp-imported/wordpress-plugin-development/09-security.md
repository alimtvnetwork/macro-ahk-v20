# WordPress Plugin Security Best Practices

## Authentication

### Application Passwords (WordPress 5.6+)

The recommended method for REST API authentication:

```php
use RiseupAsia\Enums\WpErrorCodeType;
use WP_Error;
use WP_REST_Request;

public function checkPermission(WP_REST_Request $request): bool|WP_Error {
    $user = wp_get_current_user();
    $isUnauthenticated = !$user || $user->ID === 0;

    if ($isUnauthenticated) {
        $this->fileLogger->log('Permission denied: not authenticated', __FILE__, __LINE__);

        return new WP_Error(WpErrorCodeType::NotAuthenticated->value, 'Authentication required', ['status' => 401]);
    }

    if (!current_user_can('manage_options')) {
        return new WP_Error(WpErrorCodeType::InsufficientPermissions->value, 'Admin access required', ['status' => 403]);
    }

    return true;
}
```

### IP Whitelisting

For additional security on sensitive endpoints:

```php
namespace RiseupAsia\Security;

use RiseupAsia\Enums\OptionNameType;

class IpWhitelist {
    /** @var list<string> */
    private array $allowedIps;

    public function __construct() {
        $this->allowedIps = get_option(OptionNameType::AllowedIps->value, []);
    }

    public function isAllowed(string $ip): bool {
        if (empty($this->allowedIps)) {
            return true;
        }

        return in_array($ip, $this->allowedIps, true);
    }

    public function getClientIp(): string {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'REMOTE_ADDR',
        ];

        foreach ($headers as $header) {
            $ip = $this->extractIpFromHeader($header);

            if ($ip !== '') {
                return $ip;
            }
        }

        return '';
    }

    private function extractIpFromHeader(string $header): string {
        if (empty($_SERVER[$header])) {
            return '';
        }

        $ip = $_SERVER[$header];

        if (str_contains($ip, ',')) {
            $ip = trim(explode(',', $ip)[0]);
        }

        $validated = filter_var($ip, FILTER_VALIDATE_IP);

        return $validated !== false ? $validated : '';
    }
}
```

## Input Sanitization

### Always Sanitize User Input

```php
$name = sanitize_text_field($request->get_param('name'));
$email = sanitize_email($request->get_param('email'));
$url = esc_url_raw($request->get_param('url'));
$id = absint($request->get_param('id'));
$filename = sanitize_file_name($request->get_param('filename'));
$content = wp_kses_post($request->get_param('content'));
```

### Validation Before Use

```php
use WP_Error;
use WP_REST_Request;

public function validateUploadRequest(WP_REST_Request $request): bool|WP_Error {
    $errors = [];

    $slug = $request->get_param('slug');

    if (empty($slug)) {
        $errors[] = 'Slug is required';
    } elseif (!preg_match('/^[a-z0-9\-]+$/', $slug)) {
        $errors[] = 'Slug must contain only lowercase letters, numbers, and hyphens';
    }

    $files = $request->get_file_params();

    if (empty($files['plugin'])) {
        $errors[] = 'Plugin file is required';
    }

    if (!empty($errors)) {
        return new WP_Error(WpErrorCodeType::ValidationFailed->value, implode('. ', $errors), ['status' => 400]);
    }

    return true;
}
```

## Output Escaping

### Always Escape Output

```php
echo esc_html($variable);
echo '<input value="' . esc_attr($variable) . '">';
echo '<a href="' . esc_url($url) . '">';
echo '<script>var data = ' . wp_json_encode($data) . ';</script>';
```

## SQL Injection Prevention

### Always Use Prepared Statements

```php
use PDO;

// ❌ NEVER DO THIS
$sql = "SELECT * FROM users WHERE id = {$_GET['id']}";

// ✅ With PDO
$stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?");
$stmt->execute([$id]);

// ✅ With $wpdb
$results = $wpdb->get_results(
    $wpdb->prepare(
        "SELECT * FROM {$wpdb->prefix}users WHERE id = %d",
        $id,
    ),
);
```

## File Upload Security

### Validate File Uploads

```php
namespace RiseupAsia\Upload;

use RuntimeException;
use RiseupAsia\Enums\SnapshotConfigType;

class UploadValidator {
    /** @var list<string> */
    private const ALLOWED_EXTENSIONS = ['php', 'css', 'js', 'json', 'txt', 'md', 'pot'];

    public function validateFile(array $file): bool {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new RuntimeException('Upload error: ' . $this->getUploadError($file['error']));
        }

        $maxSize = SnapshotConfigType::MaxFileSizeBytes->value;

        if ($file['size'] > $maxSize) {
            throw new RuntimeException('File too large. Maximum: 50MB');
        }

        $extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        if (!in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            throw new RuntimeException('File type not allowed: ' . $extension);
        }

        if (!is_uploaded_file($file['tmp_name'])) {
            throw new RuntimeException('Invalid upload');
        }

        return true;
    }

    private function getUploadError(int $code): string {
        $errors = [
            UPLOAD_ERR_INI_SIZE => 'File exceeds upload_max_filesize',
            UPLOAD_ERR_FORM_SIZE => 'File exceeds MAX_FILE_SIZE',
            UPLOAD_ERR_PARTIAL => 'File partially uploaded',
            UPLOAD_ERR_NO_FILE => 'No file uploaded',
            UPLOAD_ERR_NO_TMP_DIR => 'Missing temp folder',
            UPLOAD_ERR_CANT_WRITE => 'Failed to write file',
            UPLOAD_ERR_EXTENSION => 'Upload stopped by extension',
        ];

        return $errors[$code] ?? 'Unknown error';
    }
}
```

## Directory Security

### Protect Plugin Data Directories

```php
use RiseupAsia\Helpers\PathHelper;

// Use PathHelper::makeDirectory with secure flag
PathHelper::makeDirectory($dataDir, secure: true);
// Automatically creates .htaccess and index.php
```

### Validate File Paths

```php
use RiseupAsia\Helpers\PathHelper;

public function validatePath(string $requestedPath, string $basePath): string|false {
    if (!PathHelper::isSafePath($requestedPath, $basePath)) {
        $this->fileLogger->error(
            sprintf('Path traversal attempt: %s', $requestedPath),
            __FILE__,
            __LINE__,
        );

        return false;
    }

    return realpath($requestedPath);
}
```

## CSRF Protection

### Use Nonces for Admin Actions

```php
$nonce = wp_create_nonce('riseup_upload_action');

echo '<input type="hidden" name="_wpnonce" value="' . esc_attr($nonce) . '">';

public function handleAdminAction(): void {
    if (!wp_verify_nonce($_POST['_wpnonce'], 'riseup_upload_action')) {
        wp_die('Security check failed');
    }

    // Process action...
}
```

## Rate Limiting

### Prevent Abuse

```php
namespace RiseupAsia\Security;

use RiseupAsia\Logging\FileLogger;

class RateLimiter {
    private const PREFIX = 'riseup_rate_';
    private int $limit;
    private int $window;

    public function __construct(
        int $limit = 60,
        int $window = 60,
    ) {
        $this->limit = $limit;
        $this->window = $window;
    }

    public function check(string $identifier): bool {
        $key = self::PREFIX . md5($identifier);
        $count = get_transient($key);

        if ($count === false) {
            set_transient($key, 1, $this->window);

            return true;
        }

        if ($count >= $this->limit) {
            $this->logRateLimit($identifier);

            return false;
        }

        set_transient($key, $count + 1, $this->window);

        return true;
    }

    private function logRateLimit(string $identifier): void {
        $logger = new FileLogger();
        $logger->log(
            sprintf('Rate limit exceeded for: %s', $identifier),
            __FILE__,
            __LINE__,
        );
    }
}
```

## Secure Token Generation

### API Tokens

```php
namespace RiseupAsia\Security;

class TokenManager {
    public function generateToken(): string {
        return bin2hex(random_bytes(32));
    }

    public function hashToken(string $token): string {
        return hash('sha256', $token);
    }

    public function verifyToken(string $provided, string $storedHash): bool {
        $providedHash = $this->hashToken($provided);

        return hash_equals($storedHash, $providedHash);
    }
}
```

## Logging Security Events

### Audit Trail

```php
public function logSecurityEvent(string $event, array $details = []): void {
    $this->fileLogger->log(
        sprintf('SECURITY: %s | %s', $event, wp_json_encode($details)),
        __FILE__,
        __LINE__,
    );
}

// Usage
$this->logSecurityEvent('login_failed', ['username' => $username]);
$this->logSecurityEvent('permission_denied', ['endpoint' => $route]);
$this->logSecurityEvent('rate_limit_hit', ['ip' => $ip]);
```

## Security Checklist

Before deploying, verify:

- [ ] All user input is sanitized
- [ ] All output is escaped
- [ ] SQL queries use prepared statements
- [ ] File uploads are validated
- [ ] Directory traversal is prevented
- [ ] Authentication is required for sensitive endpoints
- [ ] Rate limiting is implemented
- [ ] Security events are logged
- [ ] Nonces are used for admin actions
- [ ] Data directories are protected
