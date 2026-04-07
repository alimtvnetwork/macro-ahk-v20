# 26. UI Patterns Specification

This document defines reusable UI patterns and behaviors across the application.

---

## 26.0 Reusable Components

### LiveLogEntry Component
**Location**: `src/components/shared/LiveLogEntry.tsx`

A reusable log entry component for displaying real-time operation progress.

```typescript
import { LiveLogEntry } from "@/components/shared/LiveLogEntry";

<LiveLogEntry
  timestamp={new Date()}
  status="running" // "running" | "success" | "error" | "warning" | "info"
  message="Processing file..."
>
  {/* Optional children for additional content */}
</LiveLogEntry>
```

#### Props
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `timestamp` | `Date` | Yes | When the log entry occurred |
| `status` | `LogStatus` | Yes | Current status of the step |
| `message` | `string` | Yes | Display message |
| `className` | `string` | No | Additional CSS classes |
| `children` | `ReactNode` | No | Additional content below message |

#### Status Icons
| Status | Icon | Color |
|--------|------|-------|
| `running` | Spinning Loader2 | `text-primary` |
| `success` | CheckCircle | `text-primary` |
| `error` | XCircle | `text-destructive` |
| `warning` | AlertCircle | `text-warning` |
| `info` | CheckCircle | `text-muted-foreground` |

---

### BackendStatus Component
**Location**: `src/components/shared/BackendStatus.tsx`

Displays a warning banner when the Go backend is unavailable.

```typescript
import { BackendStatus } from "@/components/shared/BackendStatus";

// In Layout.tsx
<BackendStatus pollInterval={10000} />
```

#### Detection Logic

The component uses a **three-tier detection system**:

1. **HTML Response (E9005):** If response body starts with `<!` or `<html`, the backend is not running or URL is misconfigured (SPA fallback serving index.html)

2. **Network Error (E9003):** If `fetch()` throws an exception, the backend is unreachable (server not running, wrong port, CORS blocked)

3. **JSON Response:**
   - **HTTP 2xx:** Backend is connected (regardless of response content)
   - **HTTP non-2xx:** Backend is reachable but unhealthy (show status code and message)

> **CRITICAL:** Do NOT check for specific response fields like `success === true` or `status === "ok"`. Any 2xx JSON response indicates the backend is running.

#### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `pollInterval` | `number` | `10000` | Polling interval in ms |

#### Banner Messages

The banner message varies by disconnect reason:
- **HTML:** "Backend disconnected — API requests are returning HTML instead of JSON"
- **Network:** "Backend unreachable — network error or server not running"
- **Non-2xx:** "Backend error — {status code}: {error message}"

---

This document defines reusable UI patterns and behaviors across the application.

---

## 26.1 Modal/Dialog Behavior

### Scrolling
- All dialogs MUST have `max-h-[90vh]` and `overflow-y-auto` on the content wrapper
- This ensures modals with large content remain usable on small screens
- Implemented in `src/components/ui/dialog.tsx` via the `DialogContent` component

### Example
```tsx
<DialogContent className="sm:max-w-lg">
  {/* Content automatically scrolls if exceeding 90vh */}
</DialogContent>
```

### Key Requirements
| Requirement | Implementation |
|-------------|----------------|
| Max height | `max-h-[90vh]` |
| Vertical scroll | `overflow-y-auto` |
| Background | Must use `bg-background` (not transparent) |
| Z-index | `z-50` (above overlay) |

---

## 26.2 Form Field Persistence (localStorage)

### Purpose
Preserve user input across dialog closes, page refreshes, and session interruptions.

### Implementation Pattern
Create a dedicated hook per form (e.g., `useSiteFormPersistence`, `usePluginFormPersistence`):

```typescript
// src/hooks/use{Entity}FormPersistence.ts
const STORAGE_KEY = "wppp_{entity}_form_draft";

export function use{Entity}FormPersistence() {
  const [formData, setFormData] = useState<FormData>(initialFormData);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setFormData(JSON.parse(saved));
    }
  }, []);

  // Save on change (except sensitive fields)
  const updateFormData = (updates: Partial<FormData>) => {
    setFormData((prev) => {
      const next = { ...prev, ...updates };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...next,
        password: undefined, // NEVER persist passwords
      }));
      return next;
    });
  };

  const clearForm = () => {
    setFormData(initialFormData);
    localStorage.removeItem(STORAGE_KEY);
  };

  return { formData, updateFormData, clearForm };
}
```

### Security Constraints
| Field Type | Persist to localStorage |
|------------|------------------------|
| Name, URL, username | ✅ Yes |
| Passwords, tokens, secrets | ❌ NEVER |
| Configuration flags | ✅ Yes |
| File paths | ✅ Yes |

### Storage Keys
| Entity | Storage Key |
|--------|-------------|
| Site form | `wppp_site_form_draft` |
| Plugin form | `wppp_plugin_form_draft` |

---

## 26.3 Password/Secret Storage

### At-Rest Encryption
Passwords and application tokens are encrypted using **AES-256-GCM** before database storage.

### Why NOT Hashing?
The system must decrypt passwords to authenticate with external WordPress REST APIs. Hashing (bcrypt, SHA-512) is one-way and would prevent this. AES-256-GCM provides:
- Strong encryption at rest
- Ability to decrypt for API authentication
- Industry-standard symmetric encryption

### Implementation
```go
// backend/internal/services/site/encryption.go
func (s *Service) encryptPassword(plaintext string) (string, error) {
  // AES-256-GCM encryption with random nonce
}

func (s *Service) decryptPassword(ciphertext string) (string, error) {
  // Decrypt for WordPress API authentication
}
```

### Key Management
- Encryption key stored in configuration (`config.json`)
- Key MUST be at least 32 bytes for AES-256
- Never log or expose decrypted passwords

---

## 26.4 Connection Test Live Logs

### Behavior
Real-time streaming of connection test progress via WebSocket.

### Step Update Logic
When a step update arrives:
1. If `step === "start"`: Clear all previous logs, start fresh session
2. If step exists with `status === "running"`: **Update in-place** (don't append)
3. If step is new: Append to log list
4. If `step === "complete"`: Mark session inactive

### Why Update In-Place?
When the backend sends:
```
{step: "auth_check", status: "running", message: "Authenticating..."}
{step: "auth_check", status: "success", message: "Authenticated as admin"}
```

The log should show ONE line that transitions from spinner to checkmark, NOT two separate lines.

### Implementation
```typescript
// src/hooks/useConnectionTestLogs.ts
const existingIndex = prev.steps.findIndex(
  (s) => s.step === step && s.status === "running"
);

if (existingIndex !== -1) {
  // Update existing step in-place
  const updatedSteps = [...prev.steps];
  updatedSteps[existingIndex] = { step, status, message, details, timestamp: new Date() };
  return { ...prev, steps: updatedSteps };
}
```

### Visual States
| Status | Icon | Color |
|--------|------|-------|
| `running` | Spinner (Loader2) | `text-primary` |
| `success` | CheckCircle | `text-primary` |
| `error` | XCircle | `text-destructive` |

---

## 26.5 "Save Anyway" Pattern

### Purpose
Allow users to save configuration even when validation fails (e.g., site connection test fails, plugin path not found).

### Implementation
1. When validation fails, set `validationError` state with error message
2. Show error banner in dialog with warning icon
3. Replace primary button with "Save Anyway" button (warning variant)
4. Pass `forceCreate: true` to API to bypass validation

### UI Structure
```tsx
{validationError && (
  <div className="border border-warning bg-warning/10 p-3 rounded-lg">
    <AlertCircle className="text-warning" />
    <p>{validationError}</p>
  </div>
)}

<DialogFooter>
  <Button variant="outline" onClick={onCancel}>Cancel</Button>
  {validationError ? (
    <Button variant="warning" onClick={handleSaveAnyway}>
      Save Anyway
    </Button>
  ) : (
    <Button onClick={handleSave}>Save</Button>
  )}
</DialogFooter>
```

### Backend Support
```go
type CreateInput struct {
  // ... other fields
  ForceCreate bool `json:"forceCreate"` // Skip validation errors
}

func (s *Service) Create(ctx context.Context, input CreateInput) {
  if err := s.validateIfRequired(input); err != nil {
    return nil, err
  }

  // Proceed with creation
}

func (s *Service) validateIfRequired(input CreateInput) error {
  if input.ForceCreate {
    return nil
  }

  return s.Validate(input)
}
```

---

## 26.6 Error Modal Integration

### Purpose
Provide full error details with copy functionality for debugging.

### When to Use
- API errors that users may need to report
- Validation failures with technical details
- Any error where context is important

### Rule of Thumb (MANDATORY)

> **Any user-visible error MUST be capturable in the Error Modal, with the resolved request URL shown.**

If an API call returns **HTML instead of JSON**, this surfaces as error code `E9005` and the modal opens immediately (not just a toast).

### Error Modal Content

The modal MUST display:
0. **App name + version** — e.g. `WP Plugin Publish v1.2.1` (from `public/version.json`)
1. **Resolved request URL** — The actual URL the frontend called
2. **API Base (relative)** — What `resolveApiBase()` returned (e.g. `/api/v1`)
3. **API Base (absolute)** — Full URL with host and port (e.g. `http://localhost:8080/api/v1`)
4. **UI Origin** — Where the frontend is running (e.g. `http://localhost:8080`)
5. **Raw environment variables:**
   - `VITE_API_URL (raw)` — Exactly what was set, or "(not set)"
   - `VITE_WS_URL (raw)` — Exactly what was set, or "(not set)"
6. **Resolved API Origin** — After loopback filtering (may be null in hosted preview)
7. **Request method/body** (with secrets masked)
8. **Response status and content-type**

> **Important:** Always show both **raw** environment variable values and **resolved/effective** URLs. This helps diagnose cases where the env var is set to localhost but ignored in hosted previews.

### Implementation

```typescript
import { useErrorStore } from "@/stores/errorStore";

const { captureError, openErrorModal } = useErrorStore();

// On API error (structured ApiClientError)
if (!isApiClientError(error)) {
  return;
}

const captured = captureError(error.apiError, {
  endpoint: error.meta.requestUrl,  // <-- full resolved URL
  method: error.meta.method,
  requestBody: error.meta.requestBody,
});

// Auto-open for connectivity errors
const isConnectivityError = error.apiError.code === "E9005";
if (isConnectivityError) {
  openErrorModal(captured);
}
```

### Error Codes for Connectivity Issues

| Code | Meaning |
|------|---------|
| `E9003` | Network error (fetch failed) |
| `E9005` | API returned HTML instead of JSON |
| `E9006` | Unexpected response format (not JSON, not HTML) |

---

## 26.7 Debug Mode Features

### Activation
Set `logging.debugMode: true` in configuration.

### Features When Enabled
| Feature | Description |
|---------|-------------|
| Curl commands | Show equivalent curl for connection test steps |
| Extended logging | Verbose console output |
| Request/response details | Full payloads in connection logs |

### UI Toggle
Connection logs component shows a Terminal icon button when debug mode is active:
```tsx
{debugMode && (
  <Button onClick={() => setShowCurlCommands(!showCurlCommands)}>
    <Terminal />
  </Button>
)}
```
