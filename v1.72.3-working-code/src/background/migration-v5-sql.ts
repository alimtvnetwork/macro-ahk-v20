/**
 * Marco Extension — Schema Migration v5 SQL
 *
 * Creates UpdaterInfo, UpdaterCategory, UpdaterToCategory, UpdaterEndpoints,
 * UpdaterSteps tables and UpdaterDetails view.
 *
 * All tables are created with IF NOT EXISTS — safe for fresh installs where
 * FULL_LOGS_SCHEMA has already created them.
 *
 * See: spec/12-chrome-extension/58-updater-system.md
 * See: spec/04-db-join-specs/01-category-join-pattern.md
 */

import {
    UPDATER_INFO_SCHEMA,
    UPDATER_CATEGORY_SCHEMA,
    UPDATER_TO_CATEGORY_SCHEMA,
    UPDATER_ENDPOINTS_SCHEMA,
    UPDATER_STEPS_SCHEMA,
    UPDATER_DETAILS_VIEW,
} from "./db-schemas";

/**
 * Returns all v5 SQL statements as individual strings for runIgnoringDuplicates.
 * Each schema constant may contain multiple statements separated by semicolons.
 */
export function getV5Statements(): string[] {
    const allSql = [
        UPDATER_INFO_SCHEMA,
        UPDATER_CATEGORY_SCHEMA,
        UPDATER_TO_CATEGORY_SCHEMA,
        UPDATER_ENDPOINTS_SCHEMA,
        UPDATER_STEPS_SCHEMA,
        UPDATER_DETAILS_VIEW,
    ].join("\n");

    return allSql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => s + ";");
}
