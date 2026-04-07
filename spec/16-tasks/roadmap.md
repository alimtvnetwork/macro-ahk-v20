# Open Issues Roadmap

> All major issues resolved. Only 1 deferred platform-specific item remains.
> Last updated: 2026-03-26

---

## Overview

| Metric | Value |
|---|---|
| Total tracked issues | 79 |
| ✅ Fixed | 78 |
| 📋 Open | 1 |
| 🔧 In Progress | 0 |

---

## All Phases Complete ✅

Every numbered issue has been resolved or verified as silently fixed.

## Deferred

- [ ] AHK file dialog delegation (from #43 → #44) — Windows-specific, requires native messaging host; low priority

---

## Closed Issue Merges

| Closed | Merged Into | Reason |
|---|---|---|
| #65 (Project Naming) | #67 (General Tab) | Name fixed; slug/codeName UI belongs in General tab |
| #44 (UX Fixes & Auto-Attach) | #43 (Scripts/Projects Overhaul) | Overlapping scripts redesign scope; unique items absorbed |

---

---

## Next Development Cycle (Specs Ready)

| # | Feature | Spec | Status |
|---|---------|------|--------|
| 20 | P Store Marketplace | `spec/13-features/pstore-marketplace.md` | 📋 Draft |
| 21 | Advanced Automation (Chains, Scheduling) | `spec/13-features/advanced-automation.md` | ✅ Complete |
| 22 | Cross-Project Sync & Shared Library | `spec/13-features/cross-project-sync.md` | 📋 Draft |

### Suggested Implementation Order

1. **P Store** — builds on existing ZIP import/export pipeline; highest user value
2. **Advanced Automation** — extends Task Next pattern; enables power-user workflows
3. **Cross-Project Sync** — requires stable asset model; best tackled last

---

*Roadmap v7 — 2026-03-26*
