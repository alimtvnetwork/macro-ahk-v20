# 21 — Site Manager UI

> **Parent:** [20-frontend-overview.md](./20-frontend-overview.md)  
> **Status:** Complete

---

## Overview

The Site Manager UI provides CRUD operations for WordPress site connections. Users can add, edit, test, and remove WordPress sites with Application Password authentication.

---

## Page Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Sites                                                    [+ Add Site]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  🌐 Production Site                                               │   │
│  │  https://example.com                                              │   │
│  │  Last sync: 2 hours ago                        [Test] [Edit] [✕]  │   │
│  │  Status: ● Connected                                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  🌐 Staging Site                                                  │   │
│  │  https://staging.example.com                                      │   │
│  │  Last sync: 5 minutes ago                      [Test] [Edit] [✕]  │   │
│  │  Status: ● Connected                                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  🌐 Local Dev                                                     │   │
│  │  http://localhost:8888                                            │   │
│  │  Never synced                                  [Test] [Edit] [✕]  │   │
│  │  Status: ○ Not tested                                             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### SiteList

Container component that fetches and displays all sites.

```typescript
// src/components/sites/SiteList.tsx
interface SiteListProps {
  onAddSite: () => void;
  onEditSite: (site: Site) => void;
}

export function SiteList({ onAddSite, onEditSite }: SiteListProps) {
  const { data: sites, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () => api.getSites(),
  });

  if (isLoading) return <SiteListSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Sites</h1>
        <Button onClick={onAddSite}>
          <Plus className="w-4 h-4 mr-2" />
          Add Site
        </Button>
      </div>
      
      {sites?.data?.length === 0 ? (
        <EmptyState 
          icon={Globe}
          title="No sites connected"
          description="Add your first WordPress site to get started."
          action={{ label: "Add Site", onClick: onAddSite }}
        />
      ) : (
        <div className="grid gap-4">
          {sites?.data?.map(site => (
            <SiteCard 
              key={site.id} 
              site={site} 
              onEdit={() => onEditSite(site)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

### SiteCard

Displays individual site information with action buttons.

```typescript
// src/components/sites/SiteCard.tsx
interface SiteCardProps {
  site: Site;
  onEdit: () => void;
}

export function SiteCard({ site, onEdit }: SiteCardProps) {
  const queryClient = useQueryClient();
  
  const testMutation = useMutation({
    mutationFn: () => api.testConnection(site.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast.success('Connection successful');
    },
    onError: (error) => {
      toast.error(`Connection failed: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSite(site.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast.success('Site removed');
    },
  });

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <Globe className="w-8 h-8 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">{site.name}</h3>
            <p className="text-sm text-muted-foreground">{site.url}</p>
            <div className="flex items-center gap-2 mt-1">
              <StatusIndicator status={site.connectionStatus} />
              <span className="text-xs text-muted-foreground">
                {site.lastSyncAt 
                  ? `Last sync: ${formatRelativeTime(site.lastSyncAt)}`
                  : 'Never synced'
                }
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Test'
            )}
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
                <AlertDialogTitle>Remove site?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove "{site.name}" and all associated plugin mappings.
                  This action cannot be undone.
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
      </CardContent>
    </Card>
  );
}
```

### SiteForm

Modal form for adding/editing sites.

```typescript
// src/components/sites/SiteForm.tsx
interface SiteFormProps {
  site?: Site;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const siteSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL'),
  username: z.string().min(1, 'Username is required'),
  applicationPassword: z.string().min(1, 'Application password is required'),
});

type SiteFormData = z.infer<typeof siteSchema>;

export function SiteForm({ site, open, onOpenChange }: SiteFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!site;

  const form = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
    defaultValues: {
      name: site?.name ?? '',
      url: site?.url ?? '',
      username: site?.username ?? '',
      applicationPassword: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data: SiteFormData) => 
      isEditing 
        ? api.updateSite(site.id, data)
        : api.createSite(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
      toast.success(isEditing ? 'Site updated' : 'Site added');
      onOpenChange(false);
      form.reset();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const testMutation = useMutation({
    mutationFn: (data: SiteFormData) => 
      api.testConnectionWithCredentials(data),
    onSuccess: () => {
      toast.success('Connection successful!');
    },
    onError: (error) => {
      toast.error(`Connection failed: ${error.message}`);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Site' : 'Add Site'}</DialogTitle>
          <DialogDescription>
            Connect to a WordPress site using Application Password authentication.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Production Site" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site URL</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com" {...field} />
                  </FormControl>
                  <FormDescription>
                    The WordPress site URL (without /wp-admin)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input placeholder="admin" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="applicationPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Application Password</FormLabel>
                  <FormControl>
                    <Input 
                      type="password" 
                      placeholder={isEditing ? '••••••••••••' : 'xxxx xxxx xxxx xxxx xxxx xxxx'} 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Generate in WordPress: Users → Profile → Application Passwords
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-between pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => testMutation.mutate(form.getValues())}
                disabled={testMutation.isPending || !form.formState.isValid}
              >
                {testMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Add Site')}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

### StatusIndicator

Visual indicator for connection status.

```typescript
// src/components/sites/StatusIndicator.tsx
type ConnectionStatus = 'connected' | 'disconnected' | 'unknown' | 'testing';

interface StatusIndicatorProps {
  status: ConnectionStatus;
}

const statusConfig: Record<ConnectionStatus, { color: string; label: string }> = {
  connected: { color: 'bg-green-500', label: 'Connected' },
  disconnected: { color: 'bg-red-500', label: 'Disconnected' },
  unknown: { color: 'bg-gray-400', label: 'Not tested' },
  testing: { color: 'bg-yellow-500 animate-pulse', label: 'Testing...' },
};

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status];
  
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('w-2 h-2 rounded-full', config.color)} />
      <span className="text-xs text-muted-foreground">{config.label}</span>
    </div>
  );
}
```

---

## Data Types

```typescript
// src/types/site.ts
export interface Site {
  id: number;
  name: string;
  url: string;
  username: string;
  connectionStatus: 'connected' | 'disconnected' | 'unknown';
  lastTestedAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSiteInput {
  name: string;
  url: string;
  username: string;
  applicationPassword: string;
}

export interface UpdateSiteInput {
  name?: string;
  url?: string;
  username?: string;
  applicationPassword?: string;
}

export interface ConnectionResult {
  success: boolean;
  wpVersion?: string;
  pluginsEndpoint?: boolean;
  message?: string;
}
```

---

## Hook

```typescript
// src/hooks/useSites.ts
export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const response = await api.getSites();
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });
}

export function useSite(id: number) {
  return useQuery({
    queryKey: ['sites', id],
    queryFn: async () => {
      const response = await api.getSite(id);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateSiteInput) => {
      const response = await api.createSite(data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}

export function useTestConnection() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (id: number) => {
      const response = await api.testConnection(id);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
}
```

---

## User Flows

### Add New Site

1. User clicks "Add Site" button
2. Modal opens with empty form
3. User enters site details
4. User clicks "Test Connection" (optional)
5. On success, shows confirmation toast
6. User clicks "Add Site"
7. Modal closes, site appears in list

### Test Existing Connection

1. User clicks "Test" on site card
2. Button shows loading spinner
3. Backend tests WP REST API connectivity
4. Toast shows success/failure
5. Status indicator updates

### Edit Site

1. User clicks "Edit" on site card
2. Modal opens with pre-filled form
3. Password field shows placeholder (not actual password)
4. User updates fields
5. User clicks "Update"
6. Modal closes, site list refreshes

### Remove Site

1. User clicks X button on site card
2. Confirmation dialog appears
3. User confirms deletion
4. Site removed from list
5. Associated plugin mappings deleted

---

## Error Handling

| Error Code | User Message | Action |
|------------|--------------|--------|
| E3001 | Connection failed. Check URL and credentials. | Show in toast |
| E3002 | Site not reachable. Check if WordPress is running. | Show in toast |
| E3003 | Invalid credentials. Check username and password. | Show in form |
| E3004 | REST API disabled on this site. | Show in dialog |

---

## Accessibility

- All form fields have proper labels
- Error messages are associated with inputs
- Focus trapped in modal when open
- Keyboard navigation supported (Tab, Enter, Escape)
- Screen reader announcements for status changes

---

## Next Document

See [22-plugin-manager-ui.md](./22-plugin-manager-ui.md) for plugin management UI details.
