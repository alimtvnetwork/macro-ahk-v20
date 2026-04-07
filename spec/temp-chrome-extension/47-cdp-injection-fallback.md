# Spec 47 — CDP Injection Fallback

**Created**: 2026-03-21
**Status**: Reference / Future Implementation
**Related**: Spec 05 (Content Script Adaptation), Spec 20 (Error Isolation), Spec 17 (Build System)

---

## 1. Problem Statement

The current injection pipeline relies on `chrome.scripting.executeScript()` with a 4-tier fallback chain (MAIN → userScripts → ISOLATED Blob → ISOLATED eval). All tiers operate within Chrome's extension security model, which means:

- **CSP-hardened pages** may block all execution worlds
- **Manifest V3 restrictions** limit what can run in the MAIN world
- **Third-party interference** (e.g., Osano.js patching `appendChild`) can break Blob URL injection

When all 4 tiers fail, the user has no recourse. A Chrome DevTools Protocol (CDP) fallback would provide a last-resort injection path.

---

## 2. What is CDP?

The **Chrome DevTools Protocol** exposes browser internals over a WebSocket connection. The relevant domain is `Runtime.evaluate`, which executes arbitrary JavaScript in the page context — bypassing CSP entirely.

### Connection methods

| Method | How | Pros | Cons |
|--------|-----|------|------|
| `chrome.debugger` API | Extension attaches via `chrome.debugger.attach(target)` | No external process; works from SW | Requires `debugger` permission; shows "debugging" infobar |
| Remote debugging port | Launch Chrome with `--remote-debugging-port=9222` | Full CDP access; no infobar | Requires controlled Chrome launch; not portable |
| WebSocket (via `run.ps1`) | PowerShell connects to `ws://localhost:9222/devtools/page/{id}` | Works from AHK/PS layer; no extension needed | Requires `--remote-debugging-port`; port management |

---

## 3. Architecture: `chrome.debugger` Approach (Recommended)

This approach keeps everything inside the extension — no external process needed.

### 3.1 Manifest Changes

```json
{
  "permissions": ["debugger"],
  "optional_permissions": ["debugger"]
}
```

> **Note**: Using `"optional_permissions"` avoids the scary install prompt. The permission is requested only when the 4-tier chain has failed.

### 3.2 Injection Flow

```
4-tier chain fails
  → User sees "All injection methods blocked" error
  → Popup shows "Enable CDP Fallback" button
  → Extension requests `debugger` permission (if not granted)
  → chrome.debugger.attach({ tabId }, "1.3")
  → chrome.debugger.sendCommand(target, "Runtime.evaluate", {
        expression: wrappedCode,
        awaitPromise: false,
        returnByValue: true
    })
  → chrome.debugger.detach(target)
  → Log result as injectionPath: "cdp-debugger"
```

### 3.3 Key Functions

```typescript
// src/background/injection/cdp-fallback.ts

export async function injectViaCdp(
    tabId: number,
    code: string
): Promise<{ success: boolean; path: "cdp-debugger" }> {
    const target = { tabId };

    await chrome.debugger.attach(target, "1.3");

    try {
        const result = await chrome.debugger.sendCommand(
            target,
            "Runtime.evaluate",
            {
                expression: code,
                awaitPromise: false,
                returnByValue: true,
                silent: true,
            }
        );

        const hasError = result?.exceptionDetails !== undefined;

        if (hasError) {
            throw new Error(
                result.exceptionDetails?.exception?.description ??
                "CDP evaluation failed"
            );
        }

        return { success: true, path: "cdp-debugger" };
    } finally {
        await chrome.debugger.detach(target).catch(() => {});
    }
}
```

### 3.4 Integration Point

In `src/background/injection/csp-fallback-injector.ts`, after the ISOLATED eval tier fails:

```typescript
// Tier 5: CDP debugger (last resort)
if (!result.success) {
    const hasCdpPermission = await chrome.permissions.contains({
        permissions: ["debugger"],
    });

    if (hasCdpPermission) {
        result = await injectViaCdp(tabId, wrappedCode);
    }
}
```

---

## 4. Architecture: WebSocket Approach (AHK/PowerShell Layer)

For environments where the extension cannot use `chrome.debugger` (e.g., managed Chrome policies), the PowerShell installer can connect directly.

### 4.1 Prerequisites

Chrome must be launched with:
```
chrome.exe --remote-debugging-port=9222
```

The `run.ps1` installer already supports this via the `-d` (deploy) flag.

### 4.2 Flow

```
run.ps1 -d
  → Launches Chrome with --remote-debugging-port=9222
  → GET http://localhost:9222/json → list of page targets
  → Find target matching lovable.dev URL
  → WebSocket connect to target.webSocketDebuggerUrl
  → Send: { "id": 1, "method": "Runtime.evaluate", "params": { "expression": "..." } }
  → Receive: { "id": 1, "result": { "result": { "type": "...", "value": "..." } } }
  → Close WebSocket
```

### 4.3 PowerShell Implementation Sketch

```powershell
function Invoke-CdpEval {
    param([string]$Code, [int]$Port = 9222)

    $pages = Invoke-RestMethod "http://localhost:$Port/json"
    $target = $pages | Where-Object { $_.url -match 'lovable\.dev' } | Select-Object -First 1

    if (-not $target) { throw "No Lovable tab found" }

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $uri = [Uri]$target.webSocketDebuggerUrl
    $ws.ConnectAsync($uri, [Threading.CancellationToken]::None).Wait()

    $msg = @{
        id = 1
        method = "Runtime.evaluate"
        params = @{ expression = $Code; returnByValue = $true }
    } | ConvertTo-Json -Compress

    $bytes = [Text.Encoding]::UTF8.GetBytes($msg)
    $segment = [ArraySegment[byte]]::new($bytes)
    $ws.SendAsync($segment, 'Text', $true, [Threading.CancellationToken]::None).Wait()

    # Read response
    $buf = [byte[]]::new(65536)
    $seg = [ArraySegment[byte]]::new($buf)
    $result = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).Result
    $response = [Text.Encoding]::UTF8.GetString($buf, 0, $result.Count)

    $ws.CloseAsync('NormalClosure', '', [Threading.CancellationToken]::None).Wait()

    return $response | ConvertFrom-Json
}
```

---

## 5. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| `debugger` permission is sensitive | Use `optional_permissions`; request only after all tiers fail |
| Infobar ("Extension is debugging this browser") | Detach immediately after injection; infobar disappears |
| Remote debugging port exposure | Bind to `localhost` only (default); `run.ps1` does not expose externally |
| Arbitrary code execution | Same trust model as current injection — user-authored scripts only |
| CDP session hijacking | WebSocket on localhost; no external network exposure |

---

## 6. UX Considerations

### Popup UI Changes

When all 4 tiers fail and CDP is available:

```
┌─────────────────────────────────────┐
│ ⚠️ All injection methods blocked    │
│                                     │
│ This page's security policy blocks  │
│ script injection. CDP fallback can  │
│ bypass this restriction.            │
│                                     │
│ [Enable CDP Fallback]               │
│                                     │
│ ℹ️ A "debugging" banner will appear │
│   briefly while the script runs.    │
└─────────────────────────────────────┘
```

### Diagnostics Integration

- Log CDP attempts in the injection diagnostics panel
- Show `injectionPath: "cdp-debugger"` in injection results
- Track CDP usage in health metrics (DEGRADED state, same as CSP fallback)

---

## 7. Limitations

- **Managed Chrome policies** may disable `chrome.debugger` API entirely
- **Chrome Web Store** may flag extensions using `debugger` permission during review
- **Infobar** is unavoidable during the attach/detach window (typically < 500ms)
- **Multiple tabs**: Each `debugger.attach` is per-tab; no global injection

---

## 8. Implementation Priority

This is a **Tier 5 fallback** — most users will never need it. Implementation should be deferred until there are confirmed reports of all 4 tiers failing on a target site.

### When to implement

1. User reports "All injection tiers failed" on a specific site
2. The site's CSP blocks both MAIN and ISOLATED worlds
3. `chrome.userScripts` is unavailable or insufficient

### Estimated effort

| Component | Effort |
|-----------|--------|
| `cdp-fallback.ts` module | 2 hours |
| Permission request UI flow | 1 hour |
| Diagnostics panel integration | 1 hour |
| PowerShell WebSocket fallback | 2 hours |
| Tests (mock `chrome.debugger`) | 2 hours |
| **Total** | **~8 hours** |

---

## 9. References

- [Chrome DevTools Protocol — Runtime domain](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/)
- [chrome.debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger)
- [Remote Debugging Protocol](https://developer.chrome.com/docs/devtools/remote-debugging/)
- Spec 05: Content Script Adaptation
- Spec 20: User Script Error Isolation
