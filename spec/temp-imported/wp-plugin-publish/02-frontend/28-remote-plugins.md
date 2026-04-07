# 28 — Remote Plugin Management

> **Parent:** [20-frontend-overview.md](./20-frontend-overview.md)  
> **Status:** Active

---

## Overview

Remote Plugin Management allows users to view and control all plugins installed on a WordPress site directly from the dashboard. This provides centralized management without requiring direct WordPress dashboard access.

---

## User Flow

```
┌───────────────────┐
│   Site Card       │
│   🔌 Plugins      │──▶ Click "Plugins" button
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────┐
│       Remote Plugins Panel            │
│  ┌─────────────────────────────────┐  │
│  │  🔍 Search plugins...           │  │
│  └─────────────────────────────────┘  │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │ Plugin Name      Status  Actions │ │
│  │ ─────────────────────────────── │  │
│  │ Akismet          🟢 Active   ⋮  │  │
│  │ Hello Dolly      ⚫ Inactive ⋮  │  │
│  │ Category Gen     🟢 Active   ⋮  │  │
│  └─────────────────────────────────┘  │
│                                       │
│  [Close]                              │
└───────────────────────────────────────┘
```

---

## Components

### RemotePluginsPanel

**Location:** `src/components/sites/RemotePluginsPanel.tsx`

Main dialog component for remote plugin management:

```tsx
interface RemotePluginsPanelProps {
  siteId: number;
  siteName: string;
  siteUrl: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
```

### Features

| Feature | Description |
|---------|-------------|
| Search | Filter plugins by name |
| Status filter | Show all / active / inactive |
| Enable/Disable | Toggle plugin activation |
| Delete | Remove plugin (with confirmation) |
| Refresh | Reload plugin list |

---

## Data Structures

### RemotePlugin

```typescript
interface RemotePlugin {
  plugin: string;        // Plugin file path (e.g., "akismet/akismet.php")
  name: string;          // Display name
  status: 'active' | 'inactive' | 'network-active';
  version: string;
  author: string;
  description: string;
  pluginUri?: string;    // Plugin website
  authorUri?: string;    // Author website
  textDomain?: string;
  networkOnly?: boolean;
}
```

### Slug Extraction

The plugin slug is extracted from the `plugin` field:

```typescript
// "akismet/akismet.php" → "akismet"
// "hello.php" → "hello"
const getSlug = (plugin: string): string => {
  const parts = plugin.split('/');
  return parts[0];
};
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/sites/{id}/remote-plugins` | List all plugins |
| `POST` | `/api/v1/sites/{id}/remote-plugins/{slug}/enable` | Activate plugin |
| `POST` | `/api/v1/sites/{id}/remote-plugins/{slug}/disable` | Deactivate plugin |
| `DELETE` | `/api/v1/sites/{id}/remote-plugins/{slug}` | Delete plugin |

### API Client Methods

```typescript
// In src/lib/api.ts
async getRemotePlugins(siteId: number): Promise<RemotePlugin[]>
async enableRemotePlugin(siteId: number, slug: string): Promise<void>
async disableRemotePlugin(siteId: number, slug: string): Promise<void>
async deleteRemotePlugin(siteId: number, slug: string): Promise<void>
```

---

## UI States

### Loading State

```tsx
<div className="flex items-center justify-center p-8">
  <Loader2 className="h-6 w-6 animate-spin" />
  <span className="ml-2">Loading plugins...</span>
</div>
```

### Empty State

```tsx
<EmptyState
  icon={<Package className="h-12 w-12" />}
  title="No plugins found"
  description="This site has no plugins installed."
/>
```

### Error State

```tsx
<Alert variant="destructive">
  <AlertCircle className="h-4 w-4" />
  <AlertTitle>Failed to load plugins</AlertTitle>
  <AlertDescription>{error.message}</AlertDescription>
</Alert>
```

---

## Actions

### Enable/Disable Toggle

```tsx
<Switch
  checked={plugin.status === 'active'}
  onCheckedChange={(checked) => {
    if (checked) {
      enableMutation.mutate(plugin.slug);
    } else {
      disableMutation.mutate(plugin.slug);
    }
  }}
  disabled={isOperating}
/>
```

### Delete with Confirmation

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive" size="sm">
      <Trash2 className="h-4 w-4" />
    </Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Plugin</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete "{plugin.name}"? This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => deleteMutation.mutate(plugin.slug)}>
        Delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## Status Indicators

| Status | Icon | Color |
|--------|------|-------|
| Active | 🟢 | Green |
| Inactive | ⚫ | Gray |
| Network Active | 🔵 | Blue |
| Must-Use | 🟡 | Yellow |

---

## Error Handling

Operations display toast notifications:

```typescript
// Success
toast.success(`${plugin.name} activated`);

// Error
toast.error(`Failed to activate plugin: ${error.message}`);
```

For detailed errors, the error is captured to the global error store with full context.

---

## Backend Implementation

### WordPress Client Methods

```go
// Get all plugins from remote site
func (c *Client) ListPlugins() ([]PluginInfo, error)

// Enable a plugin
func (c *Client) EnablePlugin(slug string) error

// Disable a plugin
func (c *Client) DisablePlugin(slug string) error

// Delete a plugin
func (c *Client) DeletePlugin(slug string) error
```

### Site Service Methods

```go
// Proxy methods that handle site lookup and client creation
func (s *Service) GetRemotePlugins(siteID int64) ([]wordpress.PluginInfo, error)
func (s *Service) EnableRemotePlugin(siteID int64, slug string) error
func (s *Service) DisableRemotePlugin(siteID int64, slug string) error
func (s *Service) DeleteRemotePlugin(siteID int64, slug string) error
```

---

## WordPress REST API

The feature uses the WordPress Plugins REST API:

| Action | WordPress Endpoint |
|--------|-------------------|
| List | `GET /wp-json/wp/v2/plugins` |
| Enable | `POST /wp-json/wp/v2/plugins/{plugin}` with `{"status": "active"}` |
| Disable | `POST /wp-json/wp/v2/plugins/{plugin}` with `{"status": "inactive"}` |
| Delete | `DELETE /wp-json/wp/v2/plugins/{plugin}` |

**Note:** Plugin file path in URL is encoded (e.g., `akismet%2Fakismet.php`).

---

## Access Requirements

To manage remote plugins, the WordPress user must have:

- `activate_plugins` capability
- `delete_plugins` capability (for deletion)
- Valid application password configured

---

## Related Files

- `src/components/sites/RemotePluginsPanel.tsx` — Panel component
- `src/components/sites/SiteCard.tsx` — Card with Plugins button
- `src/lib/api.ts` — API client methods
- `backend/internal/wordpress/client.go` — WordPress client
- `backend/internal/services/site/service.go` — Site service
- `backend/internal/api/handlers/handlers.go` — HTTP handlers

---

## Future Enhancements

1. **Bulk Actions** — Select multiple plugins for enable/disable/delete
2. **Plugin Updates** — Check for and install plugin updates
3. **Plugin Backup** — Download plugin as ZIP before deletion
4. **Version History** — Track plugin version changes over time
