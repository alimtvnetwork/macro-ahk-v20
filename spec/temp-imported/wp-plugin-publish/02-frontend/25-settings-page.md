# 25 — Settings Page

> **Parent:** [20-frontend-overview.md](./20-frontend-overview.md)  
> **Status:** Complete

---

## Overview

The Settings Page provides configuration options for the application including file watching behavior, backup retention, logging preferences, and UI customization.

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Settings                                                                │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  File Watching                                                    │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Poll Interval                             [5 seconds      ▼]    │   │
│  │  How often to check for file changes                             │   │
│  │                                                                   │   │
│  │  Debounce Delay                            [500 ms         ▼]    │   │
│  │  Wait time before processing changes                             │   │
│  │                                                                   │   │
│  │  Default Exclude Patterns                                        │   │
│  │  ┌────────────────────────────────────────────────────────────┐  │   │
│  │  │ .git, node_modules, .DS_Store, *.log                       │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Backups                                                          │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Auto-backup before publish                          [ON]        │   │
│  │  Always create a backup before publishing                        │   │
│  │                                                                   │   │
│  │  Retention Days                            [30 days        ▼]    │   │
│  │  Delete backups older than this                                  │   │
│  │                                                                   │   │
│  │  Max Backups per Plugin                    [10             ▼]    │   │
│  │  Keep only the most recent backups                               │   │
│  │                                                                   │   │
│  │  Backup Location                                                 │   │
│  │  ┌────────────────────────────────────────────────────────────┐  │   │
│  │  │ ~/.wp-plugin-publish/backups                         [📁]  │  │   │
│  │  └────────────────────────────────────────────────────────────┘  │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Logging                                                          │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Log Level                                 [Info           ▼]    │   │
│  │  Minimum severity to log                                         │   │
│  │                                                                   │   │
│  │  Log Retention Days                        [7 days         ▼]    │   │
│  │  Delete logs older than this                                     │   │
│  │                                                                   │   │
│  │  Enable Debug Mode                                   [OFF]       │   │
│  │  Include stack traces and verbose output                         │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Appearance                                                       │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  Theme                                     [System         ▼]    │   │
│  │  Light, Dark, or follow system preference                        │   │
│  │                                                                   │   │
│  │  Compact Mode                                        [OFF]       │   │
│  │  Reduce spacing for more content density                         │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  Advanced                                                         │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                   │   │
│  │  API Port                                  [8080]                │   │
│  │  Backend server port (requires restart)                          │   │
│  │                                                                   │   │
│  │  WebSocket Reconnect Delay                 [3000 ms]             │   │
│  │  Time to wait before reconnecting                                │   │
│  │                                                                   │   │
│  │  ─────────────────────────────────────────────────────────────   │   │
│  │                                                                   │   │
│  │  [Clear All Data]    [Export Config]    [Import Config]          │   │
│  │                                                                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│                                               [Reset to Defaults] [Save]│
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Component

```typescript
// src/pages/Settings.tsx
export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSettings();
  
  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: settings,
  });

  // Reset form when settings load
  useEffect(() => {
    if (settings) {
      form.reset(settings);
    }
  }, [settings, form]);

  const onSubmit = (data: SettingsFormData) => {
    updateMutation.mutate(data, {
      onSuccess: () => toast.success('Settings saved'),
      onError: (error) => toast.error(error.message),
    });
  };

  if (isLoading) return <SettingsSkeleton />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* File Watching Section */}
          <SettingsSection title="File Watching" icon={Eye}>
            <FormField
              control={form.control}
              name="watcher.pollIntervalMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Poll Interval</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1 second</SelectItem>
                      <SelectItem value="2000">2 seconds</SelectItem>
                      <SelectItem value="5000">5 seconds</SelectItem>
                      <SelectItem value="10000">10 seconds</SelectItem>
                      <SelectItem value="30000">30 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How often to check for file changes
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="watcher.debounceMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Debounce Delay</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100">100 ms</SelectItem>
                      <SelectItem value="250">250 ms</SelectItem>
                      <SelectItem value="500">500 ms</SelectItem>
                      <SelectItem value="1000">1 second</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Wait time before processing changes
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="watcher.defaultExcludePatterns"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Exclude Patterns</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      value={field.value?.join(', ')}
                      onChange={(e) => field.onChange(
                        e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                      )}
                    />
                  </FormControl>
                  <FormDescription>
                    Comma-separated patterns to ignore by default
                  </FormDescription>
                </FormItem>
              )}
            />
          </SettingsSection>

          {/* Backups Section */}
          <SettingsSection title="Backups" icon={Archive}>
            <FormField
              control={form.control}
              name="backup.autoBackupBeforePublish"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div>
                    <FormLabel>Auto-backup before publish</FormLabel>
                    <FormDescription>
                      Always create a backup before publishing
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
              name="backup.retentionDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Retention Days</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                      <SelectItem value="0">Never delete</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Delete backups older than this
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="backup.maxBackupsPerPlugin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Backups per Plugin</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 backups</SelectItem>
                      <SelectItem value="10">10 backups</SelectItem>
                      <SelectItem value="20">20 backups</SelectItem>
                      <SelectItem value="50">50 backups</SelectItem>
                      <SelectItem value="0">Unlimited</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Keep only the most recent backups
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="backup.location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Backup Location</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input {...field} className="font-mono text-sm" />
                    </FormControl>
                    <Button type="button" variant="outline" size="icon">
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                </FormItem>
              )}
            />
          </SettingsSection>

          {/* Logging Section */}
          <SettingsSection title="Logging" icon={FileText}>
            <FormField
              control={form.control}
              name="logging.level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Log Level</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="warn">Warning</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="debug">Debug</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Minimum severity to log
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logging.retentionDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Log Retention Days</FormLabel>
                  <Select
                    value={String(field.value)}
                    onValueChange={(v) => field.onChange(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 day</SelectItem>
                      <SelectItem value="3">3 days</SelectItem>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Delete logs older than this
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logging.debugMode"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div>
                    <FormLabel>Enable Debug Mode</FormLabel>
                    <FormDescription>
                      Include stack traces and verbose output
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
          </SettingsSection>

          {/* Appearance Section */}
          <SettingsSection title="Appearance" icon={Palette}>
            <FormField
              control={form.control}
              name="appearance.theme"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Theme</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Light, Dark, or follow system preference
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="appearance.compactMode"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <div>
                    <FormLabel>Compact Mode</FormLabel>
                    <FormDescription>
                      Reduce spacing for more content density
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
          </SettingsSection>

          {/* Advanced Section */}
          <SettingsSection title="Advanced" icon={Settings}>
            <FormField
              control={form.control}
              name="server.port"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>API Port</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Backend server port (requires restart)
                  </FormDescription>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="server.wsReconnectDelayMs"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WebSocket Reconnect Delay</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      {...field}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                    />
                  </FormControl>
                  <FormDescription>
                    Time to wait before reconnecting (ms)
                  </FormDescription>
                </FormItem>
              )}
            />

            <Separator className="my-4" />

            <div className="flex gap-3">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="destructive">
                    Clear All Data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete all sites, plugins, sync history, and backups.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      className="bg-destructive text-destructive-foreground"
                      onClick={() => api.clearAllData()}
                    >
                      Clear Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button type="button" variant="outline" onClick={handleExportConfig}>
                Export Config
              </Button>
              
              <Button type="button" variant="outline" onClick={handleImportConfig}>
                Import Config
              </Button>
            </div>
          </SettingsSection>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline"
              onClick={() => form.reset(defaultSettings)}
            >
              Reset to Defaults
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
```

### SettingsSection

Reusable section wrapper component.

```typescript
// src/components/settings/SettingsSection.tsx
interface SettingsSectionProps {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}

export function SettingsSection({ title, icon: Icon, children }: SettingsSectionProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}
      </CardContent>
    </Card>
  );
}
```

---

## Data Types

```typescript
// src/types/settings.ts
export interface Settings {
  watcher: WatcherSettings;
  backup: BackupSettings;
  logging: LoggingSettings;
  appearance: AppearanceSettings;
  server: ServerSettings;
}

export interface WatcherSettings {
  pollIntervalMs: number;
  debounceMs: number;
  defaultExcludePatterns: string[];
}

export interface BackupSettings {
  autoBackupBeforePublish: boolean;
  retentionDays: number;
  maxBackupsPerPlugin: number;
  location: string;
}

export interface LoggingSettings {
  level: 'error' | 'warn' | 'info' | 'debug';
  retentionDays: number;
  debugMode: boolean;
}

export interface AppearanceSettings {
  theme: 'light' | 'dark' | 'system';
  compactMode: boolean;
}

export interface ServerSettings {
  port: number;
  wsReconnectDelayMs: number;
}

// Default values
export const defaultSettings: Settings = {
  watcher: {
    pollIntervalMs: 5000,
    debounceMs: 500,
    defaultExcludePatterns: ['.git', 'node_modules', '.DS_Store', '*.log'],
  },
  backup: {
    autoBackupBeforePublish: true,
    retentionDays: 30,
    maxBackupsPerPlugin: 10,
    location: '~/.wp-plugin-publish/backups',
  },
  logging: {
    level: 'info',
    retentionDays: 7,
    debugMode: false,
  },
  appearance: {
    theme: 'system',
    compactMode: false,
  },
  server: {
    port: 8080,
    wsReconnectDelayMs: 3000,
  },
};
```

---

## Validation Schema

```typescript
// src/lib/schemas/settings.ts
export const settingsSchema = z.object({
  watcher: z.object({
    pollIntervalMs: z.number().min(500).max(60000),
    debounceMs: z.number().min(50).max(5000),
    defaultExcludePatterns: z.array(z.string()),
  }),
  backup: z.object({
    autoBackupBeforePublish: z.boolean(),
    retentionDays: z.number().min(0).max(365),
    maxBackupsPerPlugin: z.number().min(0).max(100),
    location: z.string().min(1),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    retentionDays: z.number().min(1).max(90),
    debugMode: z.boolean(),
  }),
  appearance: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    compactMode: z.boolean(),
  }),
  server: z.object({
    port: z.number().min(1024).max(65535),
    wsReconnectDelayMs: z.number().min(500).max(30000),
  }),
});

export type SettingsFormData = z.infer<typeof settingsSchema>;
```

---

## Hook

```typescript
// src/hooks/useSettings.ts
export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const response = await api.getSettings();
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (settings: Partial<Settings>) => {
      const response = await api.updateSettings(settings);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
```

---

## Export/Import Functions

```typescript
// Export configuration to JSON file
async function handleExportConfig() {
  const response = await api.getSettings();
  if (!response.success) {
    toast.error('Failed to export settings');
    return;
  }

  const blob = new Blob([JSON.stringify(response.data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `wp-plugin-publish-config-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  
  toast.success('Configuration exported');
}

// Import configuration from JSON file
async function handleImportConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      
      // Validate against schema
      const result = settingsSchema.safeParse(config);
      if (!result.success) {
        toast.error('Invalid configuration file');
        return;
      }

      await api.updateSettings(result.data);
      toast.success('Configuration imported');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    } catch {
      toast.error('Failed to parse configuration file');
    }
  };

  input.click();
}
```

---

## Settings Persistence

Settings are stored in SQLite and loaded on application startup:

1. **Initial Load**: Backend reads from SQLite, falls back to defaults
2. **User Changes**: Frontend sends updates via REST API
3. **Backend Validation**: Schema validated before persisting
4. **Restart Required**: Port changes require application restart

---

## Next Document

Return to [20-frontend-overview.md](./20-frontend-overview.md) for the complete frontend architecture.
