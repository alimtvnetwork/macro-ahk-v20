# 27 — Quick Publish Feature

> **Parent:** [20-frontend-overview.md](./20-frontend-overview.md)  
> **Status:** Active

---

## Overview

Quick Publish enables one-click deployment of plugins to all mapped sites without opening a modal dialog. Operations run in the background, allowing users to navigate freely while monitoring progress via a global indicator.

---

## User Flow

```
┌───────────────────┐
│   Plugin Card     │
│   ⚡ Quick Publish │──▶ Click ⚡ button
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Inline Indicator │──▶ Spinner with progress %
│  "Publishing..."  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Global Header     │──▶ Shows active operation count
│ 📤 1 publishing   │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Complete State   │──▶ ✓ checkmark on card
└───────────────────┘
```

---

## Components

### QuickPublishIndicator

**Location:** `src/components/plugins/QuickPublishIndicator.tsx`

Inline indicator shown on plugin cards during quick publish:

```tsx
interface QuickPublishIndicatorProps {
  pluginId: number;
}

// States:
// - idle: No active operation
// - running: Spinner + progress percentage
// - success: Green checkmark (auto-fades after 5s)
// - error: Red X with "View Details" link
```

### GlobalPublishProgress

**Location:** `src/components/plugins/GlobalPublishProgress.tsx`

Header component showing all active publish operations:

```tsx
// Shows in header when operations are active
// Click to open sheet with full operation list
// Each operation shows: plugin name, site name, progress, status
```

---

## Global State (Zustand)

**Location:** `src/stores/publishStore.ts`

```typescript
interface PublishOperation {
  id: string;                    // Unique operation ID
  pluginId: number;
  pluginName: string;
  siteId: number;
  siteName: string;
  siteUrl: string;
  sessionId: string;             // Backend session ID
  status: 'pending' | 'running' | 'success' | 'error';
  progress: number;              // 0-100
  stage: string;                 // Current stage name
  message: string;               // Status message
  error?: string;                // Error message if failed
  startedAt: Date;
  completedAt?: Date;
  logs: PublishLogEntry[];       // Real-time logs
}

interface PublishStore {
  operations: Map<string, PublishOperation>;
  
  // Actions
  startOperation: (op: Omit<PublishOperation, 'id' | 'status' | 'startedAt'>) => string;
  updateProgress: (id: string, progress: number, stage: string, message: string) => void;
  completeOperation: (id: string, success: boolean, error?: string) => void;
  addLog: (id: string, log: PublishLogEntry) => void;
  clearCompleted: () => void;
  
  // Computed
  activeCount: number;
  hasErrors: boolean;
}
```

### State Persistence

- Operations persist across route navigation
- Completed operations auto-cleanup after 30 minutes
- Error operations preserved until explicitly dismissed

---

## Hook: useQuickPublish

**Location:** `src/hooks/useQuickPublish.ts`

```typescript
function useQuickPublish() {
  // Publish to all mapped sites
  const quickPublishAll = async (plugin: Plugin): Promise<void>;
  
  // Publish to a single site
  const quickPublishToSite = async (
    plugin: Plugin,
    siteId: number,
    siteName: string,
    siteUrl: string
  ): Promise<void>;
  
  // Check if plugin has active operation
  const isPublishing = (pluginId: number): boolean;
  
  // Get operations for a plugin
  const getOperations = (pluginId: number): PublishOperation[];
}
```

### WebSocket Integration

The hook listens for WebSocket events:

| Event | Action |
|-------|--------|
| `publish_progress` | Update operation progress |
| `publish_complete` | Mark operation complete |
| `publish_error` | Mark operation failed |
| `stage_complete` | Log stage timing |
| `log` | Append to operation logs |

---

## API Integration

### Triggering Quick Publish

```typescript
// POST /api/v1/plugins/{id}/publish
const response = await api.publishPlugin(pluginId, {
  siteId: siteId,
  uploadMode: 'full'  // or 'incremental'
});

// Response includes sessionId for log correlation
interface PublishResponse {
  success: boolean;
  sessionId: string;
  result?: {
    filesUploaded: number;
    bytesTransferred: number;
  };
}
```

---

## UI States

### Card States

| State | Appearance |
|-------|------------|
| Idle | Normal card, ⚡ button visible |
| Publishing | ⚡ button disabled, spinner overlay |
| Success | Brief ✓ animation, fades after 5s |
| Error | ✗ icon, "View Details" link |

### Header Indicator States

| State | Appearance |
|-------|------------|
| No operations | Hidden |
| 1+ active | Badge showing count + progress ring |
| All complete | Brief success flash, then hide |
| Has errors | Red badge, persistent until viewed |

---

## Error Handling

When a quick publish fails:

1. Operation marked as `error` in store
2. Card shows error state with "View Details"
3. Header indicator shows error badge
4. Clicking opens GlobalErrorModal with:
   - Error details
   - Session ID for log retrieval
   - "Session" tab with full backend logs

```typescript
// On error, capture to error store
errorStore.captureError({
  code: error.code,
  message: error.message,
  sessionId: operation.sessionId,
  sessionType: 'publish',
  context: {
    pluginId: operation.pluginId,
    siteId: operation.siteId,
    stage: operation.stage
  }
});
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Quick publish selected plugin |
| `Esc` | Dismiss success indicators |

---

## Performance Considerations

- WebSocket listeners cleaned up on component unmount
- Completed operations garbage collected after 30 minutes
- Log arrays truncated to last 1000 entries per operation
- Progress updates throttled to 100ms intervals

---

## Related Files

- `src/stores/publishStore.ts` — Global state management
- `src/hooks/useQuickPublish.ts` — Quick publish logic
- `src/components/plugins/QuickPublishIndicator.tsx` — Card indicator
- `src/components/plugins/GlobalPublishProgress.tsx` — Header component

---

## Next Document

See [28-remote-plugins.md](./28-remote-plugins.md) for remote plugin management UI.
