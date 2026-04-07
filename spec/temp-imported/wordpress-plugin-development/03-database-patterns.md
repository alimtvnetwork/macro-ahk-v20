# WordPress Plugin Database Patterns

## Overview

WordPress plugins can use:
1. **WordPress Database ($wpdb)** — MySQL via WordPress abstraction
2. **SQLite** — File-based database for plugin-specific data
3. **Custom Tables in WordPress DB** — Using `$wpdb` with custom tables

This guide focuses on SQLite for self-contained plugins, which is ideal for:
- Audit logging
- Plugin-specific transaction records
- Offline/local functionality
- Avoiding WordPress DB pollution

## SQLite Database Location

Store the database in the WordPress uploads directory:

```
wp-content/uploads/{plugin-slug}/{plugin-slug}.db
```

### Why This Location?

1. **Writable** — Guaranteed write permissions
2. **Survives updates** — Outside plugin directory
3. **Backupable** — Standard WordPress backup tools include uploads
4. **Securable** — Can add .htaccess protection

## Database Class Implementation

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Database;

use PDO;
use PDOException;
use RuntimeException;
use Throwable;
use RiseupAsia\Logging\FileLogger;
use RiseupAsia\Helpers\PathHelper;
use RiseupAsia\Enums\PluginConfigType;

class Database {
    private static ?self $instance = null;
    private ?PDO $pdo = null;
    private FileLogger $fileLogger;
    private ?string $dbPath = null;
    private bool $isInitialized = false;

    private const SCHEMA_VERSION = 1;

    public static function getInstance(): self {
        self::$instance ??= new self();

        return self::$instance;
    }

    private function __construct() {
        $this->fileLogger = new FileLogger();
    }

    public function init(): void {
        if ($this->isInitialized) {
            return;
        }

        $this->fileLogger->log('Database init starting', __FILE__, __LINE__);

        try {
            $this->ensureDataDirectory();
            $this->connect();
            $this->createTables();
            $this->isInitialized = true;

            $this->fileLogger->log('Database init complete', __FILE__, __LINE__);
        } catch (Throwable $e) {
            $this->fileLogger->error(
                'Database init failed: ' . $e->getMessage(),
                __FILE__,
                __LINE__,
            );

            throw $e;
        }
    }

    private function getDbPath(): string {
        if ($this->dbPath === null) {
            $uploadDir = wp_upload_dir();
            $slug = PluginConfigType::Slug->value;
            $this->dbPath = $uploadDir['basedir'] . '/' . $slug . '/' . $slug . '.db';
        }

        return $this->dbPath;
    }

    private function ensureDataDirectory(): void {
        $dbPath = $this->getDbPath();
        $dataDir = dirname($dbPath);

        $this->fileLogger->log(
            sprintf('Ensuring data directory: %s', $dataDir),
            __FILE__,
            __LINE__,
        );

        $isCreateFailed = PathHelper::isDirMissing($dataDir) && !@mkdir($dataDir, 0755, true) && !is_dir($dataDir);

        if ($isCreateFailed) {
            throw new RuntimeException("Failed to create data directory: {$dataDir}");
        }

        PathHelper::makeDirectory($dataDir, secure: true);
    }

    private function connect(): void {
        $dbPath = $this->getDbPath();

        $this->fileLogger->log(
            sprintf('Connecting to database: %s', $dbPath),
            __FILE__,
            __LINE__,
        );

        try {
            $this->pdo = new PDO('sqlite:' . $dbPath);
            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $this->pdo->exec('PRAGMA foreign_keys = ON');

            $this->fileLogger->log('Database connection established', __FILE__, __LINE__);
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('Database connection failed: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            throw $e;
        }
    }

    public function getPdo(): PDO {
        if ($this->pdo === null) {
            $this->connect();
        }

        return $this->pdo;
    }

    public function isReady(): bool {
        return $this->isInitialized && $this->pdo !== null;
    }

    private function getSchemaVersion(): int {
        try {
            $stmt = $this->pdo->query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
            );

            if (!$stmt->fetch()) {
                $this->pdo->exec("
                    CREATE TABLE schema_version (
                        version INTEGER PRIMARY KEY,
                        applied_at TEXT NOT NULL
                    )
                ");
                $this->fileLogger->log('Created schema_version table', __FILE__, __LINE__);

                return 0;
            }

            $stmt = $this->pdo->query("SELECT MAX(version) as version FROM schema_version");
            $row = $stmt->fetch();

            return $row['version'] ?? 0;
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('Failed to get schema version: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            return 0;
        }
    }

    private function setSchemaVersion(int $version): void {
        $stmt = $this->pdo->prepare(
            "INSERT INTO schema_version (version, applied_at) VALUES (?, ?)"
        );
        $stmt->execute([$version, gmdate('Y-m-d H:i:s')]);

        $this->fileLogger->log(
            sprintf('Schema version set to %d', $version),
            __FILE__,
            __LINE__,
        );
    }

    private function createTables(): void {
        $currentVersion = $this->getSchemaVersion();

        $this->fileLogger->log(
            sprintf('Current schema version: %d, target: %d', $currentVersion, self::SCHEMA_VERSION),
            __FILE__,
            __LINE__,
        );

        if ($currentVersion < 1) {
            $this->fileLogger->log('Running migration v1', __FILE__, __LINE__);

            try {
                $this->pdo->exec("
                    CREATE TABLE IF NOT EXISTS riseup_transactions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        type TEXT NOT NULL,
                        status TEXT NOT NULL DEFAULT 'pending',
                        details TEXT,
                        created_at TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )
                ");

                $this->pdo->exec("
                    CREATE INDEX IF NOT EXISTS idx_transactions_type
                    ON riseup_transactions(type)
                ");

                $this->pdo->exec("
                    CREATE INDEX IF NOT EXISTS idx_transactions_created
                    ON riseup_transactions(created_at)
                ");

                $this->setSchemaVersion(1);
                $this->fileLogger->log('Migration v1 complete', __FILE__, __LINE__);
            } catch (PDOException $e) {
                $this->fileLogger->error(
                    sprintf('Migration v1 failed: %s', $e->getMessage()),
                    __FILE__,
                    __LINE__,
                );

                throw $e;
            }
        }

        // Future migrations go here
        // if ($currentVersion < 2) { ... }
    }
}
```

## Schema Versioning

### Why Version Your Schema?

1. **Idempotent migrations** — Safe to run multiple times
2. **Rollback capability** — Track what was applied
3. **Multi-environment** — Different sites may be at different versions
4. **Team development** — Multiple developers adding migrations

### Migration Pattern

```php
if ($currentVersion < 1) {
    $this->runMigrationV1();
    $this->setSchemaVersion(1);
}

if ($currentVersion < 2) {
    $this->runMigrationV2();
    $this->setSchemaVersion(2);
}
```

## ORM Pattern (Micro-ORM)

For simple CRUD operations without a full ORM:

```php
<?php

if (!defined('ABSPATH')) {
    exit;
}

namespace RiseupAsia\Database;

use PDOException;
use Throwable;
use RiseupAsia\Logging\FileLogger;

class Orm {
    private Database $db;
    private FileLogger $fileLogger;
    private string $table;

    public function __construct(string $tableName) {
        $this->db = Database::getInstance();
        $this->fileLogger = new FileLogger();
        $this->table = $tableName;
    }

    /** @param array<string, mixed> $data */
    public function insert(array $data): string|false {
        $columns = array_keys($data);
        $placeholders = array_fill(0, count($columns), '?');

        $sql = sprintf(
            "INSERT INTO %s (%s) VALUES (%s)",
            $this->table,
            implode(', ', $columns),
            implode(', ', $placeholders),
        );

        try {
            $pdo = $this->db->getPdo();
            $stmt = $pdo->prepare($sql);
            $stmt->execute(array_values($data));

            return $pdo->lastInsertId();
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('ORM insert failed: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            throw $e;
        }
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array {
        $sql = sprintf("SELECT * FROM %s WHERE id = ?", $this->table);

        try {
            $pdo = $this->db->getPdo();
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);
            $result = $stmt->fetch();

            return $result !== false ? $result : null;
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('ORM find failed: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            return null;
        }
    }

    /**
     * @param array<string, mixed> $conditions
     * @return list<array<string, mixed>>
     */
    public function findAll(
        array $conditions = [],
        ?string $orderBy = null,
        ?int $limit = null,
    ): array {
        $sql = sprintf("SELECT * FROM %s", $this->table);
        $params = [];

        if (!empty($conditions)) {
            $whereParts = [];

            foreach ($conditions as $column => $value) {
                $whereParts[] = "{$column} = ?";
                $params[] = $value;
            }

            $sql .= " WHERE " . implode(' AND ', $whereParts);
        }

        if ($orderBy !== null) {
            $sql .= " ORDER BY " . $orderBy;
        }

        if ($limit !== null) {
            $sql .= " LIMIT " . $limit;
        }

        try {
            $pdo = $this->db->getPdo();
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            return $stmt->fetchAll();
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('ORM findAll failed: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            return [];
        }
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): int {
        $setParts = [];
        $params = [];

        foreach ($data as $column => $value) {
            $setParts[] = "{$column} = ?";
            $params[] = $value;
        }

        $params[] = $id;

        $sql = sprintf(
            "UPDATE %s SET %s WHERE id = ?",
            $this->table,
            implode(', ', $setParts),
        );

        try {
            $pdo = $this->db->getPdo();
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);

            return $stmt->rowCount();
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('ORM update failed: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            throw $e;
        }
    }

    public function delete(int $id): int {
        $sql = sprintf("DELETE FROM %s WHERE id = ?", $this->table);

        try {
            $pdo = $this->db->getPdo();
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$id]);

            return $stmt->rowCount();
        } catch (PDOException $e) {
            $this->fileLogger->error(
                sprintf('ORM delete failed: %s', $e->getMessage()),
                __FILE__,
                __LINE__,
            );

            throw $e;
        }
    }
}
```

## Best Practices

### 1. Always Use Transactions for Multiple Operations

```php
use Throwable;

public function batchInsert(array $records): void {
    $pdo = $this->db->getPdo();

    try {
        $pdo->beginTransaction();

        foreach ($records as $record) {
            $this->insert($record);
        }

        $pdo->commit();
        $this->fileLogger->log('Batch insert committed', __FILE__, __LINE__);
    } catch (Throwable $e) {
        $pdo->rollBack();
        $this->fileLogger->error('Batch insert rolled back', __FILE__, __LINE__);

        throw $e;
    }
}
```

### 2. Use Prepared Statements Always

```php
// ❌ NEVER DO THIS — SQL injection vulnerability
$sql = "SELECT * FROM users WHERE name = '{$userInput}'";

// ✅ ALWAYS use prepared statements
$stmt = $pdo->prepare("SELECT * FROM users WHERE name = ?");
$stmt->execute([$userInput]);
```

### 3. Handle DateTime Correctly

```php
// Store as ISO 8601 UTC
$createdAt = gmdate('Y-m-d H:i:s');

// When displaying, convert to local timezone
$localTime = get_date_from_gmt($createdAt, 'Y-m-d H:i:s');
```

### 4. Create Indexes for Queried Columns

```php
$this->pdo->exec("
    CREATE INDEX IF NOT EXISTS IdxTransactions_Type
    ON Transactions(Type)
");
```

---

## Database Naming Convention — PascalCase

> **Canonical source:** [Database Naming Convention](../../08-coding-guidelines/coding-guidelines/database-naming.md)

All custom SQLite table names, column names, and index names MUST use **PascalCase**. WordPress core tables remain `snake_case`.

```sql
-- ✅ Custom tables — PascalCase
CREATE TABLE Transactions (
    Id INTEGER PRIMARY KEY AUTOINCREMENT,
    PluginSlug TEXT NOT NULL,
    Status TEXT NOT NULL DEFAULT 'Pending',
    CreatedAt TEXT NOT NULL
);

CREATE INDEX IdxTransactions_CreatedAt ON Transactions(CreatedAt);
```

See the canonical spec for full rules, abbreviation casing, and migration details.
