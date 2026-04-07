# Error Modal — Reusable React Components

**Version:** 2.1.0  
**Updated:** 2026-02-17  
**Purpose:** Portable React code for rebuilding the Global Error Modal in any project.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [TypeScript Interfaces](#2-typescript-interfaces)
3. [Error Store (Zustand)](#3-error-store-zustand)
4. [API Types & Methods](#4-api-types--methods)
5. [Hooks](#5-hooks)
6. [Component Hierarchy](#6-component-hierarchy)
7. [Component Source Code](#7-component-source-code)
8. [Error Report Generator](#8-error-report-generator)
9. [Integration Guide](#9-integration-guide)

---

## 1. Architecture Overview

```
GlobalErrorModal (Dialog shell)
├── Header (error code, timestamp, queue navigation)
├── Section Toggle: Backend | Frontend
├── BackendSection (primary diagnostic view)
│   ├── Overview Tab
│   ├── Log Tab (error.log.txt viewer)
│   ├── Execution Tab (Go call chain + backend logs)
│   ├── Stack Tab (Go/PHP/Delegated stack frames)
│   ├── Session Tab (SessionLogsTab — 4 sub-tabs)
│   ├── Request Tab (RequestDetails — 3-hop chain)
│   └── Traversal Tab (TraversalDetails — endpoint flow)
├── FrontendSection
│   ├── Overview Tab (trigger, click path, call chain)
│   ├── Stack Tab (parsed/raw JS stack frames)
│   ├── Context Tab (JSON viewer)
│   └── Fixes Tab (suggested fixes by error code)
├── Footer
│   ├── DownloadDropdown (ZIP, error.log, log.txt, .md)
│   └── CopyDropdown (full report, with backend, logs)
```

**Dependencies:** React 18+, Zustand, Tailwind CSS, shadcn/ui (Dialog, Tabs, Badge, Button, ScrollArea, DropdownMenu), Lucide React icons.

---

## 2. TypeScript Interfaces

### 2.1 Core Error Model — `CapturedError`

This is the central type stored in the error store and consumed by all modal components.

```typescript
/** Parsed stack frame with file, line, column info */
export interface StackFrame {
  function: string;
  file: string;
  line: number;
  column?: number;
  isInternal: boolean; // true if from node_modules or browser internals
}

/** Backend log entry from operation execution */
export interface BackendLogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  step?: string;
  details?: Record<string, unknown>;
}

/** PHP stack trace frame from WordPress plugin errors */
export interface PHPStackFrame {
  file?: string;
  fileBase?: string;
  line?: number;
  function?: string;
  class?: string;
}

/** UI click event captured by the click tracker */
export interface ClickEvent {
  id: string;
  element: string;
  text?: string;
  action: string;
  componentName?: string;
  route?: string;
  timestamp: number;
}

/** Execution log entry from React hooks/components */
export interface ExecutionLogEntry {
  timestamp: number;
  source: string;
  action: string;
  details?: Record<string, unknown>;
}

export interface CallChain {
  chain: string[];
  formatted: string;
}

/** Envelope error block from the backend response */
export interface EnvelopeErrors {
  BackendMessage: string;
  DelegatedServiceErrorStack?: string[];
  Backend?: string[];
  Frontend?: string[];
  DelegatedRequestServer?: {
    DelegatedEndpoint: string;
    Method: string;
    StatusCode: number;
    RequestBody?: unknown;
    Response?: unknown;
    StackTrace?: string[];
    AdditionalMessages?: string;
  };
}

/** Envelope methods stack from the backend response */
export interface EnvelopeMethodFrame {
  Method: string;
  File: string;
  LineNumber: number;
}

export interface EnvelopeMethodsStack {
  Backend: EnvelopeMethodFrame[];
  Frontend: EnvelopeMethodFrame[];
}

/** The full captured error object */
export interface CapturedError {
  id: string;
  code: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  details?: string;
  context?: Record<string, unknown>;
  file?: string;
  line?: number;
  function?: string;
  stackTrace?: string;
  createdAt: string;
  // API request metadata
  endpoint?: string;
  method?: string;
  requestBody?: unknown;
  responseStatus?: number;
  // Enhanced error reporting
  invocationChain?: string[];
  parsedFrames?: StackFrame[];
  triggerComponent?: string;
  triggerAction?: string;
  // Backend execution data
  backendLogs?: BackendLogEntry[];
  backendStackTrace?: string;
  siteUrl?: string;
  // Session-based logging
  sessionId?: string;
  sessionType?: string;
  // PHP/WordPress error details
  phpStackFrames?: PHPStackFrame[];
  errorFile?: string;
  errorLine?: number;
  // UI click path tracking
  uiClickPath?: ClickEvent[];
  uiClickPathString?: string;
  uiClickPathArrow?: string;
  // Current page route
  route?: string;
  routeComponent?: string;
  // React execution logs
  executionLogs?: ExecutionLogEntry[];
  executionChain?: CallChain | null;
  executionLogsEnabled?: boolean;
  executionLogsFormatted?: string;
  // Universal Envelope diagnostic fields
  requestedAt?: string;
  requestDelegatedAt?: string;
  envelopeErrors?: EnvelopeErrors;
  envelopeMethodsStack?: EnvelopeMethodsStack;
}
```

### 2.2 Session Diagnostics

```typescript
export interface SessionStackFrame {
  function: string;
  file?: string;
  line?: number;
  class?: string;
}

export interface SessionDiagnostics {
  request?: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  };
  response?: {
    requestUrl: string;
    responseUrl: string;
    statusCode: number;
    headers?: Record<string, string>;
    body?: unknown;
  };
  stackTrace?: {
    golang?: SessionStackFrame[];
    php?: SessionStackFrame[];
  };
  phpStackTraceLog?: string;
}
```

### 2.3 Shared Component Props

```typescript
/** Common props shared by section components */
export interface SectionCommonProps {
  copySection: (label: string, content: string) => void;
  formatTs: (ts: string) => string;
}

/** App metadata passed to report generators */
export interface AppInfo {
  appName: string;
  appVersion: string;
  gitCommit?: string;
  buildTime?: string;
}
```

---

## 3. Error Store (Zustand)

The error store manages error state, queue navigation, and error capture logic.

### 3.1 Store Interface

```typescript
interface ErrorStore {
  selectedError: CapturedError | null;
  isModalOpen: boolean;
  recentErrors: CapturedError[];
  errorQueue: CapturedError[];
  currentQueueIndex: number;
  pendingSync: Set<string>;

  captureError: (error: ApiError, meta?: CaptureErrorMeta) => CapturedError;
  captureException: (error: unknown, context?: ErrorContext) => CapturedError;
  openErrorModal: (error: CapturedError) => void;
  openErrorQueue: (errors: CapturedError[], startIndex?: number) => void;
  navigateQueue: (direction: 'prev' | 'next') => void;
  closeErrorModal: () => void;
  clearRecentErrors: () => void;
  markErrorSynced: (errorId: string) => void;
  getPendingSyncErrors: () => CapturedError[];
  getQueuedErrorsMarkdown: () => string;
}
```

### 3.2 Key Behaviors

- **`captureError`**: Converts an API error into `CapturedError`, auto-capturing UI click path, execution logs, route info, and envelope diagnostic fields.
- **`captureException`**: Converts any thrown value (Error, string, unknown) into `CapturedError`.
- **`openErrorQueue`**: Opens the modal with multiple errors and queue navigation.
- **`navigateQueue`**: Cycles through queued errors (wraps around).
- **Envelope extraction**: Automatically extracts `requestedAt`, `requestDelegatedAt`, `envelopeErrors`, and `envelopeMethodsStack` from context.

### 3.3 Stack Trace Parser

```typescript
export function parseFullStackTrace(stack: string): {
  frames: StackFrame[];
  primaryFrame: StackFrame | null;
  invocationChain: string[];
  rawStack: string;
} {
  // Handles patterns:
  // "at functionName (file:line:col)"
  // "at file:line:col" (anonymous)
  // "at async functionName (file:line:col)"
  // Webpack/Vite URLs: "at fn (http://localhost:5173/src/file.tsx:123:45)"
  
  // Internal frame detection:
  // - node_modules, chrome-extension://, @tanstack, react-dom, react., scheduler.
  // - Object.*, Module, <anonymous>
  
  // Returns first non-internal frame as primaryFrame
  // Limits invocation chain to 8 levels
}
```

---

## 4. API Types & Methods

### 4.1 Required API Endpoints

```typescript
const api = {
  // Session endpoints
  getSessionLogs: (sessionId: string) => 
    request<{ logs: string }>(`/sessions/${sessionId}/logs`),
  
  getSessionDiagnostics: (sessionId: string) => 
    request<SessionDiagnostics>(`/sessions/${sessionId}/diagnostics`),
  
  // Error log endpoints
  getBackendErrorLog: () => 
    request<{ content: string }>('/logs/error'),
  
  getBackendFullLog: () => 
    request<{ content: string }>('/logs/full'),
  
  // Error history
  getErrorHistory: (limit?: number) => 
    request<CapturedError[]>(`/error-history?limit=${limit || 100}`),
  
  postErrorHistory: (error: CapturedError) => 
    request<void>('/error-history', { method: 'POST', body: JSON.stringify(error) }),
};
```

---

## 5. Hooks

### 5.1 `useSessionDiagnostics`

Fetches session diagnostics and logs in parallel when a session ID is available.

```typescript
export function useSessionDiagnostics(sessionId?: string) {
  const [state, setState] = useState<{
    diagnostics: SessionDiagnostics | null;
    logs: string | null;
    loading: boolean;
    error: string | null;
  }>({ diagnostics: null, logs: null, loading: false, error: null });

  const fetchData = async () => {
    if (!sessionId) return;
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const [logsRes, diagRes] = await Promise.all([
        api.getSessionLogs(sessionId),
        api.getSessionDiagnostics(sessionId),
      ]);
      setState({
        logs: logsRes.success ? logsRes.data?.logs ?? null : null,
        diagnostics: diagRes.success ? diagRes.data ?? null : null,
        loading: false,
        error: (!logsRes.success && !diagRes.success)
          ? (logsRes.error?.message || "Failed to fetch session data")
          : null,
      });
    } catch (err) {
      setState({
        logs: null, diagnostics: null, loading: false,
        error: err instanceof Error ? err.message : "Failed to fetch session data",
      });
    }
  };

  useEffect(() => {
    if (sessionId) fetchData();
  }, [sessionId]);

  return { ...state, refetch: fetchData };
}
```

---

## 6. Component Hierarchy

### 6.1 File Structure

```
src/components/errors/
├── GlobalErrorModal.tsx       # Root modal shell (Dialog, header, footer, section toggle)
├── BackendSection.tsx         # Backend diagnostic tabs (Overview, Log, Execution, Stack, Session, Request, Traversal)
├── FrontendSection.tsx        # Frontend tabs (Overview, Stack, Context, Fixes)
├── SessionLogsTab.tsx         # Session sub-tabs (Logs, Request, Response, Stack Trace)
├── RequestDetails.tsx         # 3-hop request chain visualization
├── TraversalDetails.tsx       # Endpoint flow + methods stack + delegated error stack
├── ErrorModalActions.tsx      # Download & Copy dropdown menus (reused by both modals)
├── ErrorModalTypes.ts         # Shared types (PHPStackFrame, AppInfo, SectionCommonProps)
├── ErrorQueueBadge.tsx        # Floating badge showing error count
├── ErrorDetailModal.tsx       # Standalone detail modal (error history / E2E tests page)
├── ErrorHistoryDrawer.tsx     # Side drawer listing recent errors
├── AppErrorBoundary.tsx       # React error boundary wrapper
├── errorReportGenerator.ts    # Pure function: CapturedError → Markdown report (compact + full)
└── errorLogAdapter.ts         # Maps backend ErrorLog → CapturedError for ErrorDetailModal

src/stores/
└── errorStore.ts              # Zustand store for error state management

src/hooks/
└── useSessionDiagnostics.ts   # Hook for fetching session diagnostics
```

### 6.2 Component Props Summary

| Component | Key Props |
|-----------|-----------|
| `GlobalErrorModal` | None (reads from `useErrorStore`) |
| `BackendSection` | `error`, `phpStackFrames`, `errorLogContent`, `errorLogLoading`, `copySection`, `formatTs` |
| `FrontendSection` | `error`, `showRawStack`, `displayFrames`, `suggestedFixes`, `copySection`, `formatTs` |
| `SessionLogsTab` | `sessionId`, `sessionType` |
| `RequestDetails` | `error`, `copySection`, `sessionDiagnostics` |
| `TraversalDetails` | `error`, `copySection` |
| `DownloadDropdown` | `error`, `appName`, `appVersion`, `gitCommit`, `buildTime` |
| `CopyDropdown` | `error`, `appName`, `appVersion`, `gitCommit`, `buildTime`, `copyFullError` |
| `ErrorDetailModal` | `open`, `onOpenChange`, `error` (receives `ErrorLog`, adapts internally) |

---

## 7. Component Source Code

### 7.1 GlobalErrorModal

The root shell component. Manages:
- Dialog open/close via `useErrorStore`
- Backend/Frontend section toggle
- Error queue navigation (prev/next with badges)
- Error log fetching on mount
- Copy all / copy single error
- Download & Copy dropdown menus in footer

**Key patterns:**
- `useErrorStore()` for modal state
- `useVersionInfo()` for app metadata
- `fetchErrorLog()` auto-fires when backend section opens
- Resets state on modal close or error change

```typescript
// Simplified structure (see full source in src/components/errors/GlobalErrorModal.tsx)
export function GlobalErrorModal() {
  const { selectedError, isModalOpen, closeErrorModal, errorQueue, currentQueueIndex, navigateQueue } = useErrorStore();
  const [activeSection, setActiveSection] = useState<"backend" | "frontend">("backend");
  // ... error log state, PHP stack frame extraction

  return (
    <Dialog open={isModalOpen} onOpenChange={closeErrorModal}>
      <DialogContent className="w-full h-full sm:max-w-[95vw] sm:h-[95vh]">
        {/* Header with error code, timestamp, queue nav */}
        {/* Section toggle: Backend | Frontend */}
        <ScrollArea>
          {activeSection === "backend" ? <BackendSection ... /> : <FrontendSection ... />}
        </ScrollArea>
        {/* Footer with Download/Copy dropdowns */}
      </DialogContent>
    </Dialog>
  );
}
```

### 7.2 BackendSection

The primary diagnostic view with 7 tabs:

| Tab | Content |
|-----|---------|
| **Overview** | Error message, code, status, site URL, timing, badges |
| **Log** | `error.log.txt` viewer with refresh/copy/download |
| **Execution** | Go call chain table + session execution log entries |
| **Stack** | Go stack, PHP stack, Delegated stack (from envelope + session) |
| **Session** | `SessionLogsTab` (sub-tabs: Logs, Request, Response, Stack Trace) |
| **Request** | `RequestDetails` (3-hop chain: React→Go→Delegated) |
| **Traversal** | `TraversalDetails` (endpoint flow + methods stack) |

**Key pattern — session auto-fetch:**
```typescript
const { diagnostics: sessionDiag, loading: sessionLoading } = useSessionDiagnostics(error.sessionId);
// sessionDiag data is merged into Stack tab and passed to RequestDetails
```

### 7.3 SessionLogsTab

A self-contained component with 4 sub-tabs for session data:

| Sub-tab | Content |
|---------|---------|
| **Logs** | Raw `session.log` with syntax-highlighted lines (errors=red, warnings=amber, stages=primary) |
| **Request** | Outbound request (method, URL, body) |
| **Response** | Response (status badge, URL, body) |
| **Stack Trace** | Go/PHP frame toggles + raw PHP log with copy button |

**Log line highlighting logic:**
```typescript
function LogLine({ line }: { line: string }) {
  if (line.includes("STAGE:") || line.match(/^[─═]+$/)) return <div className="text-primary font-semibold">{line}</div>;
  if (line.includes("[ERROR]") || line.includes("[FATAL]")) return <div className="text-destructive">{line}</div>;
  if (line.includes("[WARN]")) return <div className="text-amber-600 dark:text-amber-400">{line}</div>;
  if (line.includes("✓") || line.includes("success")) return <div className="text-green-600 dark:text-green-400">{line}</div>;
  return <div>{line}</div>;
}
```

### 7.4 RequestDetails

Visualizes the 3-hop request chain:

```
┌─────────────────────────────┐
│ 🔵 React → Go              │  (blue dot, blue badge)
│   GET /api/v1/sites/1/...   │
│   [Request Body]            │
├─────────────────────────────┤
│ │ (connector line)          │
├─────────────────────────────┤
│ 🟠 Go → PHP                │  (orange dot, orange badge)
│   https://example.com/...   │
│   ▶ PHP Response Body       │  (collapsible)
│   PHP Error Stack           │
└─────────────────────────────┘
```

**Data sources for the Go→PHP node:**
- `sessionDiagnostics?.response?.requestUrl` → PHP endpoint URL
- `sessionDiagnostics?.response?.statusCode` → PHP response status
- `sessionDiagnostics?.response?.body` → PHP response body (collapsible)
- `error.envelopeErrors?.DelegatedServiceErrorStack` → PHP error stack

### 7.5 TraversalDetails

Shows the full traversal data from the envelope:

1. **Endpoint Flow** — Go endpoint → PHP endpoint (with badges)
2. **Methods Stack** — Table of Go call chain frames (`Method`, `File`, `LineNumber`)
3. **Delegated Service Error Stack** — Orange-themed scrollable pre block
4. **Backend Trace** — Raw backend stack trace lines

### 7.6 ErrorModalActions

Two dropdown menus, reused by both `GlobalErrorModal` and `ErrorDetailModal`:

**DownloadDropdown:**
- Full Bundle (ZIP) — POST to `/api/v1/errors/bundle`
- error.log.txt — download
- log.txt (Full) — download
- Report (.md) — generated client-side

**CopyDropdown (Split Button pattern):**
- **Main click** → Compact Report (instant, from memory via `generateCompactReport`)
- Copy Compact Report (same as main click)
- Copy Full Report
- Copy with Backend Logs (fetches error.log.txt and appends)
- Copy error.log.txt
- Copy log.txt

### 7.7 ErrorDetailModal

Standalone modal used on the Error History and E2E Tests pages. Receives backend `ErrorLog` objects (not `CapturedError`).

**Adapter pattern:** On render, converts the `ErrorLog` via `errorLogToCapturedError()` from `errorLogAdapter.ts` so that `generateCompactReport` and `generateErrorReport` can be called with the same interface as `GlobalErrorModal`.

```typescript
// src/components/errors/errorLogAdapter.ts
export function errorLogToCapturedError(error: ErrorLog): CapturedError {
  return {
    id: String(error.id),
    code: error.code,
    level: error.level as CapturedError["level"],
    message: error.message,
    details: error.details,
    createdAt: error.createdAt,
    context: error.context as CapturedError["context"],
    backendStackTrace: error.stackTrace,
    parsedFrames: error.file
      ? [{ file: error.file, line: error.line ?? 0, function: error.function ?? "" }]
      : undefined,
  } as CapturedError;
}
```

**Footer layout (matches GlobalErrorModal):**

```
┌──────────────────────────────────────────────────────────────┐
│  [▼ Download]   [Close]   [📋 Copy │ ▼]                     │
│                                                              │
│  DownloadDropdown          Split Button:                     │
│  (reused component)        Main = Compact Report             │
│                            Dropdown = Compact / Full         │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. Error Report Generator

A pure function that converts `CapturedError` to Markdown. No React dependencies.

```typescript
export function generateErrorReport(error: CapturedError, app?: AppInfo): string {
  // Sections (in order):
  // 1. App metadata (name, version, git commit, build time)
  // 2. Error identity (ID, code, level, timestamp)
  // 3. Page context (route + React component name)
  // 4. User interaction (arrow-style summary)
  // 5. Trigger context (component, action, source)
  // 6. Invocation chain (indented tree)
  // 7. User interaction path (numbered steps with routes)
  // 8. Target site URL
  // 9. Session info (ID, type, fetch hint)
  // 10. Error message + details
  // 11. Request info (method, endpoint, status, body)
  // 12. Backend execution logs
  // 13. Backend stack trace (Go)
  // 14. PHP stack trace (table)
  // 15. Frontend execution chain
  // 16. Parsed JS stack frames (table)
  // 17. Error location (file:line)
  // 18. Full context JSON
  // 19. Raw frontend stack trace
}
```

**Sample output:** See `spec/07-error-manage/02-error-modal/copy-formats.md` for complete examples.

### 8.1 Suggested Fixes

```typescript
export function getSuggestedFixes(code: string): string[] {
  const fixes: Record<string, string[]> = {
    E1001: ["Check backend server is running", "Verify VITE_API_URL", "Check firewall", "Refresh page"],
    E2001: ["Check site credentials", "Verify WordPress accessibility", "Check REST API", "Check plugin"],
    E3001: ["Check plugin files exist", "Verify file permissions", "Check PHP file headers"],
    E4001: ["Check disk space", "Verify PHP upload limits", "Test with smaller plugin"],
    E5001: ["Check plugin for fatal errors", "Verify dependencies", "Check debug.log", "Try manual activation"],
    E9005: ["API returned HTML instead of JSON", "Check backend server", "Verify VITE_API_URL", "Check network tab"],
  };
  return fixes[code] || ["Check error details", "Review stack trace", "Check backend logs", "Retry"];
}
```

---

## 9. Integration Guide

### 9.1 Minimal Setup

1. **Install dependencies:** `zustand`, `@radix-ui/react-dialog`, `@radix-ui/react-tabs`, `lucide-react`, `sonner`
2. **Copy files:** All files from `src/components/errors/`, `src/stores/errorStore.ts`, `src/hooks/useSessionDiagnostics.ts`
3. **Mount the modal:**

```tsx
// In App.tsx or layout
import { GlobalErrorModal } from '@/components/errors/GlobalErrorModal';

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <GlobalErrorModal />
    </>
  );
}
```

4. **Capture errors in React Query:**

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

// Global error handler
queryClient.getQueryCache().subscribe((event) => {
  const isQueryError = event.type === 'updated' && event.query.state.status === 'error';
  if (!isQueryError) {
    return;
  }

  const isSuppressed = event.query.meta?.suppressGlobalError === true;
  if (isSuppressed) {
    return;
  }

  const error = event.query.state.error;
  useErrorStore.getState().captureException(error, {
    source: 'App.showGlobalError',
    triggerComponent: 'QueryClient',
    triggerAction: 'async_operation',
  });
});
```

### 9.2 Required Utility Functions

```typescript
/** Format ISO timestamp to UTC display string */
export function formatDateTimeUtc(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', { timeZone: 'UTC', ... });
}

/** Normalize clipboard text (strip trailing whitespace, normalize newlines) */
export function toClipboardText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

/** Unescape embedded newlines in log strings */
export function unescapeEmbeddedNewlines(text: string): string {
  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
}
```

### 9.3 Adapting for Non-WordPress Projects

The error modal is designed for a Go backend + WordPress PHP delegated server architecture, but can be adapted:

- **Remove PHP-specific code:** `phpStackFrames`, `phpStackTraceLog`, PHP-related UI in `SessionLogsTab` and `BackendSection`
- **Rename "Delegated Server":** Change labels from "Go → PHP" to your architecture (e.g., "API → Microservice")
- **Simplify if no delegation:** Remove `RequestDetails` 3-hop chain, keep simple request display
- **Keep the core:** `CapturedError` model, `errorStore`, `GlobalErrorModal` shell, `FrontendSection`, `errorReportGenerator` are fully generic

---

## Cross-References

- [Error Modal Spec](./readme.md) — Full modal structure, data model, and UX specification
- [Copy Format Samples](./copy-formats.md) — Complete samples for all copy/export formats
- [Error Handling Spec](../01-error-handling/readme.md) — Cross-stack error architecture
- [Response Envelope Schema](../05-response-envelope/envelope.schema.json) — JSON Schema source of truth

---

*Generated from WP Plugin Publish codebase — updated: 2026-02-17*
