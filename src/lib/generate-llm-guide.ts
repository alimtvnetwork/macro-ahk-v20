/**
 * LLM Developer Guide Generator
 *
 * Generates a comprehensive Markdown file for LLM context containing
 * architecture overview, SDK API reference, data models, REST API,
 * message types, and usage examples.
 *
 * See: spec/17-app-issues/75-sdk-namespace-enrichment-and-developer-tooling.md (R3)
 */

// eslint-disable-next-line max-lines-per-function
export function generateLlmGuide(codeName: string, slug: string): string {
  const ns = `RiseupAsiaMacroExt.Projects.${codeName}`;

  return `# Riseup Macro SDK — LLM Developer Guide

> Auto-generated reference for AI assistants. Covers the full SDK namespace,
> injection pipeline, data models, REST API, and common automation patterns.

---

## 1. Architecture Overview

### Injection Pipeline (7 Stages + Cache Gate)

| Stage | Name | Description |
|-------|------|-------------|
| **Pre** | **User Trigger + Toast** | User clicks "Run Scripts" (normal) or "Force Run" (\`forceReload=true\`). A loading spinner toast is shown in the tab. |
| **Cache** | **Cache Decision Gate** | IndexedDB lookup by manifest version key. **HIT** → skip Stages 0–3, jump to Execute. **MISS** → full pipeline. **FORCE** → delete cache, full rebuild. |
| 0 | **Guard + Dependencies** | \`ensureBuiltinScriptsExist\` self-heals missing built-ins, then \`prependDependencyScripts\` performs topological sort. |
| 1 | **Script Resolution** | Loads code from \`chrome.storage.local\`, config JSON, and theme JSON. Unresolvable scripts are hard errors. |
| 2 | **Tab Env Prep** (\`Promise.all\`) | Parallel: (a) \`bootstrapNamespaceRoot\` in MAIN world, (b) \`ensureRelayInjected\` in ISOLATED world, (c) \`seedTokensIntoTab\`. |
| 3 | **Wrap + Prepare** | CSS-first sequential mode when assets detected; otherwise batch IIFE wrap + combine + cache payload in IndexedDB. |
| 4 | **Execute — 4-Tier CSP Fallback** | Tier 1: MAIN World Blob (primary) → Tier 2: USER_SCRIPT (Chrome 135+) → Tier 3: ISOLATED Blob → Tier 4: ISOLATED Eval (last resort). |
| 5 | **Namespaces** (parallel with 3+4) | (a) Settings + llmGuide → \`RiseupAsiaMacroExt.Settings\`, (b) Per-project namespace → \`${ns}\`. |
| **Post** | **Post-Pipeline** | Log mirror (DevTools + SQLite + OPFS), performance budget check, verify 6 post-injection globals, final toast (success/warn/error). |

### 4-Tier CSP Fallback Chain

When a page's Content Security Policy blocks script injection, the extension falls back through 4 tiers:

1. **Tier 1 — MAIN World Blob**: Primary method. Creates a \`blob:\` URL script tag in the page's MAIN world. Full access to \`window\`, DOM, and page globals.
2. **Tier 2 — USER_SCRIPT** (Chrome 135+): Uses \`chrome.userScripts.execute()\`. Near-MAIN access but bypasses strict CSP. Sets \`health=DEGRADED\`.
3. **Tier 3 — ISOLATED World Blob**: Same blob technique but in ISOLATED world. Shares DOM but not \`window\` vars. Most macro features degraded.
4. **Tier 4 — ISOLATED Eval**: Direct \`eval()\` in ISOLATED world. Last resort. If this also fails, \`health=ERROR\` and injection is impossible on the page.

### Execution Context

- **World**: All scripts target the page's MAIN world (not ISOLATED). CSP fallback may downgrade to ISOLATED or USER_SCRIPT.
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

## 3. Shared Utilities (\`marco.utils\`)

The SDK provides a comprehensive set of stable utility functions available to all scripts
via \`window.marco.utils\`. These are cached separately from project scripts for fast loading.

### 3.1 Async Control Flow

\`\`\`js
// Retry with exponential backoff
const data = await marco.utils.withRetry(
  () => fetch("/api/data").then(r => r.json()),
  { maxAttempts: 3, delayMs: 1000, backoffMultiplier: 2,
    onRetry: (attempt, err) => console.log("Retry #" + attempt, err) }
);

// Timeout a slow promise (returns fallback on timeout)
const result = await marco.utils.withTimeout(
  slowOperation(), 5000, { fallback: true }
);

// Simple delay
await marco.utils.delay(2000); // wait 2 seconds

// Single-flight execution (prevent duplicate concurrent calls)
const lock = marco.utils.createConcurrencyLock();
const { value, wasQueued } = await lock.run(() => expensiveAuth());
// Subsequent callers during flight get the same result
\`\`\`

### 3.2 Polling & DOM Waiting

\`\`\`js
// Poll until a condition is truthy (or timeout)
const element = await marco.utils.pollUntil(
  () => document.querySelector(".chat-input"),
  { intervalMs: 200, timeoutMs: 10000,
    onFound: (ms) => console.log("Found in " + ms + "ms"),
    onTimeout: () => console.warn("Element not found") }
);

// Wait for a specific DOM element (CSS selector)
const btn = await marco.utils.waitForElement({
  selector: 'button[data-action="submit"]',
  timeoutMs: 8000,
});

// Wait for element using XPath
const panel = await marco.utils.waitForElement({
  selector: '//div[@class="workspace-panel"]',
  useXPath: true,
  timeoutMs: 5000,
});
\`\`\`

### 3.3 Rate Limiting

\`\`\`js
// Debounce — only fires after N ms of inactivity
const saveDebounced = marco.utils.debounce((data) => {
  ${ns}.kv.set("draft", JSON.stringify(data));
}, 500);
saveDebounced(myData); // Only last call within 500ms executes

// Throttle — fires at most once per N ms
const logThrottled = marco.utils.throttle((msg) => {
  ${ns}.log.info(msg);
}, 1000);
logThrottled("status update"); // Max once per second
\`\`\`

### 3.4 Data Utilities

\`\`\`js
// Safe JSON parse with fallback (no try/catch needed)
const config = marco.utils.safeJsonParse(rawString, { defaults: true });

// Format milliseconds to human-readable duration
marco.utils.formatDuration(1500);   // "1.5s"
marco.utils.formatDuration(125000); // "2m 5s"
marco.utils.formatDuration(42);     // "42ms"

// Generate unique IDs
const id = marco.utils.uid("task");  // "task-m1abc23-1"

// Deep clone objects (uses structuredClone when available)
const copy = marco.utils.deepClone(originalObject);

// Type guard for objects
if (marco.utils.isObject(response)) {
  console.log(response.status);
}
\`\`\`

---

## 4. Data Models (SQLite)

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

### Project-Scoped Tables (User-Defined)

User-created tables automatically include:
- \`Id\` — INTEGER PRIMARY KEY AUTOINCREMENT
- \`CreatedAt\` — TEXT (ISO 8601 timestamp, auto-set)
- \`UpdatedAt\` — TEXT (ISO 8601 timestamp, auto-updated)

Schema metadata is tracked in the \`ProjectSchema\` meta-table.

---

## 5. REST API Endpoints (Port 19280)

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

## 6. Bridge Message Types

| Type | Direction | Payload |
|------|-----------|---------|
| \`GET_TOKEN\` | script → bg | — |
| \`INJECT_SCRIPTS\` | popup → bg | \`{ tabId, scripts, forceReload? }\` |
| \`DB_QUERY\` | script → bg | \`{ projectId, table, method, params }\` |
| \`CONFIG_CHANGED\` | bg → script | \`{ key, value }\` |
| \`GET_SESSION_LOGS\` | popup → bg | — |
| \`EXPORT_LOGS_JSON\` | popup → bg | — |
| \`EXPORT_LOGS_ZIP\` | popup → bg | — |
| \`PURGE_LOGS\` | popup → bg | \`{ olderThanDays }\` |

---

## 7. Keyboard Shortcuts

| Shortcut | Command | Description |
|----------|---------|-------------|
| \`Ctrl+Shift+Down\` | \`run-scripts\` | Inject active project scripts into current tab |

Shortcuts can be customized at \`chrome://extensions/shortcuts\`.

---

## 8. Performance & Caching

### Pipeline Cache (IndexedDB)

The full wrapped injection payload is cached in IndexedDB (\`marco_injection_cache\`) keyed by the extension's manifest version string. On subsequent runs, the **Cache Gate** checks this cache:

- **HIT** (version matches): Skips Stages 0–3 entirely, jumps straight to Execute (Stage 4). Typical speedup: 50–80%.
- **MISS** (version mismatch or empty): Full pipeline rebuild, then stores the new payload.
- **FORCE** (user clicks Force Run): Deletes cached entry, performs full rebuild.

Cache is invalidated by 3 layers:
1. \`chrome.runtime.onInstalled\` clears cache on extension update.
2. Version key mismatch triggers automatic rebuild.
3. \`INVALIDATE_CACHE\` message for manual invalidation.

### Script Pre-Cache

Stable scripts (SDK, XPath) are also pre-cached in IndexedDB at extension boot to eliminate \`fetch()\` calls from \`web_accessible_resources\`.

| Script | Caching | Reason |
|--------|---------|--------|
| \`marco-sdk.js\` | Pre-cached at boot | Rarely changes; provides core SDK |
| \`xpath.js\` | Pre-cached at boot | Rarely changes; XPath utilities |
| \`macro-looping.js\` | Cached after first inject | Changes frequently |

### Injection Budget

Default: 500ms. Configurable via Settings > Injection Budget.
Breaches trigger console warnings with stage-by-stage timing breakdown.

---

## 9. Usage Examples

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

### Example 4: Retry with error handling

\`\`\`js
try {
  const result = await marco.utils.withRetry(async () => {
    const res = await fetch("/api/submit", { method: "POST", body: payload });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }, { maxAttempts: 3, delayMs: 2000, backoffMultiplier: 1.5 });

  ${ns}.log.info("Submitted successfully", result);
} catch (err) {
  marco.notify.error("Submit failed after retries: " + err.message, {
    stack: err.stack,
  });
}
\`\`\`

### Example 5: Wait for element then interact

\`\`\`js
const editor = await marco.utils.waitForElement({
  selector: '[data-testid="code-editor"]',
  timeoutMs: 10000,
});

if (editor) {
  editor.focus();
  ${ns}.log.info("Editor found and focused");
} else {
  ${ns}.log.warn("Editor not found within timeout");
}
\`\`\`

### Example 6: Debounced auto-save

\`\`\`js
const autoSave = marco.utils.debounce(async (content) => {
  await ${ns}.kv.set("draft", content);
  ${ns}.log.info("Draft auto-saved");
}, 1000);

// Call on every keystroke — only saves after 1s of inactivity
document.querySelector("textarea").addEventListener("input", (e) => {
  autoSave(e.target.value);
});
\`\`\`

---

## 10. Error Handling Best Practices

1. **Always wrap async operations** in try/catch with \`marco.notify.error()\` for visibility.
2. **Use \`marco.utils.withRetry()\`** for network calls — transient failures are common.
3. **Include stack traces** in error toasts: \`marco.notify.error(msg, { stack: err.stack })\`.
4. **Use \`marco.utils.withTimeout()\`** for operations that may hang indefinitely.
5. **Log diagnostics** via \`${ns}.log.warn()\` for non-fatal issues.

---

*Generated by Riseup Macro SDK v1.0.0*
`;
}
