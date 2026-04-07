# Master Task Breakdown — Options UI & SDK Issues

**Date**: 2026-03-25  
**Referenced from**: `.lovable/plan.md`

---

## Priority Order

Tasks are ordered by dependency and severity. Critical issues first, then UX improvements.

---

## Phase 1: Critical — SDK Global Object (Issue 66)

### Task 1.1: Create `window.RiseupAsiaMacroExt` root object
- **File**: `standalone-scripts/marco-sdk/src/index.ts`
- **Action**: After creating `window.marco`, also create `window.RiseupAsiaMacroExt = { Projects: {} }`
- **Note**: Root must be unfrozen so project namespaces can be registered later

### Task 1.2: Create per-project namespace registration
- **File**: `src/background/marco-sdk-template.ts` or new `src/background/project-namespace-builder.ts`
- **Action**: After injecting a project's scripts, inject a namespace IIFE that registers `window.RiseupAsiaMacroExt.Projects.<CodeName>` with proxy methods to `window.marco.*`
- **Requires**: Project slug and codeName available at injection time

### Task 1.3: Update injection handler to pass codeName
- **File**: `src/background/handlers/injection-handler.ts`
- **Action**: Compute `codeName` from project name/slug and pass to namespace builder

### Task 1.4: Validate Developer Guide snippets work
- **Action**: Manually test that all code snippets from DevGuideSection work in console

---

## Phase 2: Naming & Display (Issues 65, 72)

### Task 2.1: Fix project name "Rise Up" → "Riseup"
- **Files**: `src/background/default-project-seeder.ts`, `standalone-scripts/marco-sdk/src/index.ts`
- **Action**: Replace all "Rise Up Macro SDK" with "Riseup Macro SDK"

### Task 2.2: Add codeName to ProjectHeader
- **File**: `src/components/options/ProjectDetailView.tsx`
- **Action**: Compute `toCodeName(slug)` and display below description alongside slug

### Task 2.3: Fix slug/description layout
- **File**: `src/components/options/ProjectDetailView.tsx`
- **Action**: Move slug and codeName to their own row, align description with title

---

## Phase 3: Project Structure (Issues 67, 68)

### Task 3.1: Add General/Overview tab
- **File**: `src/components/options/ProjectDetailView.tsx`
- **Action**: New tab showing dependencies, flags (isGlobal, isRemovable), and settings

### Task 3.2: Fix script config resolution
- **File**: `src/components/options/ProjectDetailView.tsx`
- **Action**: Resolve config bindings by path/name in addition to ID

---

## Phase 4: Auth & Cookies (Issue 69)

### Task 4.1: Add cookie bindings to SDK project seeder
- **File**: `src/background/default-project-seeder.ts`
- **Action**: Add Lovable session cookies (with `__Secure-` and `__Host-` aliases) to `buildSdkProject()`

### Task 4.2: Ensure auth handler uses SDK cookie bindings
- **File**: `src/background/handlers/config-auth-handler.ts`
- **Action**: Resolve cookie names from project dependency chain

---

## Phase 5: Health & Logging (Issue 70)

### Task 5.1: Silence redundant health recovery logs
- **File**: `src/background/health-handler.ts`
- **Action**: Only log recovery when transitioning from non-HEALTHY state

---

## Phase 6: Updater UI (Issue 71)

### Task 6.1: Expand UpdaterPanel with all UpdaterInfo fields
- **File**: `src/components/options/UpdaterPanel.tsx`
- **Action**: Add Advanced Settings section, endpoint management, step management

### Task 6.2: Wire UpdaterPanel to real handlers
- **Action**: Replace mock `setTimeout` with actual CHECK_FOR_UPDATE message bridge

---

## Phase 7: Spec & Memory Updates

### Task 7.1: Update spec 63 to match implementation
- **File**: `spec/11-chrome-extension/63-rise-up-macro-sdk.md`

### Task 7.2: Update naming in all specs and memory files
- **Files**: All files referencing "Rise Up Macro SDK"

### Task 7.3: Create URL rules expansion spec
- **Action**: Document when/how new URL rules should be added for new platforms
