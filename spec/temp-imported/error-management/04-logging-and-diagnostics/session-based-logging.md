# Specification: Session-Based Logging System

**Version:** 2.0.0  
**Created:** 2026-02-06  
**Updated:** 2026-02-11  
**Status:** Implemented

---

## 1. Executive Summary

The session-based logging system provides complete request/response traceability for all API calls. Each HTTP request is assigned a unique session ID, and full diagnostic data is captured and persisted for later retrieval and analysis. In v2.0.0, sessions now capture **DelegatedRequestServer** data when the Go backend proxies requests to external services (WordPress PHP, Chrome extensions, etc.), enabling end-to-end 3-hop traceability.

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| F1 | Every API request must be assigned a unique session ID | MUST |
| F2 | Request headers, body, and metadata must be captured | MUST |
| F3 | Response status, body, and timing must be captured | MUST |
| F4 | Sensitive headers must be redacted before storage | MUST |
| F5 | Sessions must be retrievable via API | MUST |
| F6 | Sessions must be filterable by method, path, status | SHOULD |
| F7 | Error sessions must be easily identifiable | MUST |
| F8 | Sessions must auto-expire after retention period | SHOULD |
| F9 | Session logging must be toggleable via config | MUST |
| F10 | Health check endpoints must be excluded | MUST |
| F11 | Delegated request metadata must be captured when proxying | MUST |
| F12 | Session ID must be linkable to error envelope `Attributes.SessionId` | MUST |
| F13 | Delegated server stack traces must be captured in session | SHOULD |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NF1 | Logging overhead | < 5ms per request |
| NF2 | Storage efficiency | < 10KB per session average |
| NF3 | Retention period | 7 days (configurable) |
| NF4 | Max body capture | 50KB per request/response |

---

## 3. Architecture

### 3.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        HTTP Request                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Session Logging Middleware                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ Generate ID │──│ Capture Req │──│ Wrap ResponseWriter     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Request Handler                             │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  If delegated request → Capture DelegatedRequestServer   │    │
│  │  (endpoint, method, status, stacktrace, request body,    │    │
│  │   response body, additional messages)                    │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Session Logging Middleware                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Capture Response│──│ Extract Errors  │──│ Save to Store   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Request Session Store                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ data/request-sessions/{date}/{hour}/{uuid}.json             ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Long-running: data/sessions/{uuid}/                         ││
│  │   session.log | error.log | request.json | response.json    ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 3-Hop Request Chain

```
┌──────────┐     ┌──────────────┐     ┌─────────────────────────┐
│  React   │────▶│  Go Backend  │────▶│  Delegated Server       │
│ Frontend │     │  (Session    │     │  (WordPress PHP /       │
│          │◀────│   Middleware) │◀────│   Chrome Extension /    │
│          │     │              │     │   3rd-party API)        │
└──────────┘     └──────────────┘     └─────────────────────────┘
     ①                  ②                       ③
  Frontend          Go Session              Delegated
  Error Store       Logs + Error            Request Server
  (sessionId)       Log + Envelope          (captured in
                    + DelegatedReq          response.json)
```

**Session-Error Linkage Flow:**
1. Go middleware creates session UUID → stored in `context.Value("sessionId")`
2. Handler proxies to delegated server → captures `DelegatedRequestServer` data
3. On error (status ≥ 400): `respondErrorWithSession` extracts `sessionId` from `apperror.AppError.Context` and attaches it to the envelope response as `Attributes.SessionId`
4. Frontend receives envelope → extracts `Attributes.SessionId` → stores in `CapturedError.sessionId`
5. Error modal auto-fetches diagnostics via `GET /api/v1/sessions/{id}/diagnostics`

### 3.3 Data Flow

1. **Request Arrives** → Middleware intercepts
2. **Generate Session** → UUID created, stored in context
3. **Capture Request** → Headers (redacted), body (truncated), metadata
4. **Execute Handler** → Normal request processing
5. **Delegated Request** → If handler proxies to external service, capture `DelegatedRequestServer` block
6. **Capture Response** → Status, body (truncated), timing
7. **Extract Errors** → Parse error message if status >= 400
8. **Persist Session** → Write JSON to file store

---

## 4. Data Model

### 4.1 RequestSession

```go
type RequestSession struct {
    // Identity
    ID string `json:"id"` // UUID v4
    
    // Request Data
    Method         string            `json:"method"`
    Path           string            `json:"path"`
    QueryString    string            `json:"queryString,omitempty"`
    RequestHeaders map[string]string `json:"requestHeaders"`
    RequestBody    string            `json:"requestBody,omitempty"`
    
    // Response Data
    ResponseStatus int    `json:"responseStatus"`
    ResponseBody   string `json:"responseBody,omitempty"`
    
    // Timing
    StartTime  time.Time `json:"startTime"`
    EndTime    time.Time `json:"endTime"`
    DurationMs int64     `json:"durationMs"`
    
    // Error (extracted from response if status >= 400)
    Error string `json:"error,omitempty"`
    
    // Delegated Request (v2.0.0) — captured when Go proxies to external service
    DelegatedRequest *DelegatedRequestInfo `json:"delegatedRequest,omitempty"`
}

// DelegatedRequestInfo captures the full context of a proxied request
// to an external service (WordPress PHP, Chrome extension, etc.)
type DelegatedRequestInfo struct {
    DelegatedEndpoint  string          `json:"delegatedEndpoint"`            // Full URL of the delegated server endpoint
    Method             string          `json:"method"`                       // HTTP method used (GET, POST, etc.)
    StatusCode         int             `json:"statusCode"`                   // HTTP status code from delegated server
    RequestBody        json.RawMessage `json:"requestBody,omitempty"`        // Request body sent to delegated server
    Response           json.RawMessage `json:"response,omitempty"`           // Response body from delegated server
    StackTrace         []string        `json:"stackTrace,omitempty"`         // Delegated server stack trace (if error)
    AdditionalMessages string          `json:"additionalMessages,omitempty"` // Extra context/messages
    DurationMs         int64           `json:"durationMs,omitempty"`         // Time spent on delegated request
}
```

### 4.2 Storage Format — Standard Request Session

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "method": "GET",
  "path": "http://localhost:8080/api/v1/sites/1/snapshots/settings",
  "queryString": "",
  "requestHeaders": {
    "content-type": "application/json",
    "authorization": "[REDACTED]"
  },
  "requestBody": "",
  "responseStatus": 500,
  "responseBody": "{\"Status\":{\"IsSuccess\":false,...}}",
  "startTime": "2026-02-11T16:53:30.000Z",
  "endTime": "2026-02-11T16:53:34.190Z",
  "durationMs": 4190,
  "error": "[E3001] failed to fetch snapshot settings",
  "delegatedRequest": {
    "delegatedEndpoint": "https://demoat.attoproperty.com.au/riseup-asia-uploader/v1/snapshots/settings",
    "method": "GET",
    "statusCode": 403,
    "requestBody": null,
    "response": {
      "code": "rest_forbidden",
      "message": "Sorry, you are not allowed to do that.",
      "data": { "status": 403 }
    },
    "stackTrace": [
      "WP_REST_Server::dispatch() at /wp-includes/rest-api/class-wp-rest-server.php:1063",
      "WP_REST_Server::respond_to_request() at /wp-includes/rest-api/class-wp-rest-server.php:420"
    ],
    "additionalMessages": "WordPress REST API returned 403 - check application password permissions",
    "durationMs": 3800
  }
}
```

### 4.3 Storage Format — Long-Running Operation Session

Long-running operations (publish, sync, remote plugin actions) use UUID-named folders:

```
data/sessions/{uuid}/
├── session.log          # Real-time execution log (streamed via WebSocket)
├── error.log            # Error-specific log entries
├── request.json         # Original request payload
└── response.json        # Final response (includes DelegatedRequestServer if applicable)
```

**response.json sample (with DelegatedRequestServer):**

```json
{
  "requestUrl": "https://demoat.attoproperty.com.au/riseup-asia-uploader/v1/snapshots/settings",
  "responseUrl": "https://demoat.attoproperty.com.au/riseup-asia-uploader/v1/snapshots/settings",
  "statusCode": 403,
  "headers": {
    "content-type": "application/json; charset=UTF-8"
  },
  "body": {
    "code": "rest_forbidden",
    "message": "Sorry, you are not allowed to do that."
  },
  "delegatedRequest": {
    "delegatedEndpoint": "https://demoat.attoproperty.com.au/riseup-asia-uploader/v1/snapshots/settings",
    "method": "GET",
    "statusCode": 403,
    "stackTrace": ["..."],
    "additionalMessages": "Permission denied"
  }
}
```

### 4.4 Session-Error Linkage

The `SessionId` field connects session logs to the error envelope:

```go
// In respondErrorWithSession helper:
func respondErrorWithSession(
	w http.ResponseWriter,
	r *http.Request,
	appErr *apperror.AppError,
) {
    sessionId := extractSessionId(appErr, r)
    envelope := buildErrorEnvelope(appErr)

    if sessionId != "" {
        envelope.Attributes.SessionId = sessionId
    }
    // ... write response
}

func extractSessionId(appErr *apperror.AppError, r *http.Request) string {
    if sid, ok := appErr.Context["sessionId"]; ok {
        return sid.(string)
    }

    if sid := r.Context().Value("sessionId"); sid != nil {
        return sid.(string)
    }

    return ""
}
```

**Frontend extraction:**

```typescript
// In the API response handler:
const sessionId = envelope?.Attributes?.SessionId;
if (sessionId) {
  capturedError.sessionId = sessionId;
}
```

---

## 5. API Specification

### 5.1 List Sessions

```
GET /api/v1/request-sessions
```

**Query Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| limit | int | 50 | Results per page (max 500) |
| offset | int | 0 | Pagination offset |
| method | string | - | Filter by HTTP method |
| path | string | - | Filter by path substring |
| status | int | - | Filter by status code |
| errorsOnly | bool | false | Only error sessions |

**Response:**

```json
{
  "success": true,
  "data": {
    "sessions": [...],
    "total": 150,
    "limit": 50,
    "offset": 0
  }
}
```

### 5.2 Get Session

```
GET /api/v1/request-sessions/{id}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "...",
    "method": "POST",
    "delegatedRequest": { ... },
    ...
  }
}
```

### 5.3 Get Session Diagnostics

```
GET /api/v1/sessions/{id}/diagnostics
```

Aggregates data from long-running operation sessions:

**Response:**

```json
{
  "success": true,
  "data": {
    "request": {
      "url": "http://localhost:8080/api/v1/sites/1/snapshots/settings",
      "method": "GET",
      "headers": { "content-type": "application/json" },
      "body": {}
    },
    "response": {
      "requestUrl": "https://demoat.attoproperty.com.au/...",
      "responseUrl": "https://demoat.attoproperty.com.au/...",
      "statusCode": 403,
      "headers": { "content-type": "application/json" },
      "body": { "code": "rest_forbidden", "message": "..." }
    },
    "stackTrace": {
      "golang": [
        { "function": "handlers.init.handleSiteActionByID.func63", "file": "handler_factory.go", "line": 107 },
        { "function": "api.NewServer.SessionLogging.func3.1", "file": "session_logging.go", "line": 107 }
      ],
      "php": [
        { "function": "dispatch", "class": "WP_REST_Server", "file": "class-wp-rest-server.php", "line": 1063 }
      ]
    },
    "phpStackTraceLog": "raw stacktrace.txt content...",
    "delegatedRequest": {
      "delegatedEndpoint": "https://demoat.attoproperty.com.au/...",
      "method": "GET",
      "statusCode": 403,
      "stackTrace": ["..."],
      "additionalMessages": "..."
    }
  }
}
```

### 5.4 Get Session Logs

```
GET /api/v1/sessions/{id}/logs
```

Returns the raw `session.log` content:

```json
{
  "success": true,
  "data": {
    "logs": "[2026-02-11 16:53:30] STAGE: INIT\n[2026-02-11 16:53:30] Fetching snapshot settings...\n..."
  }
}
```

### 5.5 Delete Session

```
DELETE /api/v1/request-sessions/{id}
```

### 5.6 Clear All Sessions

```
DELETE /api/v1/request-sessions
```

### 5.7 List Error Sessions

```
GET /api/v1/request-sessions/errors
```

Shorthand for `?errorsOnly=true`

### 5.8 Export Session

```
GET /api/v1/request-sessions/{id}/export
```

Returns session as downloadable JSON file.

---

## 6. Configuration

### 6.1 Config Schema

```json
{
  "logging": {
    "sessionLoggingEnabled": true,
    "clearLogsOnStartup": false,
    "clearSessionsOnStartup": false,
    "includeDelegatedServerInfo": true
  }
}
```

### 6.2 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| SESSION_LOGGING_ENABLED | true | Enable/disable session logging |
| SESSION_RETENTION_DAYS | 7 | Days to retain sessions |
| SESSION_MAX_BODY_SIZE | 51200 | Max body capture in bytes |
| INCLUDE_DELEGATED_INFO | true | Capture delegated request data |

---

## 7. Security Considerations

### 7.1 Header Redaction

The following headers are automatically redacted:

- `Authorization`
- `Cookie`
- `X-API-Key`
- `X-Auth-Token`

### 7.2 Body Truncation

Request and response bodies are truncated at 50KB to prevent:
- Disk exhaustion from large payloads
- Memory pressure during capture
- Slow reads when listing sessions

### 7.3 Delegated Request Redaction

Delegated request bodies and responses are subject to the same truncation rules. Sensitive fields in delegated response bodies (e.g., `password`, `token`, `secret`) are redacted.

### 7.4 Retention

Sessions auto-expire after 7 days to:
- Limit disk usage
- Reduce exposure of sensitive data
- Keep queries performant

---

## 8. Implementation Files

| File | Purpose |
|------|---------|
| `backend/internal/api/middleware/session_logging.go` | Middleware implementation |
| `backend/internal/services/requestsession/store.go` | File-based storage |
| `backend/internal/api/handlers/request_session_handlers.go` | API handlers |
| `backend/internal/api/handlers/handler_factory.go` | Handler factory (delegated request capture) |
| `backend/internal/api/router.go` | Route registration |
| `backend/cmd/server/main.go` | Initialization |
| `backend/internal/apperror/respond.go` | `respondErrorWithSession` helper |

---

## 9. Error Log Format (error.log.txt)

When a session encounters an error, the backend writes a structured error log. This is the canonical format:

```
[2026-02-12 00:53:34] HTTP 500 GET FAILED
  Requested To: GET http://localhost:8080/api/v1/sites/1/snapshots/settings
  Duration: 4.1904552s
  Error Code: 500
  Error Message: [E3001] failed to fetch snapshot settings: get snapshot settings (GET https://demoat.attoproperty.com.au/wp-json/riseup-asia-uploader/v1/snapshots/settings): status 403
  Backend Error: [E3025] [E3001] failed to fetch snapshot settings: ...
  Go Backend Stack:
    D:/.../handler_factory.go:107 handlers.init.handleSiteActionByID.func63
    D:/.../session_logging.go:107 api.NewServer.SessionLogging.func3.1
    D:/.../middleware.go:245 api.NewServer.Recovery.func2.1
    D:/.../middleware.go:66 api.NewServer.Logging.func1.1
    D:/.../middleware.go:45 middleware.CORS.func1
  Go Methods Stack:
    #0 handlers.init.handleSiteActionByID.func63 at D:/.../handler_factory.go:107
    #1 api.NewServer.SessionLogging.func3.1 at D:/.../session_logging.go:107
    ...
  Delegated Server Info:
    Endpoint: "https://demoat.attoproperty.com.au/riseup-asia-uploader/v1/snapshots/settings"
    Method: "GET"
    Status: 403
    Stacktrace:
        WP_REST_Server::dispatch() at class-wp-rest-server.php:1063
        ...
    RequestBody:
        (empty)
    Additional Message:
        WordPress REST API returned 403 - check application password permissions
  Response Body:
    { "Status": { "IsSuccess": false, ... }, "Errors": { ... } }
```

---

## 10. Testing

### 10.1 Unit Tests

- Middleware captures all request fields
- Response writer wrapper works correctly
- Header redaction functions properly
- Body truncation at limit
- Error extraction from JSON response
- DelegatedRequestInfo is captured when proxying
- Session ID is attached to error envelope

### 10.2 Integration Tests

- Session persisted to disk
- Session retrievable via API
- Filters work correctly
- Pagination works correctly
- Cleanup runs on schedule
- Diagnostics endpoint aggregates delegated request data
- Session-error linkage via Attributes.SessionId

---

## 11. Monitoring

### 11.1 Metrics

- `request_sessions_total` - Total sessions created
- `request_sessions_errors` - Sessions with errors
- `request_sessions_duration_ms` - Capture overhead
- `request_sessions_disk_bytes` - Storage used
- `request_sessions_delegated_total` - Sessions with delegated requests

### 11.2 Alerts

- Disk usage > 1GB
- Error rate > 10%
- Capture overhead > 10ms

---

## 12. Future Enhancements

1. **Search** - Full-text search of request/response bodies
2. **Compression** - Gzip session files for storage efficiency
3. **Streaming** - Real-time session streaming via WebSocket
4. **Correlation** - Link related sessions (e.g., retry chains)
5. **Export** - Bulk export for external analysis
6. **Delegated Server Replay** - Re-execute delegated requests for debugging

---

*Specification created: 2026-02-06 | Updated: 2026-02-11 (v2.0.0 — DelegatedRequestServer, session-error linkage)*
