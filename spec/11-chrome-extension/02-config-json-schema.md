# Chrome Extension — config.json Schema

**Version**: v0.1 (Planning)
**Date**: 2026-02-25

---

## Purpose

Convert `config.ini` (INI format, read by AHK at startup) to `config.json` (native JSON, read by the Chrome extension at runtime). This document maps every INI section and key to its JSON equivalent.

---

## Design Principles

1. **Flat sections → nested objects** — INI dot-notation sections (`ComboSwitch.Timing`) become nested JSON objects (`comboSwitch.timing`)
2. **camelCase keys** — INI `PascalCase` keys become `camelCase` in JSON
3. **Typed values** — INI stores everything as strings; JSON uses proper types (number, boolean, string, array)
4. **Pipe-separated → arrays** — INI values like `Transfer|Transfer project` become `["Transfer", "Transfer project"]`
5. **No placeholders** — AHK `__PLACEHOLDER__` tokens are eliminated; JS reads config.json directly

---

## Full Schema

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "version": { "type": "string", "description": "Config schema version", "default": "1.0.0" },

    "general": {
      "type": "object",
      "properties": {
        "scriptVersion": { "type": "string", "default": "7.11" },
        "debug": { "type": "boolean", "default": true },
        "configWatchIntervalMs": { "type": "number", "default": 2000, "description": "0 = disabled" }
      }
    },

    "comboSwitch": {
      "type": "object",
      "properties": {
        "xpaths": {
          "type": "object",
          "properties": {
            "transferButton": { "type": "string" },
            "projectName": { "type": "string" },
            "combo1": { "type": "string" },
            "combo2Button": { "type": "string" },
            "optionsContainer": { "type": "string" },
            "confirmButton": { "type": "string" }
          }
        },
        "fallbacks": {
          "type": "object",
          "description": "Fallback selectors when XPaths fail",
          "properties": {
            "transfer": {
              "type": "object",
              "properties": {
                "textMatch": { "type": "array", "items": { "type": "string" }, "default": ["Transfer", "Transfer project"] },
                "tag": { "type": "string", "default": "button" },
                "selector": { "type": "string", "default": "" },
                "ariaLabel": { "type": "string", "default": "Transfer" },
                "headingSearch": { "type": "string", "default": "transfer" },
                "role": { "type": "string", "default": "" }
              }
            },
            "combo1": {
              "type": "object",
              "properties": {
                "textMatch": { "type": "array", "items": { "type": "string" }, "default": [] },
                "tag": { "type": "string", "default": "p" },
                "selector": { "type": "string", "default": "div[role=\"dialog\"] p.min-w-0.truncate|div[role=\"dialog\"] p.truncate|div[role=\"dialog\"] p|[data-radix-popper-content-wrapper] p|div[role=\"alertdialog\"] p.truncate|div[role=\"alertdialog\"] p|[class*=\"DialogContent\"] p.truncate|[class*=\"DialogContent\"] p" },
                "ariaLabel": { "type": "string", "default": "" },
                "headingSearch": { "type": "string", "default": "" },
                "role": { "type": "string", "default": "" }
              }
            },
            "combo2": {
              "type": "object",
              "properties": {
                "textMatch": { "type": "array", "items": { "type": "string" }, "default": [] },
                "tag": { "type": "string", "default": "button" },
                "selector": { "type": "string", "default": "div[role=\"dialog\"] button[role=\"combobox\"]|div[role=\"dialog\"] button:not(:last-child)" },
                "ariaLabel": { "type": "string", "default": "" },
                "headingSearch": { "type": "string", "default": "" },
                "role": { "type": "string", "default": "combobox" }
              }
            },
            "options": {
              "type": "object",
              "properties": {
                "textMatch": { "type": "array", "items": { "type": "string" }, "default": [] },
                "tag": { "type": "string", "default": "" },
                "selector": { "type": "string", "default": "[role=\"listbox\"]|[data-radix-popper-content-wrapper] > div|[cmdk-list]" },
                "ariaLabel": { "type": "string", "default": "" },
                "headingSearch": { "type": "string", "default": "" },
                "role": { "type": "string", "default": "listbox" }
              }
            },
            "confirm": {
              "type": "object",
              "properties": {
                "textMatch": { "type": "array", "items": { "type": "string" }, "default": ["Confirm", "Confirm transfer", "Save"] },
                "tag": { "type": "string", "default": "button" },
                "selector": { "type": "string", "default": "div[role=\"dialog\"] button:last-child|div[role=\"alertdialog\"] button:last-child|div[role=\"dialog\"] button[type=\"submit\"]" },
                "ariaLabel": { "type": "string", "default": "" },
                "headingSearch": { "type": "string", "default": "" },
                "role": { "type": "string", "default": "" }
              }
            }
          }
        },
        "timing": {
          "type": "object",
          "properties": {
            "pollIntervalMs": { "type": "number", "default": 300 },
            "openMaxAttempts": { "type": "number", "default": 20 },
            "waitMaxAttempts": { "type": "number", "default": 20 },
            "retryCount": { "type": "number", "default": 2 },
            "retryDelayMs": { "type": "number", "default": 1000 },
            "confirmDelayMs": { "type": "number", "default": 500 }
          }
        },
        "elementIds": {
          "type": "object",
          "properties": {
            "scriptMarker": { "type": "string", "default": "ahk-combo-script" },
            "buttonContainer": { "type": "string", "default": "ahk-combo-btn-container" },
            "buttonUp": { "type": "string", "default": "ahk-combo-up-btn" },
            "buttonDown": { "type": "string", "default": "ahk-combo-down-btn" },
            "jsExecutor": { "type": "string", "default": "ahk-js-executor" },
            "jsExecuteBtn": { "type": "string", "default": "ahk-js-execute-btn" },
            "progressStatus": { "type": "string", "default": "__combo_progress_status__" }
          }
        },
        "shortcuts": {
          "type": "object",
          "properties": {
            "focusTextboxKey": { "type": "string", "default": "/" },
            "comboUpKey": { "type": "string", "default": "ArrowUp" },
            "comboDownKey": { "type": "string", "default": "ArrowDown" },
            "shortcutModifier": { "type": "string", "default": "none" }
          }
        }
      }
    },

    "macroLoop": {
      "type": "object",
      "properties": {
        "timing": {
          "type": "object",
          "properties": {
            "loopIntervalMs": { "type": "number", "default": 50000 },
            "countdownIntervalMs": { "type": "number", "default": 1000 },
            "firstCycleDelayMs": { "type": "number", "default": 500 },
            "postComboDelayMs": { "type": "number", "default": 4000 },
            "pageLoadDelayMs": { "type": "number", "default": 2500 },
            "dialogWaitMs": { "type": "number", "default": 3000 },
            "workspaceCheckIntervalMs": { "type": "number", "default": 5000 }
          }
        },
        "urls": {
          "type": "object",
          "properties": {
            "requiredDomain": { "type": "string", "default": "https://lovable.dev/" },
            "settingsTabPath": { "type": "string", "default": "/settings?tab=project" },
            "defaultView": { "type": "string", "default": "?view=codeEditor" }
          }
        },
        "xpaths": {
          "type": "object",
          "properties": {
            "projectButton": { "type": "string" },
            "mainProgress": { "type": "string" },
            "progress": { "type": "string" },
            "workspaceName": { "type": "string" },
            "workspaceNav": { "type": "string", "default": "" },
            "freeCreditProgress": { "type": "string" },
            "promptActive": { "type": "string" },
            "loopControls": { "type": "string" }
          }
        },
        "elementIds": {
          "type": "object",
          "properties": {
            "scriptMarker": { "type": "string", "default": "ahk-loop-script" },
            "container": { "type": "string", "default": "ahk-loop-container" },
            "status": { "type": "string", "default": "ahk-loop-status" },
            "startBtn": { "type": "string", "default": "ahk-loop-start-btn" },
            "stopBtn": { "type": "string", "default": "ahk-loop-stop-btn" },
            "upBtn": { "type": "string", "default": "ahk-loop-up-btn" },
            "downBtn": { "type": "string", "default": "ahk-loop-down-btn" },
            "recordIndicator": { "type": "string", "default": "ahk-loop-record" },
            "jsExecutor": { "type": "string", "default": "ahk-loop-js-executor" },
            "jsExecuteBtn": { "type": "string", "default": "ahk-loop-js-execute-btn" }
          }
        },
        "shortcuts": {
          "type": "object",
          "properties": {
            "focusTextboxKey": { "type": "string", "default": "/" },
            "startKey": { "type": "string", "default": "s" },
            "stopKey": { "type": "string", "default": "x" },
            "shortcutModifier": { "type": "string", "default": "none" }
          }
        }
      }
    },

    "creditStatus": {
      "type": "object",
      "properties": {
        "api": {
          "type": "object",
          "properties": {
            "baseUrl": { "type": "string", "default": "https://api.lovable.dev" },
            "authMode": { "type": "string", "enum": ["cookieSession", "token"], "default": "cookieSession" },
            "bearerToken": { "type": "string", "default": "", "description": "Only used if authMode=token. NEVER logged." }
          }
        },
        "timing": {
          "type": "object",
          "properties": {
            "autoCheckEnabled": { "type": "boolean", "default": true },
            "autoCheckIntervalSeconds": { "type": "number", "default": 60 },
            "cacheTtlSeconds": { "type": "number", "default": 30 }
          }
        },
        "retry": {
          "type": "object",
          "properties": {
            "maxRetries": { "type": "number", "default": 2 },
            "retryBackoffMs": { "type": "number", "default": 1000 }
          }
        },
        "xpaths": {
          "type": "object",
          "properties": {
            "plansButton": { "type": "string" },
            "freeProgressBar": { "type": "string" },
            "totalCredits": { "type": "string" }
          }
        },
        "elementIds": {
          "type": "object",
          "properties": {
            "creditStatus": { "type": "string", "default": "ahk-credit-status" },
            "creditStatusBtn": { "type": "string", "default": "ahk-credit-status-btn" }
          }
        }
      }
    }
  }
}
```

---

## INI → JSON Mapping Summary

| INI Section | JSON Path | Notes |
|------------|-----------|-------|
| `[Hotkeys]` | Removed | Replaced by `chrome.commands` in manifest.json |
| `[ComboSwitch.XPaths]` | `comboSwitch.xpaths` | |
| `[ComboSwitch.Transfer]` | `comboSwitch.fallbacks.transfer` | Pipe-separated → arrays |
| `[ComboSwitch.Combo1]` | `comboSwitch.fallbacks.combo1` | |
| `[ComboSwitch.Combo2]` | `comboSwitch.fallbacks.combo2` | |
| `[ComboSwitch.Options]` | `comboSwitch.fallbacks.options` | |
| `[ComboSwitch.Confirm]` | `comboSwitch.fallbacks.confirm` | |
| `[ComboSwitch.Timing]` | `comboSwitch.timing` | |
| `[ComboSwitch.ElementIDs]` | `comboSwitch.elementIds` | PascalCase → camelCase |
| `[ComboSwitch.Shortcuts]` | `comboSwitch.shortcuts` | |
| `[MacroLoop.Timing]` | `macroLoop.timing` | |
| `[MacroLoop.URLs]` | `macroLoop.urls` | |
| `[MacroLoop.XPaths]` | `macroLoop.xpaths` | |
| `[MacroLoop.ElementIDs]` | `macroLoop.elementIds` | |
| `[MacroLoop.Shortcuts]` | `macroLoop.shortcuts` | |
| `[CreditStatus.API]` | `creditStatus.api` | |
| `[CreditStatus.Timing]` | `creditStatus.timing` | `1`/`0` → `true`/`false` |
| `[CreditStatus.Retry]` | `creditStatus.retry` | |
| `[CreditStatus.XPaths]` | `creditStatus.xpaths` | |
| `[CreditStatus.ElementIDs]` | `creditStatus.elementIds` | |
| `[AHK.Timing]` | Removed | AHK-specific delays not needed |
| `[Gmail]` | Removed | Gmail automation is AHK-specific |
| `[General]` | `general` | `BrowserExe` removed (not needed) |

---

## Config Loading in Extension

```javascript
// background.js — Load config with remote endpoint support
async function loadConfig() {
  // 1. Try chrome.storage.local (user overrides)
  const stored = await chrome.storage.local.get('config');
  let config = stored.config || null;

  if (!config) {
    // 2. Fall back to bundled config.json
    const resp = await fetch(chrome.runtime.getURL('config.json'));
    config = await resp.json();
    await chrome.storage.local.set({ config });
  }

  // 3. If remote config is enabled, fetch and merge
  // See spec/11-chrome-extension/07-advanced-features.md for full implementation
  if (config.remoteConfig?.enabled) {
    config = await fetchAndMergeRemoteConfig(config);
  }

  return config;
}
```

Content scripts receive config via `chrome.runtime.sendMessage`:

```javascript
// content-script (combo.js / macro-looping.js)
chrome.runtime.sendMessage({ type: 'GET_CONFIG' }, function(config) {
  // Initialize controller with config
  initController(config);
});
```

---

## Additional Config Sections

The following config sections are defined in `07-advanced-features.md`:

| Section | Purpose |
|---------|---------|
| `remoteConfig` | Remote config endpoint definitions (URL, headers, refresh interval, merge strategy) |
| `scriptInjection` | Conditional script injection rules (URL patterns, path regex, conditions, scripts) |

See `spec/11-chrome-extension/07-advanced-features.md` for full schemas.
