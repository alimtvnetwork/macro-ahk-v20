# 23 — Sync Dashboard

> **Parent:** [20-frontend-overview.md](./20-frontend-overview.md)  
> **Status:** Complete

---

## Overview

The Sync Dashboard is the primary workspace for viewing file changes, comparing local vs remote states, and publishing plugins to WordPress sites. It provides real-time status updates and one-click publishing workflows.

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Sync Dashboard                                         [Check All Sites]│
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Plugin: [my-awesome-plugin ▼]        Site: [All Sites ▼]               │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Production Site                                                  │   │
│  │  https://example.com                                              │   │
│  │  Status: 3 files pending                    [Check] [Publish ▼]   │   │
│  │                                                                   │   │
│  │  ┌────────────────────────────────────────────────────────────┐  │   │
│  │  │ ☑ M  includes/class-main.php              +42 -12          │  │   │
│  │  │ ☑ M  assets/css/style.css                 +5 -2            │  │   │
│  │  │ ☑ A  includes/class-new-feature.php       +128             │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  │                                                                   │   │
│  │  □ Create backup before publishing           Last: 2 hours ago   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Staging Site                                                     │   │
│  │  https://staging.example.com                                      │   │
│  │  Status: ✓ In sync                          [Check] [Publish ▼]   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### SyncDashboard

Main container component orchestrating the sync workflow.

```typescript
// src/components/sync/SyncDashboard.tsx
export function SyncDashboard() {
  const [selectedPluginId, setSelectedPluginId] = useState<number | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<number | 'all'>('all');
  
  const { data: plugins } = usePlugins();
  const { data: mappings } = usePluginMappings(selectedPluginId);

  const checkAllMutation = useMutation({
    mutationFn: () => api.checkAllSites(selectedPluginId!),
    onSuccess: () => {
      toast.success('Sync check complete');
    },
  });

  // Filter mappings by selected site
  const filteredMappings = mappings?.filter(
    m => selectedSiteId === 'all' || m.siteId === selectedSiteId
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Sync Dashboard</h1>
        <Button 
          onClick={() => checkAllMutation.mutate()}
          disabled={!selectedPluginId || checkAllMutation.isPending}
        >
          {checkAllMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Checking...
            </>
          ) : (
            'Check All Sites'
          )}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="w-64">
          <Label className="text-sm text-muted-foreground mb-1.5 block">Plugin</Label>
          <Select
            value={selectedPluginId?.toString() ?? ''}
            onValueChange={(v) => setSelectedPluginId(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select plugin..." />
            </SelectTrigger>
            <SelectContent>
              {plugins?.map(plugin => (
                <SelectItem key={plugin.id} value={String(plugin.id)}>
                  {plugin.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-64">
          <Label className="text-sm text-muted-foreground mb-1.5 block">Site</Label>
          <Select
            value={selectedSiteId.toString()}
            onValueChange={(v) => setSelectedSiteId(v === 'all' ? 'all' : Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Sites" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sites</SelectItem>
              {mappings?.map(m => (
                <SelectItem key={m.siteId} value={String(m.siteId)}>
                  {m.siteName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Site Sync Cards */}
      {!selectedPluginId ? (
        <EmptyState
          icon={RefreshCw}
          title="Select a plugin"
          description="Choose a plugin to view its sync status across sites."
        />
      ) : filteredMappings?.length === 0 ? (
        <EmptyState
          icon={Link}
          title="No site mappings"
          description="This plugin isn't mapped to any sites yet."
          action={{ 
            label: "Manage Mappings", 
            onClick: () => navigate(`/plugins/${selectedPluginId}`) 
          }}
        />
      ) : (
        <div className="space-y-4">
          {filteredMappings?.map(mapping => (
            <SiteSyncCard
              key={mapping.id}
              mapping={mapping}
              pluginId={selectedPluginId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### SiteSyncCard

Displays sync status and file changes for a single site.

```typescript
// src/components/sync/SiteSyncCard.tsx
interface SiteSyncCardProps {
  mapping: PluginMapping;
  pluginId: number;
}

export function SiteSyncCard({ mapping, pluginId }: SiteSyncCardProps) {
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [createBackup, setCreateBackup] = useState(true);
  
  const { data: changes, isLoading, refetch } = useQuery({
    queryKey: ['fileChanges', pluginId, mapping.siteId],
    queryFn: () => api.getFileChanges(pluginId, mapping.siteId),
  });

  const checkMutation = useMutation({
    mutationFn: () => api.checkSync(pluginId, mapping.siteId),
    onSuccess: () => {
      refetch();
      toast.success('Sync check complete');
    },
  });

  const publishMutation = useMutation({
    mutationFn: (mode: 'selected' | 'full') => 
      api.publishPlugin(pluginId, mapping.siteId, {
        mode,
        files: mode === 'selected' ? Array.from(selectedFiles) : undefined,
        createBackup,
      }),
    onSuccess: (result) => {
      refetch();
      toast.success(`Published ${result.data.filesUpdated} files`);
      setSelectedFiles(new Set());
    },
    onError: (error) => {
      toast.error(`Publish failed: ${error.message}`);
    },
  });

  const pendingCount = changes?.data?.filter(c => c.status !== 'synced').length ?? 0;
  const allSelected = pendingCount > 0 && selectedFiles.size === pendingCount;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(
        changes?.data?.filter(c => c.status !== 'synced').map(c => c.path)
      ));
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{mapping.siteName}</h3>
            <p className="text-sm text-muted-foreground">{mapping.siteUrl}</p>
          </div>
          
          <div className="flex items-center gap-3">
            <SyncStatusBadge count={pendingCount} />
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkMutation.mutate()}
              disabled={checkMutation.isPending}
            >
              {checkMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                'Check'
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={publishMutation.isPending}>
                  {publishMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publishing...
                    </>
                  ) : (
                    <>
                      Publish
                      <ChevronDown className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => publishMutation.mutate('selected')}
                  disabled={selectedFiles.size === 0}
                >
                  <FileCheck className="w-4 h-4 mr-2" />
                  Publish Selected ({selectedFiles.size})
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => publishMutation.mutate('full')}>
                  <Package className="w-4 h-4 mr-2" />
                  Publish Full Plugin
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* File Changes */}
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : changes?.data && changes.data.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <button 
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2"
                onClick={toggleSelectAll}
              >
                <Checkbox checked={allSelected} />
                Select all
              </button>
            </div>
            
            <div className="border rounded-md divide-y max-h-64 overflow-auto">
              {changes.data.map(change => (
                <FileChangeRow
                  key={change.path}
                  change={change}
                  selected={selectedFiles.has(change.path)}
                  onToggle={() => {
                    const next = new Set(selectedFiles);
                    if (next.has(change.path)) {
                      next.delete(change.path);
                    } else {
                      next.add(change.path);
                    }
                    setSelectedFiles(next);
                  }}
                />
              ))}
            </div>
          </div>
        ) : pendingCount === 0 ? (
          <div className="flex items-center gap-2 text-green-600 py-4">
            <CheckCircle className="w-5 h-5" />
            <span>All files in sync</span>
          </div>
        ) : null}

        {/* Backup Toggle */}
        {pendingCount > 0 && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="backup" 
                checked={createBackup}
                onCheckedChange={(c) => setCreateBackup(!!c)}
              />
              <label htmlFor="backup" className="text-sm">
                Create backup before publishing
              </label>
            </div>
            {mapping.lastBackupAt && (
              <span className="text-xs text-muted-foreground">
                Last backup: {formatRelativeTime(mapping.lastBackupAt)}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### FileChangeRow

Individual file change with status indicator and diff stats.

```typescript
// src/components/sync/FileChangeRow.tsx
interface FileChangeRowProps {
  change: FileChange;
  selected: boolean;
  onToggle: () => void;
}

const statusConfig = {
  added: { icon: Plus, color: 'text-green-500', label: 'A' },
  modified: { icon: Edit2, color: 'text-yellow-500', label: 'M' },
  deleted: { icon: Minus, color: 'text-red-500', label: 'D' },
  renamed: { icon: ArrowRight, color: 'text-blue-500', label: 'R' },
  synced: { icon: Check, color: 'text-muted-foreground', label: '=' },
};

export function FileChangeRow({ change, selected, onToggle }: FileChangeRowProps) {
  const config = statusConfig[change.status];
  const isSynced = change.status === 'synced';

  return (
    <div 
      className={cn(
        "flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors",
        selected && "bg-primary/5"
      )}
    >
      {!isSynced && (
        <Checkbox 
          checked={selected} 
          onCheckedChange={onToggle}
        />
      )}
      
      <span className={cn(
        "font-mono text-xs font-bold w-4",
        config.color
      )}>
        {config.label}
      </span>
      
      <span className="font-mono text-sm flex-1 truncate">
        {change.path}
      </span>

      {change.stats && (
        <span className="text-xs text-muted-foreground">
          {change.stats.additions > 0 && (
            <span className="text-green-500">+{change.stats.additions}</span>
          )}
          {change.stats.additions > 0 && change.stats.deletions > 0 && ' '}
          {change.stats.deletions > 0 && (
            <span className="text-red-500">-{change.stats.deletions}</span>
          )}
        </span>
      )}
    </div>
  );
}
```

### SyncStatusBadge

Visual indicator for sync status.

```typescript
// src/components/sync/SyncStatusBadge.tsx
interface SyncStatusBadgeProps {
  count: number;
}

export function SyncStatusBadge({ count }: SyncStatusBadgeProps) {
  if (count === 0) {
    return (
      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
        <CheckCircle className="w-3 h-3 mr-1" />
        In sync
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
      <AlertCircle className="w-3 h-3 mr-1" />
      {count} file{count !== 1 ? 's' : ''} pending
    </Badge>
  );
}
```

---

## Data Types

```typescript
// src/types/sync.ts
export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'synced';
  localHash?: string;
  remoteHash?: string;
  localModifiedAt?: string;
  remoteModifiedAt?: string;
  stats?: {
    additions: number;
    deletions: number;
  };
}

export interface SyncResult {
  pluginId: number;
  siteId: number;
  totalFiles: number;
  changedFiles: number;
  addedFiles: number;
  modifiedFiles: number;
  deletedFiles: number;
  checkedAt: string;
}

export interface PublishInput {
  mode: 'selected' | 'full';
  files?: string[];
  createBackup: boolean;
}

export interface PublishResult {
  success: boolean;
  filesUpdated: number;
  backupId?: number;
  activationStatus: 'active' | 'inactive' | 'error';
  duration: number;
}
```

---

## Hook

```typescript
// src/hooks/useSync.ts
export function useFileChanges(pluginId: number, siteId: number) {
  return useQuery({
    queryKey: ['fileChanges', pluginId, siteId],
    queryFn: async () => {
      const response = await api.getFileChanges(pluginId, siteId);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!pluginId && !!siteId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

export function useCheckSync() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ pluginId, siteId }: { pluginId: number; siteId: number }) => {
      const response = await api.checkSync(pluginId, siteId);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (_, { pluginId, siteId }) => {
      queryClient.invalidateQueries({ queryKey: ['fileChanges', pluginId, siteId] });
    },
  });
}

export function usePublish() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      pluginId, 
      siteId, 
      options 
    }: { 
      pluginId: number; 
      siteId: number; 
      options: PublishInput 
    }) => {
      const response = await api.publishPlugin(pluginId, siteId, options);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (_, { pluginId, siteId }) => {
      queryClient.invalidateQueries({ queryKey: ['fileChanges', pluginId, siteId] });
      queryClient.invalidateQueries({ queryKey: ['backups', pluginId] });
    },
  });
}
```

---

## Real-Time Updates

The dashboard subscribes to WebSocket events for live updates:

```typescript
// In SyncDashboard component
useEffect(() => {
  const unsubFileChange = wsClient.on('file_change', (data) => {
    if (data.pluginId === selectedPluginId) {
      queryClient.invalidateQueries({ 
        queryKey: ['fileChanges', selectedPluginId] 
      });
    }
  });

  const unsubSyncProgress = wsClient.on('sync_progress', (data) => {
    // Update progress indicator
    setSyncProgress(data.progress);
  });

  const unsubPublishComplete = wsClient.on('publish_complete', (data) => {
    toast.success(`Published to ${data.siteName}`);
    queryClient.invalidateQueries({ queryKey: ['fileChanges'] });
  });

  return () => {
    unsubFileChange();
    unsubSyncProgress();
    unsubPublishComplete();
  };
}, [selectedPluginId, queryClient]);
```

---

## User Flows

### Check Sync Status

1. User selects plugin from dropdown
2. Site cards load with cached status
3. User clicks "Check" on a site card
4. Loading spinner appears
5. Backend compares local vs remote files
6. File change list updates with results

### Publish Selected Files

1. User checks specific files in the list
2. User optionally enables "Create backup"
3. User clicks Publish → Publish Selected
4. Progress indicator shows upload status
5. Toast confirms success/failure
6. File list refreshes, published files show as synced

### Publish Full Plugin

1. User clicks Publish → Publish Full Plugin
2. Confirmation dialog appears (optional)
3. Backend creates zip of entire plugin
4. Backup created if enabled
5. Zip uploaded to WordPress
6. Plugin auto-activated
7. Success toast with file count

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + A` | Select all files |
| `Ctrl/Cmd + Shift + A` | Deselect all |
| `Ctrl/Cmd + Enter` | Publish selected |
| `R` | Refresh sync status |

---

## Next Document

See [24-error-console.md](./24-error-console.md) for error viewing and debugging UI.
