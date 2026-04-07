# 22 — Plugin Manager UI

> **Parent:** [20-frontend-overview.md](./20-frontend-overview.md)  
> **Status:** Complete

---

## Overview

The Plugin Manager UI handles registration of local plugin directories and mapping them to remote WordPress sites. Users can browse for plugin folders, configure file watching, and manage site-plugin associations.

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Plugins                                              [+ Register Plugin]│
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  📦 my-awesome-plugin                                             │   │
│  │  /Users/dev/plugins/my-awesome-plugin                            │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ Mapped Sites:                                            │     │   │
│  │  │  • Production Site (my-awesome-plugin)                   │     │   │
│  │  │  • Staging Site (my-awesome-plugin)                      │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │  👁 Watching: ON    │    Files: 47    │    Modified: 3          │   │
│  │                                              [Mappings] [Edit] [✕]│   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  📦 client-dashboard                                              │   │
│  │  /Users/dev/plugins/client-dashboard                             │   │
│  │  ┌─────────────────────────────────────────────────────────┐     │   │
│  │  │ Mapped Sites:                                            │     │   │
│  │  │  • Local Dev (client-dashboard-dev)                      │     │   │
│  │  └─────────────────────────────────────────────────────────┘     │   │
│  │  👁 Watching: OFF   │    Files: 23    │    Modified: 0          │   │
│  │                                              [Mappings] [Edit] [✕]│   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### PluginList

Container component that displays all registered plugins.

```typescript
// src/components/plugins/PluginList.tsx
interface PluginListProps {
  onAddPlugin: () => void;
  onEditPlugin: (plugin: Plugin) => void;
  onManageMappings: (plugin: Plugin) => void;
}

export function PluginList({ onAddPlugin, onEditPlugin, onManageMappings }: PluginListProps) {
  const { data: plugins, isLoading } = useQuery({
    queryKey: ['plugins'],
    queryFn: () => api.getPlugins(),
  });

  if (isLoading) return <PluginListSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Plugins</h1>
        <Button onClick={onAddPlugin}>
          <Plus className="w-4 h-4 mr-2" />
          Register Plugin
        </Button>
      </div>
      
      {plugins?.data?.length === 0 ? (
        <EmptyState 
          icon={Package}
          title="No plugins registered"
          description="Register a local plugin directory to start syncing."
          action={{ label: "Register Plugin", onClick: onAddPlugin }}
        />
      ) : (
        <div className="grid gap-4">
          {plugins?.data?.map(plugin => (
            <PluginCard 
              key={plugin.id} 
              plugin={plugin} 
              onEdit={() => onEditPlugin(plugin)}
              onManageMappings={() => onManageMappings(plugin)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### PluginCard

Displays individual plugin information with stats and actions.

```typescript
// src/components/plugins/PluginCard.tsx
interface PluginCardProps {
  plugin: Plugin;
  onEdit: () => void;
  onManageMappings: () => void;
}

export function PluginCard({ plugin, onEdit, onManageMappings }: PluginCardProps) {
  const queryClient = useQueryClient();
  
  const toggleWatchMutation = useMutation({
    mutationFn: () => api.updatePlugin(plugin.id, { 
      watchEnabled: !plugin.watchEnabled 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      toast.success(plugin.watchEnabled ? 'Watching disabled' : 'Watching enabled');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deletePlugin(plugin.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      toast.success('Plugin removed');
    },
  });

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Package className="w-8 h-8 text-muted-foreground" />
            <div>
              <h3 className="font-semibold">{plugin.name}</h3>
              <p className="text-sm text-muted-foreground font-mono">{plugin.path}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onManageMappings}>
              Mappings
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <X className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove plugin?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will unregister "{plugin.name}" and remove all site mappings.
                    Your local files will not be affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={() => deleteMutation.mutate()}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Mapped Sites */}
        {plugin.mappings && plugin.mappings.length > 0 && (
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-xs font-medium text-muted-foreground mb-2">Mapped Sites:</p>
            <ul className="space-y-1">
              {plugin.mappings.map(mapping => (
                <li key={mapping.id} className="text-sm flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {mapping.siteName} 
                  <span className="text-muted-foreground">({mapping.remoteSlug})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-4 pt-2 border-t text-sm">
          <button 
            className="flex items-center gap-1.5 hover:text-primary transition-colors"
            onClick={() => toggleWatchMutation.mutate()}
            disabled={toggleWatchMutation.isPending}
          >
            <Eye className={cn(
              "w-4 h-4",
              plugin.watchEnabled ? "text-green-500" : "text-muted-foreground"
            )} />
            <span>Watching: {plugin.watchEnabled ? 'ON' : 'OFF'}</span>
          </button>
          
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <FileText className="w-4 h-4" />
            Files: {plugin.fileCount}
          </span>
          
          <span className={cn(
            "flex items-center gap-1.5",
            plugin.modifiedCount > 0 ? "text-yellow-600" : "text-muted-foreground"
          )}>
            <AlertCircle className="w-4 h-4" />
            Modified: {plugin.modifiedCount}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
```

### PluginForm

Modal form for registering/editing plugins.

```typescript
// src/components/plugins/PluginForm.tsx
interface PluginFormProps {
  plugin?: Plugin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const pluginSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  path: z.string().min(1, 'Path is required'),
  watchEnabled: z.boolean(),
  excludePatterns: z.string(), // comma-separated
});

type PluginFormData = z.infer<typeof pluginSchema>;

export function PluginForm({ plugin, open, onOpenChange }: PluginFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!plugin;

  const form = useForm<PluginFormData>({
    resolver: zodResolver(pluginSchema),
    defaultValues: {
      name: plugin?.name ?? '',
      path: plugin?.path ?? '',
      watchEnabled: plugin?.watchEnabled ?? true,
      excludePatterns: plugin?.excludePatterns?.join(', ') ?? '.git, node_modules, .DS_Store',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: PluginFormData) => {
      const payload = {
        ...data,
        excludePatterns: data.excludePatterns
          .split(',')
          .map(p => p.trim())
          .filter(Boolean),
      };
      return isEditing 
        ? api.updatePlugin(plugin.id, payload)
        : api.createPlugin(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      toast.success(isEditing ? 'Plugin updated' : 'Plugin registered');
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const browseMutation = useMutation({
    mutationFn: () => api.browseDirectory(),
    onSuccess: (result) => {
      if (result.data?.path) {
        form.setValue('path', result.data.path);
        // Auto-fill name from directory name
        const dirName = result.data.path.split('/').pop() || '';
        if (!form.getValues('name')) {
          form.setValue('name', dirName);
        }
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Plugin' : 'Register Plugin'}</DialogTitle>
          <DialogDescription>
            Register a local plugin directory to enable syncing with WordPress sites.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plugin Name</FormLabel>
                  <FormControl>
                    <Input placeholder="my-awesome-plugin" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="path"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plugin Directory</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input 
                        placeholder="/path/to/plugin" 
                        {...field} 
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => browseMutation.mutate()}
                      disabled={browseMutation.isPending}
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                  <FormDescription>
                    The local directory containing your plugin files
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="watchEnabled"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <FormLabel className="font-normal">Enable File Watching</FormLabel>
                    <FormDescription>
                      Automatically detect file changes
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="excludePatterns"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Exclude Patterns</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder=".git, node_modules, .DS_Store" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Comma-separated patterns to ignore
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Register')}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### PluginMappingDialog

Manage site-plugin mappings for a plugin.

```typescript
// src/components/plugins/PluginMappingDialog.tsx
interface PluginMappingDialogProps {
  plugin: Plugin;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PluginMappingDialog({ plugin, open, onOpenChange }: PluginMappingDialogProps) {
  const queryClient = useQueryClient();
  const { data: sites } = useSites();
  
  const [newMapping, setNewMapping] = useState({
    siteId: '',
    remoteSlug: plugin.name,
  });

  const addMappingMutation = useMutation({
    mutationFn: (mapping: { siteId: number; remoteSlug: string }) =>
      api.createPluginMapping(plugin.id, mapping),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      toast.success('Mapping added');
      setNewMapping({ siteId: '', remoteSlug: plugin.name });
    },
  });

  const removeMappingMutation = useMutation({
    mutationFn: (mappingId: number) => api.deletePluginMapping(mappingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      toast.success('Mapping removed');
    },
  });

  // Filter out sites that already have mappings
  const availableSites = sites?.filter(
    site => !plugin.mappings?.some(m => m.siteId === site.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Site Mappings</DialogTitle>
          <DialogDescription>
            Map "{plugin.name}" to WordPress sites. The remote slug is the plugin folder name on the server.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Existing Mappings */}
          {plugin.mappings && plugin.mappings.length > 0 && (
            <div className="space-y-2">
              <Label>Current Mappings</Label>
              {plugin.mappings.map(mapping => (
                <div 
                  key={mapping.id}
                  className="flex items-center justify-between p-3 rounded-md bg-muted"
                >
                  <div>
                    <p className="font-medium">{mapping.siteName}</p>
                    <p className="text-sm text-muted-foreground">
                      Remote slug: {mapping.remoteSlug}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMappingMutation.mutate(mapping.id)}
                    disabled={removeMappingMutation.isPending}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add New Mapping */}
          {availableSites && availableSites.length > 0 && (
            <div className="space-y-3 pt-4 border-t">
              <Label>Add Mapping</Label>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  value={newMapping.siteId}
                  onValueChange={(value) => setNewMapping(prev => ({ ...prev, siteId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select site..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSites.map(site => (
                      <SelectItem key={site.id} value={String(site.id)}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="remote-plugin-slug"
                  value={newMapping.remoteSlug}
                  onChange={(e) => setNewMapping(prev => ({ ...prev, remoteSlug: e.target.value }))}
                />
              </div>
              
              <Button
                onClick={() => addMappingMutation.mutate({
                  siteId: Number(newMapping.siteId),
                  remoteSlug: newMapping.remoteSlug,
                })}
                disabled={!newMapping.siteId || !newMapping.remoteSlug || addMappingMutation.isPending}
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Mapping
              </Button>
            </div>
          )}

          {availableSites?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              All sites are already mapped to this plugin.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

## Data Types

```typescript
// src/types/plugin.ts
export interface Plugin {
  id: number;
  name: string;
  path: string;
  watchEnabled: boolean;
  excludePatterns: string[];
  fileCount: number;
  modifiedCount: number;
  mappings: PluginMapping[];
  createdAt: string;
  updatedAt: string;
}

export interface PluginMapping {
  id: number;
  pluginId: number;
  siteId: number;
  siteName: string;
  remoteSlug: string;
  lastSyncAt: string | null;
  syncStatus: 'synced' | 'pending' | 'conflict';
}

export interface CreatePluginInput {
  name: string;
  path: string;
  watchEnabled?: boolean;
  excludePatterns?: string[];
}

export interface UpdatePluginInput {
  name?: string;
  path?: string;
  watchEnabled?: boolean;
  excludePatterns?: string[];
}

export interface CreateMappingInput {
  siteId: number;
  remoteSlug: string;
}
```

---

## Hook

```typescript
// src/hooks/usePlugins.ts
export function usePlugins() {
  return useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const response = await api.getPlugins();
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });
}

export function usePlugin(id: number) {
  return useQuery({
    queryKey: ['plugins', id],
    queryFn: async () => {
      const response = await api.getPlugin(id);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useTogglePluginWatch() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const response = await api.updatePlugin(id, { watchEnabled: enabled });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });
}
```

---

## User Flows

### Register New Plugin

1. User clicks "Register Plugin"
2. Modal opens with empty form
3. User clicks folder icon to browse
4. System opens native directory picker
5. User selects plugin directory
6. Name auto-fills from directory name
7. User configures watching options
8. User clicks "Register"
9. Plugin appears in list

### Add Site Mapping

1. User clicks "Mappings" on plugin card
2. Dialog opens showing current mappings
3. User selects a site from dropdown
4. User enters remote slug (defaults to plugin name)
5. User clicks "Add Mapping"
6. Mapping appears in list

### Toggle File Watching

1. User clicks watching indicator on plugin card
2. Watching state toggles
3. Toast confirms the change
4. If enabled, watcher starts monitoring directory

---

## Validation

| Field | Rule | Error Message |
|-------|------|---------------|
| name | Required, 1-100 chars | "Name is required" |
| path | Required, must exist | "Directory not found" |
| path | Must contain plugin header | "Not a valid WordPress plugin directory" |
| remoteSlug | Required, alphanumeric + dashes | "Invalid plugin slug format" |

---

## Next Document

See [23-sync-dashboard.md](./23-sync-dashboard.md) for sync and publishing UI details.
