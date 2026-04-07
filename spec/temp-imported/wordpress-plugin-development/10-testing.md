# WordPress Plugin Testing Guide

## Manual Testing Checklist

### Pre-Deployment Testing

#### 1. Plugin Activation
- [ ] Plugin activates without errors
- [ ] No PHP warnings or notices in debug.log
- [ ] Database tables created correctly
- [ ] Log files created in correct location
- [ ] Admin notices display appropriately

#### 2. REST API Endpoints
- [ ] Health endpoint returns 200
- [ ] Authentication works with Application Passwords
- [ ] Unauthenticated requests are rejected (401)
- [ ] Invalid permissions return 403
- [ ] Rate limiting works correctly

#### 3. Database Operations
- [ ] Tables created on first activation
- [ ] Migrations run only once
- [ ] Data persists across plugin deactivation/reactivation
- [ ] Schema version tracked correctly

#### 4. Logging
- [ ] Log files created in wp-content/uploads/plugin-name/logs/
- [ ] Log entries include timestamps
- [ ] Log entries include file and line numbers
- [ ] Errors written to error.txt
- [ ] All operations logged to log.txt

#### 5. Error Handling
- [ ] Invalid requests return appropriate error codes
- [ ] Errors are logged before returning to client
- [ ] Plugin continues working after non-fatal errors
- [ ] Fatal errors logged to error.txt

### Testing Commands

#### Test Health Endpoint
```bash
curl -X GET "https://your-site.com/wp-json/riseup-asia-uploader/v1/health"
```

Expected response:
```json
{
    "status": "healthy",
    "version": "1.56.0",
    "timestamp": "2026-02-04T11:32:15Z"
}
```

#### Test Authenticated Endpoint
```bash
curl -X POST "https://your-site.com/wp-json/riseup-asia-uploader/v1/upload" \
    -u "admin:XXXX XXXX XXXX XXXX XXXX XXXX" \
    -F "plugin_zip=@plugin.zip"
```

#### Test Invalid Authentication
```bash
curl -X POST "https://your-site.com/wp-json/riseup-asia-uploader/v1/upload" \
    -u "admin:wrong-password"
```

Expected: 401 Unauthorized

## Log File Verification

### Check Log Creation
```bash
ls -la /path/to/wp-content/uploads/riseup-asia-uploader/logs/
```

### Verify Log Content
```bash
tail -50 /path/to/wp-content/uploads/riseup-asia-uploader/logs/log.txt
```

Expected format:
```
[2026-02-04T11:32:15.123Z] Plugin initialization starting (Plugin.php:45)
[2026-02-04T11:32:15.156Z] Database init starting (Database.php:67)
[2026-02-04T11:32:15.189Z] Running migration v1 (Database.php:142)
```

## WordPress Debug Mode

### Enable Debug Logging

In wp-config.php:
```php
define('WP_DEBUG', true);
define('WP_DEBUG_LOG', true);
define('WP_DEBUG_DISPLAY', false);
```

### Check Debug Log
```bash
tail -100 /path/to/wp-content/debug.log
```

## Database Testing

### Verify Tables Created
```php
use PDO;

$pdo = new PDO('sqlite:/path/to/uploads/riseup-asia-uploader/riseup-asia-uploader.db');
$result = $pdo->query("SELECT name FROM sqlite_master WHERE type='table'");
print_r($result->fetchAll());
```

### Check Schema Version
```php
use PDO;

$pdo = new PDO('sqlite:/path/to/uploads/riseup-asia-uploader/riseup-asia-uploader.db');
$result = $pdo->query("SELECT * FROM schema_version");
print_r($result->fetchAll());
```

## Common Issues and Solutions

### Issue: Plugin Causes White Screen

**Diagnosis:**
1. Enable WP_DEBUG in wp-config.php
2. Check debug.log
3. Check plugin's error.txt log

**Common Causes:**
- Calling WordPress functions in constructor
- Circular dependencies
- Missing autoloader registration

### Issue: REST Endpoints Not Registered

**Diagnosis:**
```bash
curl https://your-site.com/wp-json/
```

Check if your namespace appears in the routes list.

**Common Causes:**
- Endpoint registered during wrong hook
- Syntax error in route registration
- Permission callback returning error

### Issue: Database Not Created

**Diagnosis:**
1. Check log files for errors
2. Verify upload directory is writable
3. Check PDO SQLite extension is loaded

**Verification:**
```php
echo extension_loaded('pdo_sqlite') ? 'Yes' : 'No';
```

### Issue: Logs Not Created

**Diagnosis:**
1. Check directory permissions: `ls -la wp-content/uploads/`
2. Verify PHP can write:
```php
file_put_contents('/tmp/test.txt', 'test');
```

**Common Causes:**
- Upload directory not writable
- open_basedir restrictions
- SELinux preventing writes

## Automated Testing Setup

### PHPUnit for WordPress

```php
namespace RiseupAsia\Tests;

use WP_REST_Request;
use WP_UnitTestCase;
use RiseupAsia\Core\Plugin;
use RiseupAsia\Enums\PluginConfigType;

class PluginTest extends WP_UnitTestCase {
    public function testPluginLoaded(): void {
        $this->assertTrue(class_exists(Plugin::class));
    }

    public function testHealthEndpoint(): void {
        $namespace = PluginConfigType::ApiBase->value . '/' . PluginConfigType::ApiVersion->value;
        $request = new WP_REST_Request('GET', '/' . $namespace . '/health');
        $response = rest_do_request($request);

        $this->assertEquals(200, $response->get_status());
        $data = $response->get_data();
        $this->assertEquals('healthy', $data['status']);
    }
}
```

### Running Tests
```bash
./bin/install-wp-tests.sh wordpress_test root password localhost latest
./vendor/bin/phpunit
```

## Performance Testing

### Baseline Metrics

```php
use RiseupAsia\Enums\PluginConfigType;

add_action('shutdown', function(): void {
    $isDebugEnabled = defined('RISEUP_DEBUG') && RISEUP_DEBUG;

    if ($isDebugEnabled) {
        error_log(sprintf(
            '[%s] Memory: %s | Time: %ss',
            PluginConfigType::Slug->value,
            size_format(memory_get_peak_usage(true)),
            number_format(microtime(true) - $_SERVER['REQUEST_TIME_FLOAT'], 4),
        ));
    }
});
```

### Load Testing
```bash
ab -n 100 -c 10 "https://your-site.com/wp-json/riseup-asia-uploader/v1/health"
```

## Pre-Release Checklist

- [ ] All manual tests pass
- [ ] Log files show expected output
- [ ] No PHP warnings in debug.log
- [ ] Database migrations work on fresh install
- [ ] Database migrations work on upgrade
- [ ] Plugin works on PHP 8.2+
- [ ] Plugin works on PHP 8.3+
- [ ] Plugin works on WordPress 5.6
- [ ] Plugin works on latest WordPress
- [ ] All endpoints return expected responses
- [ ] Authentication works correctly
- [ ] Error handling tested
- [ ] Performance is acceptable
