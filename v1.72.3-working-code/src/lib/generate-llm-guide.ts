/**
 * LLM Developer Guide Generator
 *
 * Generates a comprehensive Markdown file for LLM context containing
 * architecture overview, SDK API reference, data models, REST API,
 * message types, and usage examples.
 *
 * See: spec/02-app-issues/75-sdk-namespace-enrichment-and-developer-tooling.md (R3)
 */

export function generateLlmGuide(codeName: string, slug: string): string {
  const ns = `RiseupAsiaMacroExt.Projects.${codeName}`;

  return `# Riseup Macro SDK — LLM Developer Guide

> Auto-generated reference for AI assistants. Covers the full SDK namespace,
> injection pipeline, data models, REST API, and common automation patterns.

---

## 1. Architecture Overview

### Injection Pipeline (5 Stages)

| Stage | Name | Description |
|-------|------|-------------|
| 1 | **URL Match** | Background service worker matches the active tab URL against project URL rules (exact, prefix, regex, glob). |
| 2 | **Dependency Resolution** | Topological sort resolves project dependencies. Parents inject before children. |
| 3 | **SDK Bootstrap** | \`marco-sdk.js\` IIFE injects \`window.marco\` into the MAIN world with bridge modules (auth, cookies, config, xpath, kv, files). |
| 4 | **Namespace Registration** | Per-project namespace IIFE registers \`${ns}\` with proxy methods delegating to \`window.marco.*\`. |
| 5 | **Script Injection** | Project scripts inject in \`order\` sequence into the MAIN world. They can immediately use the SDK namespace. |

### Execution Context

- **World**: All scripts run in the page's MAIN world (not ISOLATED).
- **Bridge**: \`window.postMessage\` → content script relay → \`chrome.runtime.sendMessage\` → background service worker.
- **Frozen**: \`window.marco\` and all namespace objects are \`Object.freeze()\`d — scripts cannot modify the SDK.

### Dependency-Only Projects

Projects with \`onlyRunAsDependency: true\` skip auto-injection even when URL rules match.
They only inject when another project declares them as a dependency.

---

## 2. Global Settings

Extension-wide settings are exposed as a frozen read-only object:

\`\`\`js
RiseupAsiaMacroExt.Settings.Broadcast.Port       // 19280 (HTTP proxy port)
RiseupAsiaMacroExt.Settings.Broadcast.BaseUrl     // "http://localhost:19280"
RiseupAsiaMacroExt.Settings.Logging.DebugMode     // false
RiseupAsiaMacroExt.Settings.Logging.RetentionDays // 30
RiseupAsiaMacroExt.Settings.Injection.DefaultRunAt // "document_idle"
RiseupAsiaMacroExt.Settings.Injection.ForceLegacy  // false
RiseupAsiaMacroExt.Settings.Injection.ChatBoxXPath  // "..."
RiseupAsiaMacroExt.Settings.Limits.MaxCycleCount   // 100
RiseupAsiaMacroExt.Settings.Limits.IdleTimeout     // 5000 (ms)
RiseupAsiaMacroExt.Settings.General.AutoRunOnPageLoad // true
RiseupAsiaMacroExt.Settings.General.ShowNotifications // true
RiseupAsiaMacroExt.Settings.General.Theme            // "system"
\`\`\`

Settings are injected before project namespaces and sourced from \`chrome.storage.local\`.
Changes made via the extension UI take effect on the next injection cycle.

---

## 3. SDK API Reference

### Namespace: \`${ns}\`

Every project gets a frozen namespace under \`RiseupAsiaMacroExt.Projects.<CodeName>\`.

---

### 2.1 Variables (\`.vars\`)

\`\`\`js
// Read a project variable
const val = await ${ns}.vars.get("apiKey");

// Set a variable
await ${ns}.vars.set("apiKey", "sk-...");

// Get all variables as an object
const all = await ${ns}.vars.getAll();
// → { apiKey: "sk-...", baseUrl: "https://..." }
\`\`\`

---

### 2.2 URL Rules (\`.urls\`)

\`\`\`js
// Get the matched URL rule (if any)
const rule = ${ns}.urls.getMatched();
// → { pattern, label, matchType } | null

// List all open tab URLs matching rules
const tabs = ${ns}.urls.listOpen();

// Get URL-template variables from labeled rules
const vars = ${ns}.urls.getVariables();
// → { login: "https://...", dashboard: "https://..." }
\`\`\`

---

### 2.3 XPath (\`.xpath\`)

\`\`\`js
// Get the chat box element using the configured XPath
const chatBox = ${ns}.xpath.getChatBox();
\`\`\`

---

### 2.4 Cookies (\`.cookies\`)

\`\`\`js
// Read a bound cookie by binding name
const token = await ${ns}.cookies.get("sessionToken");

// Get all bound cookies
const cookies = await ${ns}.cookies.getAll();
// → { sessionToken: "abc123", csrfToken: "xyz789" }
\`\`\`

---

### 2.5 Key-Value Store (\`.kv\`)

\`\`\`js
await ${ns}.kv.set("counter", "42");
const val = await ${ns}.kv.get("counter");
await ${ns}.kv.delete("counter");
const keys = await ${ns}.kv.list();
\`\`\`

---

### 2.6 File Storage (\`.files\`)

\`\`\`js
await ${ns}.files.save("config.json", JSON.stringify(data));
const content = await ${ns}.files.read("config.json");
const fileList = await ${ns}.files.list();
\`\`\`

---

### 2.7 Metadata (\`.meta\`)

\`\`\`js
console.log(${ns}.meta.name);         // "Macro Controller"
console.log(${ns}.meta.version);      // "1.0.0"
console.log(${ns}.meta.slug);         // "${slug}"
console.log(${ns}.meta.codeName);     // "${codeName}"
console.log(${ns}.meta.id);           // UUID
console.log(${ns}.meta.description);  // Project description
console.log(${ns}.meta.dependencies); // [{ projectId, version }]
\`\`\`

---

### 2.8 Logging (\`.log\`)

\`\`\`js
${ns}.log.info("Script started");
${ns}.log.warn("Rate limit approaching", { remaining: 5 });
${ns}.log.error("Failed to submit", { step: 3, error: err.message });
// All logs are prefixed with [${codeName}] and persisted to SQLite.
\`\`\`

---

### 2.9 Scripts (\`.scripts\`)

\`\`\`js
const scripts = ${ns}.scripts;
// → [{ name: "macro-looping.js", order: 0, isEnabled: true }, ...]
// Read-only frozen array of registered scripts.
\`\`\`

---

### 2.10 Database (\`.db\`)

Prisma-style query builder for project-scoped SQLite tables.
Uses async bridge messages (\`DB_QUERY\`) under the hood.

\`\`\`js
// Find many rows
const users = await ${ns}.db.table("Users").findMany({ active: true });

// Create a row
const user = await ${ns}.db.table("Users").create({ name: "Alice", active: true });

// Update rows
await ${ns}.db.table("Users").update({ id: 42 }, { active: false });

// Delete rows
await ${ns}.db.table("Users").delete({ id: 42 });

// Count rows
const count = await ${ns}.db.table("Users").count({ active: true });
\`\`\`

---

### 2.11 REST API (\`.api\`)

HTTP helpers for the localhost proxy (port 19280) or bridge relay.

\`\`\`js
// KV via REST
await ${ns}.api.kv.get("key");
await ${ns}.api.kv.set("key", value);
await ${ns}.api.kv.delete("key");
await ${ns}.api.kv.list();

// Files via REST
await ${ns}.api.files.save("name", data);
await ${ns}.api.files.read("name");
await ${ns}.api.files.list();

// DB via REST
await ${ns}.api.db.query("Users", "findMany", { where: { active: true } });

// Schema management
await ${ns}.api.schema.list();
await ${ns}.api.schema.create("Users", [
  { name: "id", type: "INTEGER PRIMARY KEY" },
  { name: "name", type: "TEXT" },
]);
await ${ns}.api.schema.drop("Users");
\`\`\`

---

### 2.12 Docs (\`.docs\`)

\`\`\`js
console.log(${ns}.docs.overview);  // Namespace overview
console.log(${ns}.docs.vars);      // vars sub-namespace docs
console.log(${ns}.docs.db);        // db sub-namespace docs
// Available keys: overview, vars, urls, xpath, cookies, kv, files, meta, log, db, api, scripts
\`\`\`

---

## 3. Data Models (SQLite)

### Core Tables

| Table | Columns | Description |
|-------|---------|-------------|
| **Projects** | id, name, version, slug, codeName, description, settings (JSON) | Registered projects |
| **Scripts** | id, projectId, path, order, runAt, code, configBinding | Script entries per project |
| **Configs** | id, name, json | Configuration objects |
| **KvStore** | projectId, key, value | Key-value pairs (project-scoped) |
| **FileStore** | projectId, name, data (BLOB) | File storage (base64) |
| **Logs** | id, projectId, level, message, meta (JSON), timestamp | Structured logs |
| **Errors** | id, projectId, message, stack, timestamp | Error records |
| **UrlRules** | id, projectId, pattern, matchMode, label, priority | URL matching rules |
| **CookieRules** | id, projectId, domain, name, matchMode, bindTo | Cookie bindings |

---

## 4. REST API Endpoints (Port 19280)

| Method | Path | Description |
|--------|------|-------------|
| GET | \`/projects/:pid/kv/:key\` | Read KV value |
| PUT | \`/projects/:pid/kv/:key\` | Write KV value |
| DELETE | \`/projects/:pid/kv/:key\` | Delete KV key |
| GET | \`/projects/:pid/kv\` | List all KV keys |
| PUT | \`/projects/:pid/files/:name\` | Save file |
| GET | \`/projects/:pid/files/:name\` | Read file |
| GET | \`/projects/:pid/files\` | List files |
| POST | \`/projects/:pid/db/:table\` | DB query (method + params in body) |
| SCHEMA | \`/projects/:pid/db\` | Schema operations (list/create/drop) |

---

## 5. Bridge Message Types

| Type | Direction | Payload |
|------|-----------|---------|
| \`GET_TOKEN\` | script → bg | — |
| \`INJECT_SCRIPTS\` | popup → bg | \`{ tabId, scripts }\` |
| \`DB_QUERY\` | script → bg | \`{ projectId, table, method, params }\` |
| \`CONFIG_CHANGED\` | bg → script | \`{ key, value }\` |
| \`GET_SESSION_LOGS\` | popup → bg | — |
| \`EXPORT_LOGS_JSON\` | popup → bg | — |
| \`EXPORT_LOGS_ZIP\` | popup → bg | — |
| \`PURGE_LOGS\` | popup → bg | \`{ olderThanDays }\` |

---

## 6. Usage Examples

### Example 1: Auto-fill chat and submit

\`\`\`js
const chatBox = ${ns}.xpath.getChatBox();
if (chatBox) {
  chatBox.value = "Hello, world!";
  chatBox.dispatchEvent(new Event("input", { bubbles: true }));

  const submitBtn = document.querySelector('button[type="submit"]');
  submitBtn?.click();

  ${ns}.log.info("Message sent");
}
\`\`\`

### Example 2: Persist state across sessions

\`\`\`js
let runCount = parseInt(await ${ns}.kv.get("runCount") || "0", 10);
runCount++;
await ${ns}.kv.set("runCount", String(runCount));
${ns}.log.info(\\\`Run #\\\${runCount}\\\`);
\`\`\`

### Example 3: Read cookies and call API

\`\`\`js
const session = await ${ns}.cookies.get("sessionToken");
const config = await ${ns}.vars.getAll();

const response = await fetch(config.apiUrl + "/data", {
  headers: { Authorization: \\\`Bearer \\\${session}\\\` }
});
const data = await response.json();
${ns}.log.info("Fetched data", { count: data.length });
\`\`\`

---

*Generated by Riseup Macro SDK v1.0.0*
`;
}
