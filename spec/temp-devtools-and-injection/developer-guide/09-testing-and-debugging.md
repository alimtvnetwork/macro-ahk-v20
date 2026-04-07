# 09 — Testing & Debugging

> How to test scripts, debug in DevTools, and troubleshoot common issues.

---

## Testing in Browser Console

You can test SDK methods directly in the browser console when the extension is active:

```javascript
// Check SDK is loaded
console.log(marco.version);

// Test auth
const token = await marco.auth.getToken();
console.log("Token:", token?.substring(0, 20) + "...");

// Test config
const config = await marco.config.getAll();
console.log("Config:", config);

// Test XPath
const el = marco.xpath.resolve("chatBox");
console.log("Chat box:", el);

// Test notifications
marco.notify.info("Test notification");
marco.notify.error("Test error", { noStop: true });
```

## DevTools Debugging

### Finding Injected Scripts

1. Open Chrome DevTools (`F12` or `Ctrl+Shift+I`)
2. Go to **Sources** tab
3. Look under **Content Scripts** → your extension ID
4. Or search for your script by filename (`Ctrl+P` → `macro-looping.js`)

### Setting Breakpoints

Since scripts run in MAIN world, they appear in the page's JavaScript context (not under Content Scripts). Search for your IIFE function names or unique string literals.

### Console Filtering

Filter console output by prefix:

```
[marco-sdk]         — SDK internal logs
[macro-controller]  — Macro controller logs
[xpath]             — XPath utility logs
```

## Log Conventions

Use consistent prefixes for all console output:

```javascript
const TAG = "[my-project]";

console.log(TAG, "Initialized");
console.warn(TAG, "Config missing, using defaults");
console.error(TAG, "Failed to load:", error);
```

## Common Errors and Fixes

### 1. `window.marco is undefined`

**Cause**: Your script loaded before the SDK.  
**Fix**: Ensure `dependencies: ["marco-sdk"]` in your `instruction.ts` and `loadOrder` is higher than 0.

### 2. `Timeout waiting for AUTH_GET_TOKEN`

**Cause**: Content script relay not installed, or extension not active on this page.  
**Fix**: Check that the page URL matches the extension's `matches` pattern. Verify the extension is enabled.

### 3. CSP blocks script injection

**Cause**: The website's Content Security Policy blocks inline scripts.  
**Fix**: The extension has a CSP fallback that injects via `<script>` element. If that also fails, the script cannot run on that page.

### 4. DOM element not found

**Cause**: Element hasn't rendered yet (SPA dynamic content).  
**Fix**: Use `marco.utils.waitForElement()` or `marco.utils.pollUntil()` instead of immediate DOM queries.

### 5. Config not available at script start

**Cause**: Script executes before config injection completes.  
**Fix**: Set `configBinding` in your instruction's script entry to ensure the config is injected first.

### 6. Duplicate injection

**Cause**: Script injected multiple times on navigation.  
**Fix**: Add an idempotency guard at the top of your script:

```javascript
if (window.__MY_PROJECT_LOADED__) return;
window.__MY_PROJECT_LOADED__ = true;
```

## Diagnostic Tools

### Auth Diagnostics

```javascript
const diag = marco.auth.getLastAuthDiag();
console.log("Auth source:", diag?.source);
console.log("Duration:", diag?.durationMs + "ms");
console.log("Bridge outcome:", diag?.bridgeOutcome);
```

### Recent Errors

```javascript
const errors = marco.notify.getRecentErrors();
console.table(errors);
```

### Extension Health Check

```javascript
// Probe workspace API to verify connectivity
const resp = await marco.api.workspace.probe();
console.log("API health:", resp.ok ? "✅" : "❌", resp.status);
```
