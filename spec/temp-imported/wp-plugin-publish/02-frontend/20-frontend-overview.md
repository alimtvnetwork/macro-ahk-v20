# 20 — Frontend Overview

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The React frontend provides a local UI for managing WordPress sites, plugins, sync status, and publishing operations.

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| React Router | Navigation |
| TanStack Query | Server state management |
| WebSocket | Real-time updates |
| Zustand | Client state (optional) |

---

## Directory Structure

```
web/
├── src/
│   ├── components/
│   │   ├── ui/                    # Base UI components (shadcn/ui)
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── sites/
│   │   │   ├── SiteCard.tsx
│   │   │   ├── SiteForm.tsx
│   │   │   └── SiteList.tsx
│   │   ├── plugins/
│   │   │   ├── PluginCard.tsx
│   │   │   ├── PluginForm.tsx
│   │   │   └── PluginList.tsx
│   │   ├── sync/
│   │   │   ├── SyncStatus.tsx
│   │   │   ├── FileChangeList.tsx
│   │   │   └── SyncActions.tsx
│   │   └── errors/
│   │       ├── ErrorConsole.tsx
│   │       ├── ErrorCard.tsx
│   │       └── ErrorCopyButton.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Sites.tsx
│   │   ├── Plugins.tsx
│   │   ├── Sync.tsx
│   │   ├── Settings.tsx
│   │   └── Errors.tsx
│   ├── hooks/
│   │   ├── useSites.ts
│   │   ├── usePlugins.ts
│   │   ├── useSync.ts
│   │   ├── useWebSocket.ts
│   │   └── useErrors.ts
│   ├── lib/
│   │   ├── api.ts                 # API client
│   │   ├── ws.ts                  # WebSocket client
│   │   └── utils.ts
│   ├── types/
│   │   ├── site.ts
│   │   ├── plugin.ts
│   │   ├── sync.ts
│   │   └── error.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
└── vite.config.ts
```

---

## Page Structure

### Dashboard

Main overview page showing:
- Connected sites count
- Registered plugins count
- Pending file changes
- Recent sync activity
- Quick actions

### Sites Page

CRUD interface for WordPress sites:
- List of connected sites
- Add new site form
- Test connection button
- Edit/delete actions

### Plugins Page

Plugin directory management:
- List of registered plugins
- Add plugin form (browse for directory)
- Map plugin to site
- Enable/disable file watching

### Sync Page

Change detection and publishing:
- Pending changes per plugin
- Diff viewer (local vs remote)
- Publish single file / full plugin buttons
- Backup before publish toggle

### Settings Page

Application configuration:
- File watcher settings
- Backup retention
- Log level
- Theme (light/dark)

### Errors Page

Error console for debugging:
- Scrollable error list
- Filter by level/code
- Expand for full details
- Copy to clipboard button
- Copied reports MUST include app name + version (from `public/version.json`)

---

## API Client

### Endpoint Resolution (CRITICAL)

The API base URL is resolved via environment variables. This is the **single source of truth** for frontend→backend connectivity.

```typescript
// src/lib/endpoints.ts
const API_PREFIX = "/api/v1";

export function resolveApiOrigin(): string | undefined {
  return import.meta.env.VITE_API_URL as string | undefined;
}

export function resolveApiBase(): string {
  const origin = resolveApiOrigin();
  return origin ? `${origin.replace(/\/$/, "")}${API_PREFIX}` : API_PREFIX;
}
```

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_API_URL` | Backend origin (optional) | `http://localhost:8080` |
| `VITE_WS_URL` | WebSocket URL (optional) | `ws://localhost:8080/ws` |

If not set, defaults to same-origin (works when UI is served by the Go backend).

### HTML-vs-JSON Detection

The API client detects when the backend returns HTML instead of JSON (common when:
- UI is loaded from hosted preview instead of localhost
- Backend is not running
- Wrong port/URL configured)

When this happens, a structured error `E9005` is raised with full diagnostics:

```typescript
// Error context includes:
{
  requestUrl: "http://localhost:8080/api/v1/plugins",
  apiBase: "/api/v1",
  apiOrigin: null,  // or the VITE_API_URL value
  responseStatus: 200,
  contentType: "text/html",
  responsePreview: "<!doctype html>..."
}
```

### IMPORTANT: Hosted Preview Limitation

The hosted Lovable preview (`*.lovable.app`) **cannot reach your local Go backend** on `localhost:8080`.

To use the app:
1. Run the backend: `.\run.ps1 -r`
2. Open `http://localhost:8080` in your browser (served by Go)

### API Response Wrapper

```typescript
// src/lib/api.ts
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

// Throws ApiClientError for failed responses (integrates with GlobalErrorModal)
export function requireSuccess<T>(response: ApiResponse<T>, meta: ApiCallMeta): T {
  if (response.success) return response.data as T;
  throw new ApiClientError(response.error!, meta);
}
```

---

## WebSocket Client

```typescript
// src/lib/ws.ts
import { resolveWsUrl } from "@/lib/endpoints";

type EventHandler = (data: unknown) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private url: string = resolveWsUrl();

  connect() {
    this.ws = new WebSocket(this.url);
    // ... reconnect logic
  }
}

export const wsClient = new WebSocketClient();
```

WebSocket URL resolution follows the same pattern as API:
- Uses `VITE_WS_URL` if set
- Otherwise derives from `window.location` (same-origin)

---

## WebSocket Hook

```typescript
// src/hooks/useWebSocket.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { wsClient } from '@/lib/ws';

export function useWebSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    wsClient.connect();

    // File change events
    const unsubFileChange = wsClient.on('file_change', (data) => {
      queryClient.invalidateQueries({ queryKey: ['fileChanges', data.pluginId] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    });

    // Sync complete events
    const unsubSyncComplete = wsClient.on('sync_complete', (data) => {
      queryClient.invalidateQueries({ queryKey: ['plugins', data.pluginId] });
      queryClient.invalidateQueries({ queryKey: ['syncRecords'] });
    });

    // Error events
    const unsubError = wsClient.on('error', (data) => {
      queryClient.invalidateQueries({ queryKey: ['errors'] });
    });

    return () => {
      unsubFileChange();
      unsubSyncComplete();
      unsubError();
      wsClient.disconnect();
    };
  }, [queryClient]);
}
```

---

## Theme System

Uses CSS variables for theming:

```css
/* src/index.css */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... other tokens */
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... dark mode tokens */
}
```

---

## Next Document

See [21-site-manager-ui.md](./21-site-manager-ui.md) for site management UI details.
