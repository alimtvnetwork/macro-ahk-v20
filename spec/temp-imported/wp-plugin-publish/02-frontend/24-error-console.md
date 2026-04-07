# 24 — Error Console

> **Parent:** [00-overview.md](../00-overview.md)  
> **Status:** Draft

---

## Overview

The Error Console provides a dedicated interface for viewing, filtering, and copying application errors. This is critical for debugging, as users can copy errors and share them with AI assistants for troubleshooting.

---

## Features

1. **Error List** — Scrollable list of recent errors
2. **Filtering** — Filter by level (error, warn, info) and error code
3. **Expand/Collapse** — Click to view full error details
4. **Copy to Clipboard** — One-click copy in AI-friendly format
5. **Clear Errors** — Bulk delete all errors
6. **Real-time Updates** — WebSocket pushes new errors

---

## UI Components

### ErrorConsole Page

```tsx
// src/pages/Errors.tsx
import { useState } from 'react';
import { useErrors } from '@/hooks/useErrors';
import { ErrorCard } from '@/components/errors/ErrorCard';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';

export function ErrorsPage() {
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const { data: errors, isLoading, clearErrors } = useErrors();

  const filteredErrors = errors?.filter(error => 
    levelFilter === 'all' || error.level === levelFilter
  ) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Error Console</h1>
          <p className="text-muted-foreground">
            View and copy errors for debugging
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Filter level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="error">Errors</SelectItem>
              <SelectItem value="warn">Warnings</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => clearErrors()}
            disabled={!errors?.length}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Clear All
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">
          Loading errors...
        </div>
      ) : filteredErrors.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No errors to display
        </div>
      ) : (
        <div className="space-y-4">
          {filteredErrors.map((error) => (
            <ErrorCard key={error.id} error={error} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### ErrorCard Component

```tsx
// src/components/errors/ErrorCard.tsx
import { useState } from 'react';
import { ErrorLog } from '@/types/error';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ErrorCardProps {
  error: ErrorLog;
}

export function ErrorCard({ error }: ErrorCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const levelColors = {
    error: 'bg-destructive text-destructive-foreground',
    warn: 'bg-yellow-500 text-white',
    info: 'bg-blue-500 text-white',
  };

  const copyToClipboard = async () => {
    const text = formatErrorForCopy(error);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Badge className={levelColors[error.level]}>
                {error.level.toUpperCase()}
              </Badge>
              <code className="text-sm font-mono text-muted-foreground">
                {error.code}
              </code>
              <span className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(error.createdAt), { addSuffix: true })}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy for AI
                  </>
                )}
              </Button>
              
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm">
                  {isOpen ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
          
          <p className="font-medium mt-2">{error.message}</p>
        </CardHeader>

        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Location */}
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Location
              </h4>
              <code className="text-sm font-mono">
                {error.file}:{error.line} in {error.function}
              </code>
            </div>

            {/* Context */}
            {error.context && Object.keys(error.context).length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  Context
                </h4>
                <pre className="text-sm bg-muted p-3 rounded-md overflow-x-auto">
                  {JSON.stringify(error.context, null, 2)}
                </pre>
              </div>
            )}

            {/* Stack Trace */}
            {error.stackTrace && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  Stack Trace
                </h4>
                <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto font-mono whitespace-pre">
                  {error.stackTrace}
                </pre>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
```

### Copy Format Function

```tsx
// src/components/errors/ErrorCard.tsx (continued)

function formatErrorForCopy(error: ErrorLog): string {
  const lines = [
    '=== WP Plugin Publish Error ===',
    // MUST be sourced from public/version.json (see useVersionInfo/useWhatsNew)
    `App: WP Plugin Publish v${currentVersion}`,
    `Timestamp: ${error.createdAt}`,
    `Code: ${error.code}`,
    `Level: ${error.level}`,
    `Message: ${error.message}`,
    '',
  ];

  if (error.context && Object.keys(error.context).length > 0) {
    lines.push('Context:');
    for (const [key, value] of Object.entries(error.context)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
    lines.push('');
  }

  lines.push(`Location: ${error.file}:${error.line} in ${error.function}`);
  lines.push('');

  if (error.stackTrace) {
    lines.push('Stack Trace:');
    lines.push(error.stackTrace);
  }

  return lines.join('\n');
}
```

---

## Error Hook

```typescript
// src/hooks/useErrors.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ErrorLog } from '@/types/error';

export function useErrors(limit?: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['errors', limit],
    queryFn: async () => {
      const response = await api.getErrors(limit);
      if (!response.success) {
        throw new Error(response.error?.message);
      }
      return response.data as ErrorLog[];
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const clearMutation = useMutation({
    mutationFn: api.clearErrors,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['errors'] });
    },
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    clearErrors: clearMutation.mutate,
    isClearing: clearMutation.isPending,
  };
}
```

---

## Error Types

```typescript
// src/types/error.ts
export interface ErrorLog {
  id: number;
  level: 'error' | 'warn' | 'info';
  code: string;
  message: string;
  context?: Record<string, unknown>;
  stackTrace?: string;
  file: string;
  line: number;
  function: string;
  createdAt: string;
}
```

---

## Real-time Updates

The WebSocket connection pushes new errors to the UI:

```typescript
// In useWebSocket hook
wsClient.on('error', (data: ErrorLog) => {
  queryClient.invalidateQueries({ queryKey: ['errors'] });
  
  // Optionally show toast notification
  toast.error(`Error: ${data.code}`, {
    description: data.message,
  });
});
```

---

## Copy Output Example

When user clicks "Copy for AI":

```
=== WP Plugin Publish Error ===
App: WP Plugin Publish v1.1.0
Timestamp: 2026-02-01T10:30:00Z
Code: E3002
Level: error
Message: Authentication failed

Context:
  site_url: "https://example.com"
  username: "admin"
  http_status: 401

Location: auth.go:45 in validateCredentials

Stack Trace:
  at validateCredentials
     internal/wordpress/auth.go:45
  at TestConnection
     internal/services/site/service.go:78
  at handleTestConnection
     internal/api/handlers/sites.go:112
```

---

## Error Console in Global Header

A small error indicator can be shown in the header:

```tsx
// src/components/layout/Header.tsx
import { useErrors } from '@/hooks/useErrors';
import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export function Header() {
  const { data: errors } = useErrors(100);
  const errorCount = errors?.filter(e => e.level === 'error').length ?? 0;

  return (
    <header className="border-b">
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-xl font-semibold">WP Plugin Publish</h1>
        
        {errorCount > 0 && (
          <Link 
            to="/errors" 
            className="flex items-center gap-2 text-destructive hover:underline"
          >
            <AlertCircle className="h-4 w-4" />
            <span>{errorCount} error{errorCount !== 1 ? 's' : ''}</span>
          </Link>
        )}
      </div>
    </header>
  );
}
```

---

## Next Document

See [25-settings-page.md](./25-settings-page.md) for application settings UI.
