/**
 * Marco Extension — Schema Migration v2 SQL
 *
 * SQL statements for the v2 migration (context columns + error codes).
 * All column names use PascalCase per database naming convention.
 *
 * NOTE: These ADD COLUMN statements use PascalCase names. The v4 migration
 * renames any legacy snake_case columns from pre-v4 installations.
 */

export const V2_LOG_COLUMNS = [
    "ALTER TABLE Logs ADD COLUMN ProjectId TEXT",
    "ALTER TABLE Logs ADD COLUMN UrlRuleId TEXT",
    "ALTER TABLE Logs ADD COLUMN ScriptId TEXT",
    "ALTER TABLE Logs ADD COLUMN ConfigId TEXT",
    "ALTER TABLE Logs ADD COLUMN ExtVersion TEXT",
    "CREATE INDEX IF NOT EXISTS IdxLogsProject ON Logs(ProjectId)",
    "CREATE INDEX IF NOT EXISTS IdxLogsScript ON Logs(ScriptId)",
];

export const V2_ERROR_COLUMNS = [
    "ALTER TABLE Errors ADD COLUMN ProjectId TEXT",
    "ALTER TABLE Errors ADD COLUMN UrlRuleId TEXT",
    "ALTER TABLE Errors ADD COLUMN ScriptId TEXT",
    "ALTER TABLE Errors ADD COLUMN ConfigId TEXT",
    "ALTER TABLE Errors ADD COLUMN ScriptFile TEXT",
    "ALTER TABLE Errors ADD COLUMN ErrorLine INTEGER",
    "ALTER TABLE Errors ADD COLUMN ErrorColumn INTEGER",
    "ALTER TABLE Errors ADD COLUMN ExtVersion TEXT",
    "CREATE INDEX IF NOT EXISTS IdxErrorsProject ON Errors(ProjectId)",
    "CREATE INDEX IF NOT EXISTS IdxErrorsScript ON Errors(ScriptId)",
];

export const V2_ERROR_CODES = [
    "INSERT OR IGNORE INTO error_codes VALUES ('USER_SCRIPT_ERROR','RECOVERABLE','User-uploaded script threw an error','Check script source and stack trace')",
    "INSERT OR IGNORE INTO error_codes VALUES ('USER_SCRIPT_TIMEOUT','WARNING','User-uploaded script exceeded execution time','Optimize script or increase timeout')",
    "INSERT OR IGNORE INTO error_codes VALUES ('CONFIG_INJECT_FAIL','RECOVERABLE','Failed to inject config into script','Check injection method and config validity')",
    "INSERT OR IGNORE INTO error_codes VALUES ('PROJECT_MATCH_FAIL','WARNING','URL matched rule but injection failed','Check conditions and script bindings')",
    "INSERT OR IGNORE INTO error_codes VALUES ('SCHEMA_MIGRATION','WARNING','Database schema migration applied','Normal on version upgrade')",
];
