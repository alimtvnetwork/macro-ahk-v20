/**
 * Marco Extension — Schema Migration v6 SQL
 *
 * Adds new columns to UpdaterInfo (ChangelogUrl, HasChangelogFromVersionInfo,
 * HasUserConfirmBeforeUpdate, AutoCheckIntervalMinutes, CacheExpiryMinutes,
 * CachedRedirectUrl, CachedRedirectAt) and creates the UpdateSettings table.
 * Recreates UpdaterDetails view to include new columns.
 *
 * See: spec/12-chrome-extension/58-updater-system.md
 */

import { UPDATE_SETTINGS_SCHEMA, UPDATER_DETAILS_VIEW } from "./db-schemas";

/**
 * Returns all v6 SQL statements as individual strings for runIgnoringDuplicates.
 */
export function getV6Statements(): string[] {
    const alterStatements = [
        "ALTER TABLE UpdaterInfo ADD COLUMN ChangelogUrl TEXT;",
        "ALTER TABLE UpdaterInfo ADD COLUMN HasChangelogFromVersionInfo INTEGER DEFAULT 1;",
        "ALTER TABLE UpdaterInfo ADD COLUMN HasUserConfirmBeforeUpdate INTEGER DEFAULT 0;",
        "ALTER TABLE UpdaterInfo ADD COLUMN AutoCheckIntervalMinutes INTEGER DEFAULT 1440;",
        "ALTER TABLE UpdaterInfo ADD COLUMN CacheExpiryMinutes INTEGER DEFAULT 10080;",
        "ALTER TABLE UpdaterInfo ADD COLUMN CachedRedirectUrl TEXT;",
        "ALTER TABLE UpdaterInfo ADD COLUMN CachedRedirectAt TEXT;",
    ];

    const dropView = "DROP VIEW IF EXISTS UpdaterDetails;";

    const allSql = [
        ...alterStatements,
        dropView,
        UPDATE_SETTINGS_SCHEMA,
        UPDATER_DETAILS_VIEW,
    ].join("\n");

    return allSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s + ";");
}
