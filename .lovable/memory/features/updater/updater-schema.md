# Memory: features/updater/updater-schema
Updated: 2026-03-23

The Updater system uses 5 normalized SQLite tables: UpdaterInfo (main), UpdaterCategory (categories for both resource type and update type dimensions), UpdaterToCategory (junction), UpdaterEndpoints (ordered endpoint array), and UpdaterSteps (ordered instruction steps). A mandatory UpdaterDetails view aggregates categories. The system follows a two-stage fetch: VersionInfoSchema JSON for version comparison, then optional InstructionSchema JSON for multi-step execution (Download/Execute/Update/Validate). All fields are PascalCase, booleans use is/has prefix, PKs are INTEGER AUTOINCREMENT. Spec: `spec/11-chrome-extension/58-updater-system.md`. Join pattern: `spec/07-data-and-api/db-join-specs/01-category-join-pattern.md`.
