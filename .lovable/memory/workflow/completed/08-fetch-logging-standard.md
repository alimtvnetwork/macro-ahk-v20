# Plan: Comprehensive Fetch Logging Standard (v7.9.24)

**Status**: COMPLETED
**Date Completed**: 2026-02-23
**Version**: v7.9.24

## Summary
Overhauled all `fetch()` calls across both `macro-looping.js` and `combo.js` to follow a mandatory logging standard. Every API request now logs full diagnostic information before and after the call.

## Root Cause
Debugging workspace detection failures (issues #04–#07) was severely hampered by vague logs that omitted URL, auth method, response status, and body content. The `resp.json()` call also crashed on empty 200 bodies.

## Changes

### Before-Request Logging (mandatory for every fetch)
- Full URL
- Auth method (Bearer/Cookie/None)
- Sanitized bearer token (first 12 chars + `...REDACTED`)
- Request headers (JSON)
- Request body

### After-Response Logging (mandatory for every fetch)
- Status code + statusText
- Content-Type header
- Content-Length header
- Body preview (first 200 chars)
- Error body (first 500 chars) on non-2xx responses

### Empty Body Handling
- **Rule**: NEVER use `resp.json()` — always `resp.text()` + `JSON.parse()`
- **Rationale**: `resp.json()` throws on empty bodies (HTTP 200/204 with no content)

## Files Changed
- `macro-looping.js` (all fetch calls), `combo.js` (all fetch calls)
- `spec/17-app-issues/07-mark-viewed-empty-body-vague-logging.md` (RCA document)

## Principle Established
**Comprehensive Fetch Logging**: No fetch call may exist without full before/after logging. Bearer tokens must be sanitized. This is non-negotiable for remote debugging.
