## Error Logging & Type Safety — ✅ COMPLETE

**Spec**: `spec/10-macro-controller/ts-migration-v2/08-error-logging-and-type-safety.md`

| Task | Description | Status |
|------|-------------|--------|
| T1 | Create `NamespaceLogger` class in SDK | ✅ Complete |
| T2 | Update `globals.d.ts` with full namespace + Logger types | ✅ Complete |
| T3 | Fix all 16 swallowed errors (S1–S16) | ✅ Complete |
| T4 | Eliminate all `any` types (5 files) | ✅ Complete |
| T5 | Migrate controller `log(msg, 'error')` calls to `Logger.error()` | ✅ Complete |
| T6 | Verify: `tsc --noEmit` passes, ESLint zero errors | ✅ Complete |

---

## Rename Preset Persistence — Implementation Plan

**Spec**: `spec/10-macro-controller/ts-migration-v2/07-rename-persistence-indexeddb.md`

### Task 1: Create generic `ProjectKvStore` module
- **File**: `standalone-scripts/macro-controller/src/project-kv-store.ts`
- IndexedDB wrapper with DB name `RiseUpAsia.Projects.<ProjectName>.IndexDb`
- Object store `kv` with keyPath `key`
- API: `get(section, key)`, `set(section, key, value)`, `delete(section, key)`, `list(section)`, `getAll(section)`
- Compound key: `${section}::${key}`
- Each record: `{ key, section, value, updatedAt }`
- Error logs with exact DB name, store, key, reason

### Task 2: Create `RenamePresetStore` module
- **File**: `standalone-scripts/macro-controller/src/rename-preset-store.ts`
- Wraps `ProjectKvStore` with section `MacroController.Rename`
- API: `listPresets()`, `getActivePresetName()`, `setActivePresetName()`, `loadPreset()`, `savePreset()`, `deletePreset()`
- `RenamePreset` type added to `types.ts`

### Task 3: Add `buildPresetRow()` UI helper
- **File**: `standalone-scripts/macro-controller/src/ui/bulk-rename-fields.ts`
- Dropdown showing all saved presets + "➕ New..." option
- Small "🗑" delete button next to dropdown
- Styled consistently with existing rename fields

### Task 4: Integrate persistence into `bulk-rename.ts`
- **File**: `standalone-scripts/macro-controller/src/ui/bulk-rename.ts`
- On open: resolve project → load presets → populate dropdown → load active preset → fill fields
- Add "💾 Save" button to button row
- Auto-save on Apply (before executing rename)
- Auto-save on Close/Cancel (before removing dialog)
- Pattern switch loads selected preset values
- "➕ New..." prompts for name, creates preset
- Delete removes preset (cannot delete last one)

### Task 5: Update barrel exports and docs
- **File**: `standalone-scripts/macro-controller/src/workspace-rename.ts` — re-export preset store
- Update LLM guide / developer guide with ProjectKvStore usage pattern
- Update rename system memory docs

### Task 6: Version bump
- Bump macro controller version (at least minor)
- Update all version sync files
