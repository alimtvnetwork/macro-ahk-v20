/**
 * Marco Extension — Default Project Databases
 *
 * Defines the common databases that every project should have by default.
 * The first required default is always a Key-Value database.
 *
 * @see spec/11-chrome-extension/55-storage-ui-redesign.md
 * @see spec/11-chrome-extension/90-namespace-database-creation.md
 */

/* ------------------------------------------------------------------ */
/*  Database Kind Registry                                             */
/* ------------------------------------------------------------------ */

export interface DatabaseKind {
  id: number;
  name: string;
  description: string;
}

export const DATABASE_KINDS: DatabaseKind[] = [
  { id: 1, name: "KeyValue", description: "General-purpose key-value pair storage" },
  { id: 2, name: "Relational", description: "Structured relational tables with columns" },
  { id: 3, name: "Config", description: "Configuration and settings storage" },
];

/* ------------------------------------------------------------------ */
/*  Default Database Definitions                                       */
/* ------------------------------------------------------------------ */

export interface DefaultDatabaseDef {
  /** Logical database name */
  databaseName: string;
  /** References DatabaseKind.id */
  databaseKindId: number;
  /** Human-readable description */
  description: string;
  /** JSON schema to auto-apply on creation */
  schema: {
    version: string;
    tables: Array<{
      TableName: string;
      Description: string;
      Columns: Array<{ Name: string; Type: string; Nullable?: boolean; Unique?: boolean; Default?: string; Description?: string }>;
    }>;
  };
}

/**
 * Every project gets these databases created automatically.
 * The KV database is always first and required.
 */
export const DEFAULT_PROJECT_DATABASES: DefaultDatabaseDef[] = [
  {
    databaseName: "ProjectKv",
    databaseKindId: 1,
    description: "General-purpose key-value store for any plugin or feature",
    schema: {
      version: "1.0.0",
      tables: [
        {
          TableName: "KeyValueStore",
          Description: "Generic key-value pairs with optional namespace grouping",
          Columns: [
            { Name: "Namespace", Type: "TEXT", Default: "'default'", Description: "Logical namespace for grouping keys" },
            { Name: "Key", Type: "TEXT", Description: "The key identifier" },
            { Name: "Value", Type: "TEXT", Nullable: true, Description: "Stored value (JSON or plain text)" },
            { Name: "ValueType", Type: "TEXT", Default: "'text'", Description: "Value type hint: text, json, number, boolean" },
          ],
        },
      ],
    },
  },
  {
    databaseName: "ProjectMeta",
    databaseKindId: 3,
    description: "Project metadata and configuration registry",
    schema: {
      version: "1.0.0",
      tables: [
        {
          TableName: "ProjectDatabases",
          Description: "Registry of all databases in this project",
          Columns: [
            { Name: "DatabaseName", Type: "TEXT", Unique: true, Description: "Logical database name" },
            { Name: "Namespace", Type: "TEXT", Default: "'default'", Description: "Namespace for grouping" },
            { Name: "DatabaseKindId", Type: "INTEGER", Default: "1", Description: "References DatabaseKind (1=KV, 2=Relational, 3=Config)" },
            { Name: "IsDefault", Type: "INTEGER", Default: "0", Description: "1 if system-created default" },
            { Name: "Description", Type: "TEXT", Nullable: true, Description: "Human-readable purpose" },
          ],
        },
      ],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Namespace Validation                                               */
/*  @see spec/11-chrome-extension/90-namespace-database-creation.md    */
/* ------------------------------------------------------------------ */

/** Reserved namespace prefixes that only the system can use. */
const RESERVED_PREFIXES = ["System.", "Marco."];

/** Maximum user-created databases per project (excludes defaults). */
export const MAX_USER_DATABASES = 25;

/**
 * PascalCase dot-separated namespace format:
 * - 2–5 segments separated by dots
 * - Each segment starts with uppercase letter
 * - Only alphanumeric within segments
 * - Total length 3–100 chars
 */
const NAMESPACE_PATTERN = /^[A-Z][a-zA-Z0-9]*(\.[A-Z][a-zA-Z0-9]*){1,4}$/;

export interface NamespaceValidationResult {
  valid: boolean;
  error?: string;
}

/** Validates a namespace string against all rules. */
export function validateNamespace(namespace: string): NamespaceValidationResult {
  if (!namespace || namespace.trim().length === 0) {
    return { valid: false, error: "Namespace is required" };
  }

  const trimmed = namespace.trim();

  if (trimmed.length < 3) {
    return { valid: false, error: "Namespace must be at least 3 characters" };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: "Namespace must be 100 characters or less" };
  }

  // Check reserved prefixes
  for (const prefix of RESERVED_PREFIXES) {
    if (trimmed.startsWith(prefix)) {
      return { valid: false, error: `"${prefix.slice(0, -1)}" is a reserved namespace prefix` };
    }
  }

  if (!NAMESPACE_PATTERN.test(trimmed)) {
    return {
      valid: false,
      error: "Namespace must be PascalCase dot-separated (e.g. MyPlugin.Config), 2–5 segments",
    };
  }

  return { valid: true };
}

/** Validates a database name within a namespace. */
export function validateDatabaseName(name: string): NamespaceValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: "Database name is required" };
  }
  const trimmed = name.trim();
  if (trimmed.length > 50) {
    return { valid: false, error: "Database name must be 50 characters or less" };
  }
  if (!/^[A-Z][a-zA-Z0-9]*$/.test(trimmed)) {
    return { valid: false, error: "Database name must be PascalCase (e.g. MyStore)" };
  }
  return { valid: true };
}

/* ------------------------------------------------------------------ */
/*  Namespace Database Request                                         */
/* ------------------------------------------------------------------ */

export interface NamespaceDatabaseRequest {
  namespace: string;
  databaseName: string;
  databaseKindId: number;
  description?: string;
}

/** SQL for a KeyValue-kind database. */
export const KV_KIND_SCHEMA = `
CREATE TABLE IF NOT EXISTS KeyValueStore (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Namespace TEXT NOT NULL DEFAULT 'default',
    Key       TEXT NOT NULL,
    Value     TEXT,
    ValueType TEXT NOT NULL DEFAULT 'text',
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);`;

/** SQL for a Config-kind database. */
export const CONFIG_KIND_SCHEMA = `
CREATE TABLE IF NOT EXISTS ConfigStore (
    Id        INTEGER PRIMARY KEY AUTOINCREMENT,
    Section   TEXT NOT NULL DEFAULT 'general',
    Key       TEXT NOT NULL,
    Value     TEXT,
    CreatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UpdatedAt TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(Section, Key)
);`;
