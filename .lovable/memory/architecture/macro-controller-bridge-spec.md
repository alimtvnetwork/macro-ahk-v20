# Memory: architecture/macro-controller-bridge-spec
Updated: 2026-03-19

## Macro Controller ↔ Chrome Extension Bridge

The injected macro controller (`macro-looping.js`) communicates with the Chrome extension via a **Content Script Bridge**:

```
macro-looping.js → window.postMessage → Content Script → chrome.runtime.sendMessage → Background Service Worker
```

Response flow is reversed. The `window.marco` SDK (injected before user scripts) provides the API.

### Available Services

- **Storage**: `marco.store.set/get/delete/keys/getAll/clear` → `chrome.storage.local`
- **Logging**: `marco.log.info/warn/error/debug` → SQLite `logs.db`/`errors.db`
- **Planned**: Config read, action triggers, UI sync broadcasts

### Key Files

- `spec/11-chrome-extension/43-macro-controller-extension-bridge.md` — Full bridge API spec
- `spec/11-chrome-extension/42-user-script-logging-and-data-bridge.md` — `window.marco` SDK spec
- `spec/11-chrome-extension/18-message-protocol.md` — Message type registry
- `src/background/handlers/data-bridge-handler.ts` — Storage handler implementation
- `src/background/message-router.ts` — Message routing

### Constraints

- Key max: 256 chars, Value max: 1 MB, Total: 50 MB, Keys per project: 1,000
- Rate limit: 100 messages/second
- No AHK involvement — Chrome extension only
