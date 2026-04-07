# Issue 44: Comprehensive UX Fixes, Scripts Redesign & Auto-Attach Feature

**Version**: vTBD  
**Date**: 2026-03-18  
**Status**: ✅ Closed (remaining scope merged into #43)

---

## Issue Summary

Multiple interrelated issues spanning Projects naming, Scripts section redesign, syntax highlighter bugs, macro controller UI polish, and a new Auto-Attach Files feature for automated file attachment workflows.

---

## 1. Projects — Name & Version Display Fix

### Current behavior
- Project cards do not show a visible/editable name.
- A mysterious "V" is displayed (likely a truncated version label like `v1.0.0` rendered as just "V" or `v` without the actual version).
- No clear way to rename a project after creation.

### Required behavior
- Every project card MUST display the project **name** prominently.
- The "V" is the version badge (`v{version}`). If the version is empty/undefined, hide the badge entirely instead of showing a bare "V" or "v".
- Project name must be editable from the project detail/edit view.
- A visible **Save** button must exist in the edit flow to persist changes.

### Root cause investigation
- Check `ProjectsList.tsx`, `ProjectDetailView.tsx`, and `ProjectCreateForm.tsx` for where `project.name` is rendered.
- Check if `project.version` defaults to an empty string, causing `v` + `""` = `"v"`.

---

## 2. Scripts Section — Redesign to Match Projects

### Current behavior
- Scripts section shows a two-tab layout (Scripts / Configs) with flat entries.
- Does not match the Projects section look & feel.
- Confusing UX — no clear entity model.

### Required behavior
- **Remove the two-tab (Scripts/Configs) approach.**
- Scripts section should look and behave **identically to Projects**:
  - Card-based list view with script bundle names.
  - Click **New** → enter a name (default: "My Macro Script"), add JS and JSON files.
  - Click **Edit** → modify name, add/remove/reorder JS and JSON files.
  - Click **Save** → persist changes explicitly.
- Each "Script" is a named bundle containing:
  - Multiple ordered **JS files** (each with optional `runAt`)
  - Multiple ordered **JSON config files**
  - Each JS file can be paired with one or more JSON configs
- The **same smallest reusable component** (`ProjectScriptSelector` or a shared variant) should be used in both Projects and Scripts for managing JS + JSON file entries.
- Drag-and-drop zone for adding `.js` and `.json` files (already exists, keep it).
- If multiple JS files or a mix of JS + JSON files are dragged, they should all appear and be saved properly.

### Data model
The `ScriptBundle` type already exists in `src/shared/script-bundle-types.ts`:
```ts
interface ScriptBundle {
  id: string;
  name: string;
  description?: string;
  jsEntries: BundleJsEntry[];
  configEntries: BundleConfigEntry[];
  order: number;
  isEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}
```
This should be the backing model. Storage handlers need to support CRUD for bundles.

---

## 3. Syntax Highlighter — Critical Rendering Bug

### Current behavior
- When viewing JS code in the editor, the rendered/highlighted text does **not match** the actual source code.
- Copying the code from the editor produces different text than what is visually displayed.
- The visible rendering shows "garbage" — likely caused by HTML entity leakage, incorrect tokenization, or overlay misalignment between the highlighted layer and the editable layer.

### Required investigation
1. **Which editor is active?** — Monaco (`@monaco-editor/react`) vs. the Chrome extension fallback (`MonacoEditorFallback` in `chrome-extension/src/shims/monaco-react.tsx`).
2. **If Monaco**: Check if the `value` prop is being set correctly, if there are encoding issues, or if the editor instance is corrupted.
3. **If fallback textarea with overlay**: The character-by-character tokenizer (per memory `features/options-ui/editor-systems`) likely has HTML tag leakage — the highlighted overlay diverges from the textarea content.
4. **Copy mismatch**: If using a layered approach (textarea behind highlighted div), ensure the textarea holds the real text and the overlay is `pointer-events: none` with identical font metrics.

### Required fix
- The displayed code MUST exactly match the underlying source.
- Copied text MUST match displayed text.
- No HTML entities or tags should leak into visible output.

### Auto-suggestions
- If Monaco is available, enable `suggestOnTriggerCharacters`, `quickSuggestions`, and basic JS IntelliSense.
- If using fallback, auto-suggestions are not feasible — document this limitation.

---

## 4. Macro Controller UI — Button Spacing & Animation

### Current behavior
- Check, Play (Start/Stop), and Credits buttons have minimal padding (`padding:5px 0` on `btnRow`).
- Buttons are left-aligned via `flex-wrap:wrap; align-items:center`.
- The macro icon/badge uses a simple `scale` zoom animation on click.

### Required behavior

#### 4a. Button spacing
- Add **top and bottom padding** to the button row: change `padding:5px 0` → `padding:8px 0` (or similar).
- **Center** the buttons: add `justify-content:center` to `btnRow.style.cssText`.

#### 4b. Macro icon animation
- Replace the simple zoom (`scale(0.85)` → `scale(1.1)` → `scale(1)`) with a more polished animation:
  - Add a **color slide effect**: brief background color shift (e.g., highlight sweep from left to right) combined with the scale.
  - Use a CSS `@keyframes` animation for smoothness.
  - Example approach:
    ```css
    @keyframes btnPulse {
      0%   { transform: scale(1); background-position: 0% 50%; }
      30%  { transform: scale(0.92); }
      60%  { transform: scale(1.05); background-position: 100% 50%; }
      100% { transform: scale(1); background-position: 0% 50%; }
    }
    ```
  - Apply `background: linear-gradient(90deg, original-color, lighter-color, original-color)` with `background-size: 200% 100%` for the slide effect.

---

## 5. Auto-Attach Files Feature (New)

### Overview
A new workflow automation feature that attaches files to the Lovable editor chat box by simulating clicks on UI elements and inserting file paths into the OS file dialog.

### XPaths (configurable)
- **plusButtonXPath**: `/html/body/div[3]/div/div[2]/main/div/div/div[1]/div/div[2]/div/form/div[2]/button[1]`
- **attachButtonXPath**: `/html/body/div[6]/div/div[10]`

### Workflow per file
1. Click the element at `plusButtonXPath`
2. Wait `preDialogDelayMs` (default: 800ms)
3. Click the element at `attachButtonXPath`
4. Wait `preFileDialogDelayMs` (default: 1000ms)
5. Insert the file path into the OS file open dialog
6. Confirm selection
7. Wait `stepDelayMs` (default: 200ms)
8. Repeat for next file

### File Groups
Files are organized into named **groups**. Each group contains:
- `name`: Group display name
- `files`: Array of file paths (absolute OS paths)
- `prompt`: Text to inject into the chat box after all files are attached

### Configuration storage
Stored in a **separate JSON config file** paired with the macro controller script:

```json
{
  "autoAttach": {
    "plusButtonXPath": "/html/body/div[3]/...",
    "attachButtonXPath": "/html/body/div[6]/...",
    "chatBoxXPath": "...",
    "timing": {
      "stepDelayMs": 200,
      "preDialogDelayMs": 800,
      "preFileDialogDelayMs": 1000
    },
    "groups": [
      {
        "name": "Test Scripts Bundle",
        "files": [
          "C:/Users/me/scripts/test-helper.js",
          "C:/Users/me/scripts/test-config.json"
        ],
        "prompt": "Please review these test scripts and integrate them."
      }
    ]
  }
}
```

### Macro Controller UI integration
- Add an **"Auto Attach"** section in the ☰ menu dropdown (or as a separate dropdown button).
- Shows group names as clickable items.
- Clicking a group triggers the full attach workflow:
  1. Insert the group's prompt into the chat box via `chatBoxXPath`
  2. For each file in the group, run the attach workflow (Plus → Attach → file path → confirm)
  3. Show progress in the status bar ("Attaching file 2/5...")

### Load Test Scripts button
- Add a **"Load Test Scripts"** button that reads the auto-attach config and shows the groups dropdown.
- This is effectively the entry point to the Auto Attach feature.

### OS file dialog interaction
- **Windows**: Use `chrome.debugger` or `chrome.input.dispatchKeyEvent` to type the file path + Enter. Alternatively, if running via AHK, delegate to AHK for file dialog interaction.
- **macOS**: Similar approach with AppleScript or keyboard simulation.
- **Limitation**: Direct OS file dialog interaction from a Chrome extension content script is **not possible** — this requires either:
  - AHK/AppleScript delegation (existing pattern in the project)
  - A native messaging host
  - User manually selecting files (semi-automated: extension clicks Plus → Attach, user picks files)
- **Recommendation**: For the first implementation, automate up to opening the file dialog (Plus → Attach click), then either:
  - Delegate to AHK for the file path input (Windows)
  - Show a toast telling the user to select the file manually (fallback)

---

## 6. Save Button — Explicit Save Flow

### Current behavior
- No visible Save button in some editing flows (projects, scripts).
- Changes may auto-save or not save at all — confusing.

### Required behavior
- Every editing view (Projects edit, Scripts edit) must have a clearly visible **Save** button.
- Save button should show a loading state while persisting.
- Show a success toast after save completes.
- Unsaved changes should be visually indicated (e.g., "Unsaved changes" badge or dirty-state styling).

---

## Execution Plan (Task List)

### Phase 1: Critical Fixes
1. **Fix project name display and version badge** — ensure name is visible/editable, hide empty version badge
2. **Fix syntax highlighter rendering bug** — investigate and fix the mismatch between displayed and actual code
3. **Add explicit Save button** to project and script editing flows

### Phase 2: Scripts Section Redesign
4. **Redesign Scripts section to match Projects** — card-based list, New/Edit flows, named bundles
5. **Implement ScriptBundle CRUD handlers** in background storage (save/get/delete bundles)
6. **Create shared JS+JSON file manager component** reusable in both Projects and Scripts
7. **Support multi-file drag-and-drop** for JS + JSON files with proper persistence

### Phase 3: Macro Controller UI Polish
8. **Add button row padding and centering** in macro-looping.js
9. **Improve button click animation** with color slide effect

### Phase 4: Auto-Attach Feature
10. **Create auto-attach config schema** and JSON file structure
11. **Implement Auto Attach UI** in macro controller dropdown
12. **Implement attach workflow automation** (Plus → Attach click sequence)
13. **Add AHK delegation** for OS file dialog interaction (Windows)
14. **Add prompt injection** after file attachment completes
15. **Add Load Test Scripts button** as entry point

### Phase 5: Editor IntelliSense Enhancement
16. **Add JS IntelliSense** — DOM/Browser/Chrome API type definitions + snippet completions ✅

---

## Done Checklist

- [x] Spec created
- [ ] Project name/version display fixed
- [ ] Syntax highlighter rendering fixed
- [ ] Save button added to all edit flows
- [ ] Scripts section redesigned to match Projects
- [ ] ScriptBundle CRUD handlers implemented
- [ ] Shared JS+JSON component created
- [ ] Multi-file drag-and-drop working
- [x] Button spacing and centering applied
- [x] Button animation improved
- [x] Auto-attach config schema defined
- [x] Auto Attach UI in macro controller
- [x] Attach workflow automation working
- [ ] AHK delegation for file dialog (requires AHK-side handler for AUTO_ATTACH_FILE: clipboard signal)
- [ ] Prompt auto-injection after attach (implemented — needs end-to-end testing)
- [x] Load Test Scripts button added (via Auto Attach groups in ☰ menu)
- [x] Auto-suggestions/IntelliSense in editor
