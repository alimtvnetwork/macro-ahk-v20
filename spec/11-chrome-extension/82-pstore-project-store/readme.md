# Issue 82: P Store — Project & Script Store

**Date**: 2026-03-26  
**Status**: Pending — Owner will share more details  
**Severity**: Enhancement  

---

## Concept Summary

A discoverable project/script marketplace (similar to Chrome Web Store or Play Store) integrated into the extension Options UI. Users can browse, search, and import community or organization projects and scripts from a remote store API.

---

## Key Ideas (Initial)

1. **Store URL in Settings** — configurable P Store API endpoint (like updater URL pattern).
2. **Search API** — query the store for projects/scripts by name, category, tags.
3. **Caching** — configurable cache TTL for search results to reduce API calls.
4. **Import Flow** — import projects and scripts directly from store into local storage.
5. **Discovery UI** — browsable store UI inside Options (search bar, categories, cards).
6. **Updater Integration** — store entries can leverage the existing updater system for version tracking.

---

## Architecture Notes

- Follows the same pattern as the Updater system (remote URL → fetch → parse → act).
- Store API contract TBD (owner to define schema, endpoints, auth).
- Local search bar in Projects section should also search across P Store results.

---

## Open Questions

- [ ] Store API schema and endpoints
- [ ] Authentication model (public vs. API key)
- [ ] Import conflict resolution (merge vs. replace)
- [ ] Rating/review system?
- [ ] Script sandboxing / trust model for imported code
- [ ] Relationship between P Store entries and Updater entries

---

## Files (to be added)

| File | Purpose | Status |
|------|---------|--------|
| `01-api-contract.md` | Store API schema + endpoints | Pending |
| `02-ui-wireframes.md` | Store browsing UI spec | Pending |
| `03-import-flow.md` | Import/merge/conflict resolution | Pending |
| `04-caching-strategy.md` | Search result caching config | Pending |
| `05-settings-integration.md` | Settings page for store URL | Pending |

---

*Spec created 2026-03-26 — awaiting owner input before implementation.*
