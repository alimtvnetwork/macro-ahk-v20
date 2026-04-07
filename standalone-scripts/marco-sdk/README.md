# Rise Up Macro SDK

Core SDK for the Rise Up Macro extension. Provides a unified `marco.*` namespace for scripts running in the MAIN world.

## Namespace

| Module | Access | Description |
|--------|--------|-------------|
| `marco.auth` | `marco.auth.getToken()` | Token management |
| `marco.cookies` | `marco.cookies.get(name)` | Cookie access |
| `marco.config` | `marco.config.get(key)` | Project configuration |
| `marco.xpath` | `marco.xpath.resolve(key)` | XPath evaluation |
| `marco.kv` | `marco.kv.get(key)` | Key-value storage |
| `marco.files` | `marco.files.read(path)` | File storage |

## Architecture

- Injected as IIFE into MAIN world before all dependent projects
- Uses `window.postMessage` bridge to communicate with content script relay
- Content script forwards to background service worker via `chrome.runtime.sendMessage`
- `window.marco` is frozen — cannot be modified by consuming scripts

## Build

Compiled by the extension build pipeline. Output: `dist/marco-sdk.js`

## Spec

See `spec/12-devtools-and-injection/sdk-convention.md` for full API reference.
