# Envelope Configurability

This document describes which envelope sections are conditionally included and what backend settings control them.

## Conditional Sections

### Navigation

- **Present when:** Response is a paginated list (`IsMultiple: true` and `TotalPages > 1`)
- **Absent when:** Single-item responses, deletions, errors, unpaginated lists
- **Config:** `PerPage` default value is seedable via `config.json` → `pagination.defaultPerPage`

### Errors

- **Present when:** `HasAnyErrors` is `true` AND error reporting is enabled
- **Absent when:** No errors, or error reporting is disabled
- **Config:** Controlled by `config.json` → `responseDebug.includeErrors` (boolean)
- **Sub-field control:**
  - `Backend` stack trace: controlled by `responseDebug.includeStackTrace`
  - `DelegatedServiceErrorStack`: controlled by `responseDebug.includeStackTrace`
  - `DelegatedRequestServer`: controlled by `responseDebug.includeDelegatedServerInfo` (boolean, default: enabled when `includeErrors` is true)
  - `BackendMessage`: always included when Errors block is present
  - `Frontend`: reserved, always empty array from backend

### Errors.DelegatedRequestServer

- **Present when:** The Go backend proxied a request to a downstream server (PHP/WordPress, Chrome extension, or any 3rd-party service) AND that request failed (status ≥ 400)
- **Absent when:** No delegation occurred, or the delegated request succeeded, or `includeDelegatedServerInfo` is disabled
- **Fields:**
  - `DelegatedEndpoint` (string): Exact URL of the downstream endpoint called
  - `Method` (string): HTTP method used (GET, POST, etc.)
  - `StatusCode` (integer): HTTP status code returned by the downstream server
  - `RequestBody` (object|null): Request body sent to the downstream server, if any
  - `Response` (object|null): Full response body from the downstream server (should include stacktrace if the delegated server supports structured error responses)
  - `StackTrace` (string[]): Stack trace lines from the delegated server (e.g., PHP backtrace)
  - `AdditionalMessages` (string): Human-readable context about the error

### MethodsStack

- **Present when:** Debug/traversal mode is enabled in config
- **Absent when:** Debug mode is disabled (production default)
- **Config:** Controlled by `config.json` → `responseDebug.includeMethodsStack` (boolean)
- **Sub-field control:**
  - `Backend`: populated by Go runtime when enabled
  - `Frontend`: reserved, populated by frontend error reporting system

## Go Implementation

All conditional sections use pointer types with `json:",omitempty"`:

```go
type Response struct {
    Status      Status           `json:"Status"`
    Attributes  Attributes       `json:"Attributes"`
    Results     json.RawMessage  `json:"Results"`
    Navigation  *Navigation      `json:"Navigation,omitempty"`
    Errors      *Errors          `json:"Errors,omitempty"`
    MethodsStack *MethodsStack   `json:"MethodsStack,omitempty"`
}

type Errors struct {
    BackendMessage            string                  `json:"BackendMessage"`
    DelegatedServiceErrorStack []string               `json:"DelegatedServiceErrorStack,omitempty"`
    Backend                   []string                `json:"Backend,omitempty"`
    Frontend                  []string                `json:"Frontend,omitempty"`
    DelegatedRequestServer    *DelegatedRequestServer `json:"DelegatedRequestServer,omitempty"`
}

type DelegatedRequestServer struct {
    DelegatedEndpoint  string          `json:"DelegatedEndpoint"`
    Method             string          `json:"Method"`
    StatusCode         int             `json:"StatusCode"`
    RequestBody        json.RawMessage `json:"RequestBody,omitempty"`
    Response           json.RawMessage `json:"Response,omitempty"`
    StackTrace         []string        `json:"StackTrace,omitempty"`
    AdditionalMessages string          `json:"AdditionalMessages,omitempty"`
}
```

This ensures absent sections produce clean JSON without `null` values.

## Settings UI Mapping

| Setting Toggle | Controls | Default |
|---|---|---|
| Include Errors | `Errors` block presence | Enabled |
| Include Stack Traces | `Errors.Backend` + `Errors.DelegatedServiceErrorStack` | Disabled |
| Include Delegated Server Info | `Errors.DelegatedRequestServer` block | Enabled |
| Include Methods Stack | `MethodsStack` block presence | Disabled |
| Default Per Page | `Navigation` link generation, `Attributes.PerPage` | 10 |