# Error Resolution Retrospectives

> **Purpose:** Document frontend-backend communication issues, time-wasting mistakes, and solutions to prevent AI/developer recurrence.  
> **Created:** 2026-02-04

---

## Why This Folder Exists

During development, significant time was wasted on API connectivity issues where:
1. The frontend incorrectly diagnosed a healthy backend as "disconnected"
2. Error diagnostics showed confusing or misleading information
3. The API endpoint response format didn't match frontend expectations

This folder contains detailed retrospectives so that future AI agents and developers can:
- **Avoid repeating the same mistakes**
- **Understand the root cause quickly** when similar symptoms appear
- **Follow verification patterns** before claiming an endpoint works

---

## Documents

| File | Issue | Time Wasted |
|------|-------|-------------|
| [01-health-endpoint-mismatch.md](./01-health-endpoint-mismatch.md) | Frontend expected `{success:true}` but backend returned `{status:"healthy"}` | ~1 hour |

---

## Mandatory Verification Pattern

Before claiming any API endpoint works, ALWAYS verify **both directions**:

### 1. Backend Verification
```bash
# Test the actual endpoint
curl -s http://localhost:8080/api/v1/health | jq .

# Expected: {"success":true,"data":{"status":"ok","timestamp":"..."}}
```

### 2. Frontend Verification
Check what the frontend code actually expects:
- What response shape does it parse?
- What conditions trigger "connected" vs "disconnected"?
- Are there any hidden assumptions (e.g., `success === true`)?

### 3. Never Assume
- Don't assume an endpoint exists just because the spec says so
- Don't assume response format matches without checking handler code
- Don't assume frontend detection logic is correct without reading it

---

## Quick Reference: Common Pitfalls

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| "Backend disconnected" but backend is running | Response format mismatch | Compare handler output to frontend detection logic |
| 404 on API base URL | No index route registered | Check router for `GET /api/v1` handler |
| VITE_API_URL shows wrong value | Resolved vs raw env confusion | Distinguish raw env var from resolved origin |
| HTML instead of JSON | SPA fallback serving index.html | Check if route exists in backend router |

---

## How to Add New Retrospectives

When you encounter a time-wasting issue:

1. Create a new file: `NN-short-description.md`
2. Use the template from existing files
3. Include:
   - **Symptoms**: What did you observe?
   - **Root Cause**: Why did it happen?
   - **Time Wasted**: How long did debugging take?
   - **Solution**: What fixed it?
   - **Prevention**: How to avoid next time?
