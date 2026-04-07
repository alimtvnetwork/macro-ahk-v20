# Memory: features/options-ui/backend-menu-project-files-workstream
Updated: 2026-03-22

User requested a prioritized one-by-one implementation workstream:

1. Make Swagger-like API explorer clearly visible in backend menu.
2. Add Session, Cookies, and IndexedDB sections in Storage browser.
3. Fix prompt completeness regression (all prompts must appear, not only one).
4. Move timing/data/network/diagnostics controls into overflow `...` menu.
5. Add project-level Files & Storage tool (file tree + editor + save/delete).
6. Add project ZIP export/import with two conflict modes: Merge and Replace-all.

Execution requirement from user: create tasks first, update memory + plan, then execute one task at a time.

Tracking spec: `spec/17-app-issues/62-backend-menu-swagger-storage-files-and-zip-workflow.md`