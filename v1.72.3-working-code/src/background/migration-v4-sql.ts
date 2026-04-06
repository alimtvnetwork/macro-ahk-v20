/**
 * Marco Extension — Schema Migration v4 SQL
 *
 * Renames all snake_case columns to PascalCase across all tables.
 * Uses ALTER TABLE RENAME COLUMN (supported since SQLite 3.25.0 / sql.js 1.x).
 *
 * All renames are wrapped in runIgnoringDuplicates — if a column was already
 * renamed (fresh install), the ALTER will fail harmlessly.
 *
 * See: spec/03-imported-spec/03-coding-guidelines/database-naming.md
 */

/* ------------------------------------------------------------------ */
/*  Sessions (logs.db)                                                 */
/* ------------------------------------------------------------------ */

export const V4_SESSIONS_RENAMES = [
    "ALTER TABLE Sessions RENAME COLUMN started_at TO StartedAt",
    "ALTER TABLE Sessions RENAME COLUMN ended_at TO EndedAt",
    "ALTER TABLE Sessions RENAME COLUMN user_agent TO UserAgent",
    // 'id', 'version', 'notes' are already single-word / lowercase — rename to PascalCase
    // SQLite RENAME COLUMN is case-sensitive, so lowercase → PascalCase works
];

/* ------------------------------------------------------------------ */
/*  Logs (logs.db)                                                     */
/* ------------------------------------------------------------------ */

export const V4_LOGS_RENAMES = [
    "ALTER TABLE Logs RENAME COLUMN session_id TO SessionId",
    "ALTER TABLE Logs RENAME COLUMN log_type TO LogType",
    "ALTER TABLE Logs RENAME COLUMN duration_ms TO DurationMs",
    "ALTER TABLE Logs RENAME COLUMN project_id TO ProjectId",
    "ALTER TABLE Logs RENAME COLUMN url_rule_id TO UrlRuleId",
    "ALTER TABLE Logs RENAME COLUMN script_id TO ScriptId",
    "ALTER TABLE Logs RENAME COLUMN config_id TO ConfigId",
    "ALTER TABLE Logs RENAME COLUMN ext_version TO ExtVersion",
    // Recreate indexes with new column names
    "DROP INDEX IF EXISTS IdxLogsSession",
    "DROP INDEX IF EXISTS IdxLogsProject",
    "DROP INDEX IF EXISTS IdxLogsScript",
    "CREATE INDEX IF NOT EXISTS IdxLogsSession ON Logs(SessionId)",
    "CREATE INDEX IF NOT EXISTS IdxLogsProject ON Logs(ProjectId)",
    "CREATE INDEX IF NOT EXISTS IdxLogsScript  ON Logs(ScriptId)",
];

/* ------------------------------------------------------------------ */
/*  Errors (errors.db)                                                 */
/* ------------------------------------------------------------------ */

export const V4_ERRORS_RENAMES = [
    "ALTER TABLE Errors RENAME COLUMN session_id TO SessionId",
    "ALTER TABLE Errors RENAME COLUMN log_id TO LogId",
    "ALTER TABLE Errors RENAME COLUMN error_code TO ErrorCode",
    "ALTER TABLE Errors RENAME COLUMN stack_trace TO StackTrace",
    "ALTER TABLE Errors RENAME COLUMN project_id TO ProjectId",
    "ALTER TABLE Errors RENAME COLUMN url_rule_id TO UrlRuleId",
    "ALTER TABLE Errors RENAME COLUMN script_id TO ScriptId",
    "ALTER TABLE Errors RENAME COLUMN config_id TO ConfigId",
    "ALTER TABLE Errors RENAME COLUMN script_file TO ScriptFile",
    "ALTER TABLE Errors RENAME COLUMN error_line TO ErrorLine",
    "ALTER TABLE Errors RENAME COLUMN error_column TO ErrorColumn",
    "ALTER TABLE Errors RENAME COLUMN ext_version TO ExtVersion",
    // Recreate indexes
    "DROP INDEX IF EXISTS IdxErrorsSession",
    "DROP INDEX IF EXISTS IdxErrorsCode",
    "DROP INDEX IF EXISTS IdxErrorsProject",
    "DROP INDEX IF EXISTS IdxErrorsScript",
    "CREATE INDEX IF NOT EXISTS IdxErrorsSession ON Errors(SessionId)",
    "CREATE INDEX IF NOT EXISTS IdxErrorsCode    ON Errors(ErrorCode)",
    "CREATE INDEX IF NOT EXISTS IdxErrorsProject ON Errors(ProjectId)",
    "CREATE INDEX IF NOT EXISTS IdxErrorsScript  ON Errors(ScriptId)",
];

/* ------------------------------------------------------------------ */
/*  Prompts (logs.db)                                                  */
/* ------------------------------------------------------------------ */

export const V4_PROMPTS_RENAMES = [
    "ALTER TABLE Prompts RENAME COLUMN sort_order TO SortOrder",
    "ALTER TABLE Prompts RENAME COLUMN is_default TO IsDefault",
    "ALTER TABLE Prompts RENAME COLUMN is_favorite TO IsFavorite",
    "ALTER TABLE Prompts RENAME COLUMN created_at TO CreatedAt",
    "ALTER TABLE Prompts RENAME COLUMN updated_at TO UpdatedAt",
    // Slug was already PascalCase-ish (single word)
    // Recreate indexes
    "DROP INDEX IF EXISTS IdxPromptsOrder",
    "CREATE INDEX IF NOT EXISTS IdxPromptsOrder ON Prompts(SortOrder)",
];

/* ------------------------------------------------------------------ */
/*  PromptsCategory (logs.db)                                          */
/* ------------------------------------------------------------------ */

export const V4_PROMPTS_CATEGORY_RENAMES = [
    "ALTER TABLE PromptsCategory RENAME COLUMN sort_order TO SortOrder",
    "ALTER TABLE PromptsCategory RENAME COLUMN created_at TO CreatedAt",
];

/* ------------------------------------------------------------------ */
/*  PromptsToCategory (logs.db)                                        */
/* ------------------------------------------------------------------ */

export const V4_PROMPTS_TO_CATEGORY_RENAMES = [
    // Junction table columns were already camelCase (promptId, categoryId)
    // Rename to PascalCase
    "ALTER TABLE PromptsToCategory RENAME COLUMN promptId TO PromptId",
    "ALTER TABLE PromptsToCategory RENAME COLUMN categoryId TO CategoryId",
    "DROP INDEX IF EXISTS IdxPtcPromptId",
    "DROP INDEX IF EXISTS IdxPtcCategoryId",
    "CREATE INDEX IF NOT EXISTS IdxPtcPromptId   ON PromptsToCategory(PromptId)",
    "CREATE INDEX IF NOT EXISTS IdxPtcCategoryId ON PromptsToCategory(CategoryId)",
];

/* ------------------------------------------------------------------ */
/*  ProjectKv (logs.db)                                                */
/* ------------------------------------------------------------------ */

export const V4_PROJECT_KV_RENAMES = [
    "ALTER TABLE ProjectKv RENAME COLUMN project_id TO ProjectId",
    "ALTER TABLE ProjectKv RENAME COLUMN updated_at TO UpdatedAt",
    // Note: 'key' and 'value' are single-word, but should be PascalCase
    // However renaming 'key' to 'Key' may cause issues with SQLite reserved word
    // Keep as-is for safety (key/value are common single-word names)
];

/* ------------------------------------------------------------------ */
/*  ProjectFiles (logs.db)                                             */
/* ------------------------------------------------------------------ */

export const V4_PROJECT_FILES_RENAMES = [
    "ALTER TABLE ProjectFiles RENAME COLUMN project_id TO ProjectId",
    "ALTER TABLE ProjectFiles RENAME COLUMN mime_type TO MimeType",
    "ALTER TABLE ProjectFiles RENAME COLUMN created_at TO CreatedAt",
    "DROP INDEX IF EXISTS IdxFilesProject",
    "CREATE INDEX IF NOT EXISTS IdxFilesProject ON ProjectFiles(ProjectId)",
];

/* ------------------------------------------------------------------ */
/*  Scripts (logs.db)                                                  */
/* ------------------------------------------------------------------ */

export const V4_SCRIPTS_RENAMES = [
    "ALTER TABLE Scripts RENAME COLUMN is_enabled TO IsEnabled",
    "ALTER TABLE Scripts RENAME COLUMN project_id TO ProjectId",
    "ALTER TABLE Scripts RENAME COLUMN sort_order TO SortOrder",
    "ALTER TABLE Scripts RENAME COLUMN created_at TO CreatedAt",
    "ALTER TABLE Scripts RENAME COLUMN updated_at TO UpdatedAt",
    "DROP INDEX IF EXISTS IdxScriptsProject",
    "CREATE INDEX IF NOT EXISTS IdxScriptsProject ON Scripts(ProjectId)",
];

/* ------------------------------------------------------------------ */
/*  PromptsDetails view (logs.db) — must be recreated                  */
/* ------------------------------------------------------------------ */

export const V4_RECREATE_PROMPTS_VIEW = [
    "DROP VIEW IF EXISTS PromptsDetails",
    `CREATE VIEW IF NOT EXISTS PromptsDetails AS
     SELECT
         p.Id         AS PromptId,
         p.Slug       AS Slug,
         p.Name       AS Title,
         p.Text       AS Content,
         p.Version    AS Version,
         p.SortOrder  AS SortOrder,
         p.IsDefault  AS IsDefault,
         p.IsFavorite AS IsFavorite,
         p.CreatedAt  AS CreatedAt,
         p.UpdatedAt  AS UpdatedAt,
         COALESCE(GROUP_CONCAT(pc.Name, ', '), '') AS Categories
     FROM Prompts p
     LEFT JOIN PromptsToCategory ptc ON ptc.PromptId = p.Id
     LEFT JOIN PromptsCategory pc   ON pc.Id = ptc.CategoryId
     GROUP BY p.Id`,
];
