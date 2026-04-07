# Chrome Extension — Advanced Features Specification

**Version**: v0.1 (Planning)
**Date**: 2026-02-25

---

## Purpose

Document three advanced features not covered by the MVP specs: **Remote Config Endpoints**, **Conditional Script Injection**, and **XPath Recorder**. These extend the extension beyond static config and fixed content scripts into a dynamic, programmable automation platform.

---

## Feature 1: Remote Config Endpoint

### Problem

The MVP spec (`02-config-json-schema.md`) only supports local config: bundled `config.json` → `chrome.storage.local`. In team or multi-machine scenarios, users want to fetch config from a remote endpoint so changes propagate without manually editing each extension install.

### Design

Config loading becomes a **3-tier cascade** with remote as the highest priority:

```
Remote endpoint (if configured)
    ↓ fallback
chrome.storage.local (user overrides)
    ↓ fallback
Bundled config.json (defaults)
```

### Config Schema Addition

Add a new top-level `remoteConfig` section to `config.json`:

```json
{
  "remoteConfig": {
    "enabled": false,
    "endpoints": [
      {
        "url": "https://example.com/api/marco-config",
        "method": "GET",
        "headers": {
          "X-Api-Key": "{{SECRET_API_KEY}}"
        },
        "refreshIntervalMs": 300000,
        "timeoutMs": 5000,
        "fallbackToLocal": true
      }
    ],
    "mergeStrategy": "deep",
    "lastFetchedAt": null,
    "lastFetchStatus": null
  }
}
```

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Master switch for remote config |
| `endpoints` | array | Ordered list of endpoints to try (first success wins) |
| `endpoints[].url` | string | Full URL to fetch config JSON from |
| `endpoints[].method` | string | HTTP method (`GET` or `POST`) |
| `endpoints[].headers` | object | Custom headers. `{{SECRET_*}}` tokens are resolved from `chrome.storage.local` secrets |
| `endpoints[].refreshIntervalMs` | number | How often to re-fetch (0 = only on extension start). Default: 300000 (5 min) |
| `endpoints[].timeoutMs` | number | Request timeout. Default: 5000 |
| `endpoints[].fallbackToLocal` | boolean | If fetch fails, use cached/local config silently. Default: true |
| `mergeStrategy` | string | `"deep"` = deep-merge remote over local (remote wins per-key); `"replace"` = full replacement |
| `lastFetchedAt` | string | ISO 8601 timestamp of last successful fetch (auto-set) |
| `lastFetchStatus` | string | `"success"`, `"timeout"`, `"error:404"`, etc. (auto-set) |

### Implementation — `background.js`

```javascript
async function loadConfigWithRemote() {
  // 1. Load local config first (always needed as baseline)
  let config = await loadLocalConfig();

  // 2. If remote is enabled, try fetching
  if (config.remoteConfig?.enabled && config.remoteConfig?.endpoints?.length) {
    for (const endpoint of config.remoteConfig.endpoints) {
      try {
        const headers = resolveSecretTokens(endpoint.headers || {});
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs || 5000);

        const resp = await fetch(endpoint.url, {
          method: endpoint.method || 'GET',
          headers,
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (resp.ok) {
          const remoteConfig = await resp.json();
          config = endpoint.mergeStrategy === 'replace'
            ? { ...config, ...remoteConfig, remoteConfig: config.remoteConfig }
            : deepMerge(config, remoteConfig);

          config.remoteConfig.lastFetchedAt = new Date().toISOString();
          config.remoteConfig.lastFetchStatus = 'success';
          await chrome.storage.local.set({ config });
          log('INFO', 'background', 'CONFIG', 'remote_fetch',
              'Remote config loaded from ' + endpoint.url);
          break; // First successful endpoint wins
        } else {
          config.remoteConfig.lastFetchStatus = 'error:' + resp.status;
          log('WARN', 'background', 'CONFIG', 'remote_fetch_fail',
              'Remote config returned ' + resp.status + ' from ' + endpoint.url);
        }
      } catch (err) {
        config.remoteConfig.lastFetchStatus = err.name === 'AbortError' ? 'timeout' : 'error:' + err.message;
        log('WARN', 'background', 'CONFIG', 'remote_fetch_error',
            'Remote config fetch failed: ' + err.message);
        if (endpoint.fallbackToLocal) continue;
      }
    }
  }

  return config;
}

// Secret token resolution: replaces {{SECRET_KEY}} with stored values
function resolveSecretTokens(headers) {
  const resolved = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
      const secretKey = value.slice(2, -2);
      // Read from chrome.storage.local secrets namespace
      resolved[key] = secretsCache[secretKey] || '';
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}
```

### Remote Config Response Format

The remote endpoint must return a JSON object matching the `config.json` schema (partial or full). Example:

```json
{
  "macroLoop": {
    "timing": {
      "loopIntervalMs": 60000
    }
  },
  "comboSwitch": {
    "xpaths": {
      "transferButton": "//button[@aria-label='Transfer']"
    }
  }
}
```

With `mergeStrategy: "deep"`, only the specified keys are overridden; all other config values remain from local.

### Action-Based Remote Responses

Beyond config overrides, the remote endpoint can return **actions** — instructions for the extension to execute:

```json
{
  "_actions": [
    {
      "type": "notify",
      "message": "New XPaths available — extension will auto-update in 5 minutes"
    },
    {
      "type": "inject_script",
      "url": "https://example.com/scripts/hotfix.js",
      "target": "lovable.dev",
      "once": true
    },
    {
      "type": "update_config",
      "path": "comboSwitch.timing.pollIntervalMs",
      "value": 500
    }
  ]
}
```

Actions are processed after config merge and logged to `logs.db`.

### Permissions Required

```json
{
  "host_permissions": [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*",
    "https://api.lovable.dev/*",
    "<all_urls>"
  ]
}
```

> **Note**: `<all_urls>` is only needed if remote config endpoints are on arbitrary domains. For known endpoints, list them explicitly to minimize permission scope.

---

## Feature 2: Conditional Script Injection by URL Pattern

### Problem

All scripts are injected programmatically via `chrome.scripting.executeScript` (see `05-content-script-adaptation.md` v0.2). Users want to inject **different scripts** based on URL path patterns (e.g., only inject combo.js on project pages, inject a different script on settings pages).

### Design

A new `scriptInjection` config section defines **rules** — each rule maps a URL pattern + conditions to a set of scripts:

```json
{
  "scriptInjection": {
    "rules": [
      {
        "id": "combo-on-projects",
        "enabled": true,
        "description": "Inject ComboSwitch on project pages",
        "urlPatterns": ["https://lovable.dev/projects/*"],
        "pathRegex": "^/projects/[a-f0-9-]+",
        "excludePathRegex": "^/projects/[a-f0-9-]+/settings",
        "scripts": ["content-scripts/combo.js"],
        "runAt": "document_idle",
        "conditions": {
          "requireElement": null,
          "requireCookie": "lovable-session-id.id",
          "minDelayMs": 0
        }
      },
      {
        "id": "macro-loop-on-projects",
        "enabled": true,
        "description": "Inject MacroLoop on project pages",
        "urlPatterns": ["https://lovable.dev/projects/*"],
        "pathRegex": "^/projects/[a-f0-9-]+",
        "scripts": ["content-scripts/macro-looping.js"],
        "runAt": "document_idle",
        "conditions": {
          "requireElement": null,
          "requireCookie": "lovable-session-id.id",
          "minDelayMs": 500
        }
      },
      {
        "id": "settings-helper",
        "enabled": false,
        "description": "Inject settings helper on settings pages",
        "urlPatterns": ["https://lovable.dev/settings*"],
        "pathRegex": "^/settings",
        "scripts": ["content-scripts/settings-helper.js"],
        "runAt": "document_idle",
        "conditions": {}
      },
      {
        "id": "custom-site-script",
        "enabled": false,
        "description": "Example: inject custom script on any site",
        "urlPatterns": ["https://example.com/*"],
        "pathRegex": "^/dashboard/[0-9]+",
        "scripts": ["content-scripts/custom.js"],
        "runAt": "document_idle",
        "conditions": {
          "requireElement": "#app-container",
          "minDelayMs": 1000
        }
      }
    ],
    "defaultScripts": []
  }
}
```

### Rule Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier for logging and management |
| `enabled` | boolean | Toggle without removing the rule |
| `description` | string | Human-readable purpose |
| `urlPatterns` | string[] | Chrome match patterns (same format as `manifest.json` matches) |
| `pathRegex` | string | Regex tested against `location.pathname`. More precise than match patterns |
| `excludePathRegex` | string | If pathname matches this, skip injection even if `pathRegex` matches |
| `scripts` | string[] | Paths to JS files within the extension bundle |
| `runAt` | string | `"document_start"`, `"document_end"`, or `"document_idle"` |
| `conditions.requireElement` | string | CSS selector that must exist in DOM before injection. NULL = no check |
| `conditions.requireCookie` | string | Cookie name that must exist. NULL = no check |
| `conditions.minDelayMs` | number | Minimum delay after page load before injection. Default: 0 |

### Implementation — `background.js`

Uses `chrome.scripting.executeScript` (Manifest V3 programmatic injection — the only injection model):

```javascript
// Listen for navigation completion to evaluate injection rules
// Uses webNavigation.onCompleted (canonical trigger — see spec 05)
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return; // Top-frame only
  const tab = await chrome.tabs.get(details.tabId);
  if (!tab.url) return;
  const tabId = details.tabId;

  const config = await getConfig();
  const rules = config.scriptInjection?.rules || [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!matchesUrlPatterns(tab.url, rule.urlPatterns)) continue;

    const url = new URL(tab.url);
    if (rule.pathRegex && !new RegExp(rule.pathRegex).test(url.pathname)) continue;
    if (rule.excludePathRegex && new RegExp(rule.excludePathRegex).test(url.pathname)) continue;

    // Check conditions
    if (rule.conditions?.requireCookie) {
      const cookie = await chrome.cookies.get({
        url: tab.url,
        name: rule.conditions.requireCookie
      });
      if (!cookie) {
        log('INFO', 'background', 'INJECTION', 'skip_no_cookie',
            'Rule ' + rule.id + ': cookie "' + rule.conditions.requireCookie + '" not found, skipping');
        continue;
      }
    }

    // Delay if configured
    const delay = rule.conditions?.minDelayMs || 0;
    if (delay > 0) await new Promise(r => setTimeout(r, delay));

    // Check DOM condition if specified
    if (rule.conditions?.requireElement) {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (selector) => !!document.querySelector(selector),
        args: [rule.conditions.requireElement]
      });
      if (!result?.result) {
        log('INFO', 'background', 'INJECTION', 'skip_no_element',
            'Rule ' + rule.id + ': element "' + rule.conditions.requireElement + '" not found, skipping');
        continue;
      }
    }

    // Inject scripts
    for (const script of rule.scripts) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [script]
        });
        log('INFO', 'background', 'INJECTION', 'inject_success',
            'Rule ' + rule.id + ': injected ' + script + ' into ' + tab.url);
      } catch (err) {
        log('ERROR', 'background', 'INJECTION', 'inject_fail',
            'Rule ' + rule.id + ': failed to inject ' + script + ': ' + err.message);
      }
    }
  }
});

// SPA navigation detection — re-evaluate rules on URL change within same tab
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.frameId !== 0) return; // Top frame only
  // Re-run injection logic for the new URL
  const tab = await chrome.tabs.get(details.tabId);
  evaluateInjectionRules(tab);
});
```

### Manifest Changes

Static content scripts are replaced with programmatic injection. The manifest only needs the `scripting` permission:

```json
{
  "permissions": ["cookies", "scripting", "activeTab", "webNavigation"],
  "host_permissions": [
    "https://lovable.dev/*",
    "https://*.lovable.dev/*"
  ]
}
```

### Idempotent Injection

Each injected script sets a marker to prevent double-injection on SPA navigations:

```javascript
// At top of each content script
if (window.__marco_injected_combo) {
  console.log('[Marco] combo.js already injected, skipping');
  // But still re-check if URL changed for SPA awareness
  return;
}
window.__marco_injected_combo = true;
```

### URL Pattern Examples

| Pattern | Matches | Use Case |
|---------|---------|----------|
| `https://lovable.dev/projects/*` | Any project page | Inject combo + macro-loop |
| `^/projects/[a-f0-9-]+$` (regex) | Project main view only | Exclude settings sub-pages |
| `^/projects/[a-f0-9-]+/settings` (regex) | Project settings only | Inject settings-specific script |
| `^/settings\?tab=` (regex) | Global settings with tab param | Inject settings helper |
| `https://example.com/dashboard/*` | External site | Custom automation script |

---

## Feature 3: XPath Recorder

### Problem

Users currently write XPaths manually by inspecting DOM structure. An in-browser recorder that captures click targets as XPath expressions would accelerate config creation and debugging.

### ⚠️ Scope Limitations (R-12 Resolution)

The XPath Recorder operates on the **top-level document only**. The following are explicitly **out of scope** for v1.x:

| Limitation | Reason | Workaround |
|------------|--------|------------|
| **iframes** | Cross-origin iframes block DOM access; same-origin iframes require separate injection | User manually inspects iframe content via DevTools |
| **Shadow DOM** | `element.shadowRoot` is inaccessible in closed mode; open mode requires explicit traversal | User uses DevTools to inspect shadow roots |
| **SVG elements** | XPath for SVG requires namespace-aware evaluation (`document.evaluate` with namespace resolver) | User writes SVG XPaths manually |
| **Canvas elements** | No DOM children to select | Not applicable — canvas is pixel-based |
| **Web Components (custom elements)** | Internal structure may be in shadow DOM | Same as Shadow DOM limitation |

**AI implementation note**: Do NOT attempt to support these. The recorder should:
1. Skip clicks on elements inside `<iframe>`, `<object>`, or `<embed>` tags — show tooltip: "Cannot record inside iframes"
2. Skip clicks on `<svg>` descendants — show tooltip: "SVG elements not supported by recorder"
3. If `event.target.shadowRoot` exists, log a warning but record the host element's XPath instead

### Design

The XPath Recorder is a **toggle mode** activated from the popup or a keyboard shortcut. While active:

1. Every click on the page is intercepted (not propagated)
2. The clicked element's XPath is computed
3. The XPath is displayed in an overlay and copied to clipboard
4. Optionally, a sequence of clicks is recorded as an ordered XPath list

### Activation

```
Popup → "🔴 Record XPaths" button
   OR
Keyboard shortcut: Ctrl+Shift+R (configurable via chrome.commands)
```

### Implementation — `content-scripts/xpath-recorder.js`

```javascript
let isRecording = false;
let recordedXPaths = [];
let overlay = null;

// Listen for toggle from popup/background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'TOGGLE_XPATH_RECORDER') {
    isRecording = !isRecording;
    if (isRecording) {
      startRecording();
    } else {
      stopRecording();
      sendResponse({ recorded: recordedXPaths });
    }
  }
  if (msg.type === 'GET_RECORDED_XPATHS') {
    sendResponse({ recorded: recordedXPaths });
  }
  if (msg.type === 'CLEAR_RECORDED_XPATHS') {
    recordedXPaths = [];
    sendResponse({ ok: true });
  }
});

function startRecording() {
  recordedXPaths = [];
  createOverlay();
  document.addEventListener('click', captureClick, true); // Capture phase
  document.addEventListener('mouseover', highlightElement, true);
  document.addEventListener('mouseout', unhighlightElement, true);
  updateOverlayStatus('Recording... Click elements to capture XPaths');
  log('INFO', 'recorder', 'UI', 'recorder_start', 'XPath recorder activated');
}

function stopRecording() {
  document.removeEventListener('click', captureClick, true);
  document.removeEventListener('mouseover', highlightElement, true);
  document.removeEventListener('mouseout', unhighlightElement, true);
  removeOverlay();
  log('INFO', 'recorder', 'UI', 'recorder_stop',
      'XPath recorder stopped. ' + recordedXPaths.length + ' XPaths captured');
}

function captureClick(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const el = event.target;
  const xpath = computeXPath(el);
  const cssSelector = computeCssSelector(el);
  const tagName = el.tagName.toLowerCase();
  const text = (el.textContent || '').trim().substring(0, 50);
  const attributes = {
    id: el.id || null,
    class: el.className || null,
    role: el.getAttribute('role') || null,
    ariaLabel: el.getAttribute('aria-label') || null,
    dataTestId: el.getAttribute('data-testid') || null
  };

  const entry = {
    index: recordedXPaths.length,
    timestamp: new Date().toISOString(),
    xpath,
    cssSelector,
    tagName,
    text,
    attributes,
    url: window.location.href,
    pathname: window.location.pathname
  };

  recordedXPaths.push(entry);

  // Copy XPath to clipboard
  navigator.clipboard.writeText(xpath).catch(() => {});

  // Show in overlay
  updateOverlayContent(entry);

  // Log to SQLite
  chrome.runtime.sendMessage({
    type: 'LOG',
    payload: {
      level: 'INFO',
      source: 'recorder',
      category: 'DOM',
      action: 'xpath_captured',
      detail: xpath + ' → <' + tagName + '> "' + text + '"',
      metadata: entry
    }
  });
}
```

### XPath Computation Algorithm

Generates the shortest unique XPath for any element:

```javascript
function computeXPath(el) {
  // Strategy priority:
  // 1. ID-based (shortest): //*[@id="unique-id"]
  // 2. data-testid: //*[@data-testid="value"]
  // 3. Role + text: //button[contains(text(), "Submit")]
  // 4. Full path: /html/body/div[2]/main/section/button[3]

  if (el.id) {
    // Verify uniqueness
    if (document.querySelectorAll('#' + CSS.escape(el.id)).length === 1) {
      return '//*[@id="' + el.id + '"]';
    }
  }

  if (el.getAttribute('data-testid')) {
    return '//*[@data-testid="' + el.getAttribute('data-testid') + '"]';
  }

  // Role + aria-label combination
  const role = el.getAttribute('role');
  const ariaLabel = el.getAttribute('aria-label');
  if (role && ariaLabel) {
    const candidate = '//' + el.tagName.toLowerCase() + '[@role="' + role + '"][@aria-label="' + ariaLabel + '"]';
    if (evaluateXPathCount(candidate) === 1) return candidate;
  }

  // Text content match (for buttons, links, headings)
  const textTags = ['button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'label', 'span'];
  if (textTags.includes(el.tagName.toLowerCase())) {
    const text = (el.textContent || '').trim();
    if (text && text.length < 50) {
      const candidate = '//' + el.tagName.toLowerCase() + '[normalize-space(text())="' + text + '"]';
      if (evaluateXPathCount(candidate) === 1) return candidate;
      // Try contains() for partial match
      const shortText = text.substring(0, 20);
      const partial = '//' + el.tagName.toLowerCase() + '[contains(text(), "' + shortText + '")]';
      if (evaluateXPathCount(partial) === 1) return partial;
    }
  }

  // Fallback: positional path
  return computePositionalXPath(el);
}

function computePositionalXPath(el) {
  const parts = [];
  let current = el;
  while (current && current.nodeType === 1) {
    let index = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) index++;
      sibling = sibling.previousElementSibling;
    }
    const tag = current.tagName.toLowerCase();
    const siblings = current.parentElement
      ? current.parentElement.children
      : [];
    const sameTagCount = Array.from(siblings).filter(s => s.tagName === current.tagName).length;
    parts.unshift(sameTagCount > 1 ? tag + '[' + index + ']' : tag);
    current = current.parentElement;
  }
  return '/' + parts.join('/');
}

function evaluateXPathCount(xpath) {
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    return result.snapshotLength;
  } catch (e) {
    return 0;
  }
}
```

### CSS Selector Computation (Bonus)

Alongside XPath, the recorder also computes a CSS selector for comparison:

```javascript
function computeCssSelector(el) {
  if (el.id) return '#' + CSS.escape(el.id);
  if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';

  const parts = [];
  let current = el;
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = '#' + CSS.escape(current.id);
      parts.unshift(selector);
      break;
    }
    if (current.className) {
      const classes = Array.from(current.classList)
        .filter(c => !c.match(/^(hover|focus|active|ng-|css-|_)/))
        .slice(0, 2)
        .map(c => '.' + CSS.escape(c))
        .join('');
      if (classes) selector += classes;
    }
    // Add :nth-child if ambiguous
    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter(s => s.tagName === current.tagName);
      if (sameTag.length > 1) {
        const idx = sameTag.indexOf(current) + 1;
        selector += ':nth-of-type(' + idx + ')';
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
```

### Hover Highlight

While recording, hovered elements get a visible outline:

```javascript
let lastHighlighted = null;

function highlightElement(event) {
  if (lastHighlighted) lastHighlighted.style.outline = '';
  lastHighlighted = event.target;
  event.target.style.outline = '2px solid #ef4444';
  event.target.style.outlineOffset = '2px';
}

function unhighlightElement(event) {
  event.target.style.outline = '';
  event.target.style.outlineOffset = '';
}
```

### Recorder Overlay UI

A fixed overlay at the top of the page shows:

```
┌─────────────────────────────────────────────────────────┐
│ 🔴 XPath Recorder (3 captured)              [■ Stop]    │
│                                                          │
│ Last: //button[@aria-label="Transfer"]                   │
│ Tag:  <button>  Text: "Transfer project"                 │
│ CSS:  button[aria-label="Transfer"]                      │
│                                                          │
│ [Copy All] [Export JSON] [Clear]                          │
└─────────────────────────────────────────────────────────┘
```

### Export Format

"Export JSON" produces a structured file for direct use in config:

```json
{
  "recordedAt": "2026-02-25T14:30:00.000Z",
  "url": "https://lovable.dev/projects/abc-123",
  "entries": [
    {
      "index": 0,
      "xpath": "//button[@aria-label='Transfer']",
      "cssSelector": "button[aria-label='Transfer']",
      "tagName": "button",
      "text": "Transfer project",
      "attributes": { "role": "button", "ariaLabel": "Transfer" }
    },
    {
      "index": 1,
      "xpath": "//div[@role='dialog']//p[contains(@class, 'truncate')]",
      "cssSelector": "div[role='dialog'] p.truncate",
      "tagName": "p",
      "text": "My Workspace",
      "attributes": { "class": "min-w-0 truncate" }
    }
  ]
}
```

### Limitations

| Capability | Status | Notes |
|-----------|--------|-------|
| Click capture | ✅ Full support | Intercepts and prevents propagation |
| Hover highlight | ✅ Full support | Red outline on hover |
| Drag-and-drop | ❌ Not supported | Too complex for XPath recording |
| Hover menus | ⚠️ Partial | Menu may close when clicking; use Ctrl+Click to freeze menu |
| Canvas elements | ❌ Not supported | No DOM structure inside canvas |
| Shadow DOM | ⚠️ Partial | Can detect shadow host but not shadow children |
| iframes | ⚠️ Partial | Requires `all_frames: true` in injection rule |

### Manifest Entry

```json
{
  "commands": {
    "toggle-xpath-recorder": {
      "suggested_key": { "default": "Ctrl+Shift+R" },
      "description": "Toggle XPath Recorder"
    }
  }
}
```

---

## Impact on Other Specs

### `01-overview.md` — Architecture Diagram

New files to add:
- `content-scripts/xpath-recorder.js` — XPath recording mode
- `scriptInjection` config section — conditional injection rules
- `remoteConfig` config section — remote endpoint definitions

### `02-config-json-schema.md` — New Config Sections

Two new top-level sections: `remoteConfig` and `scriptInjection` (schemas defined above).

### `05-content-script-adaptation.md` — Injection Model Change

Updated in v0.2: All injection is programmatic via `chrome.scripting.executeScript`. No static `content_scripts` in manifest. Domain guards removed; the background `project-matcher.ts` handles URL filtering.

### `06-logging-architecture.md` — New Source

Add `'recorder'` to the `source` enum in the `logs` table: `'combo' | 'macro-loop' | 'background' | 'popup' | 'options' | 'recorder'`.

---

## Scope Assignment

| Feature | Phase | Priority |
|---------|-------|----------|
| Remote Config Endpoint | Phase 2 (Enhanced) | Medium |
| Conditional Script Injection | Phase 1 (MVP) | High — needed for multi-script support |
| XPath Recorder | Phase 2 (Enhanced) | Medium — debugging/config aid |
