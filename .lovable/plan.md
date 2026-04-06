
# Task Plan

## Task 1: Logging Audit — Script Load Lifecycle
**Goal**: Audit the current state of all logging across the script injection/loading pipeline.  
**Scope**: 
- Injection pipeline logs (content scripts, script injection lifecycle)
- Console.log output in macro controller during script execution
- SQLite + OPFS session logging system  
**Deliverable**: Status report — what's done, what's pending, what's broken.  
**Approach**: Review relevant source files (`src/background/`, `src/content-scripts/`, macro controller logging modules) and cross-reference with logging specs.

---

## Task 2: Run Script Flow Diagram
**Goal**: Create a new Mermaid diagram showing what happens when the user clicks "Run Script".  
**Scope**: End-to-end flow from button click → message passing → script execution → result/logging.  
**Deliverable**: 
- `.mmd` Mermaid file in `/mnt/documents/`
- Exported PNG image of the diagram  
**Approach**: Trace the flow through popup/options UI → background service worker → content script → page execution.

---

## Task 3: v1.72.3 vs Current Code — Comparison Audit
**Goal**: Identify what changed between `v1.72.3-working-code/` and the current codebase, and why the current version may be broken.  
**Scope**: 
- `chrome-extension/` folder comparison
- `src/` folder comparison  
- `standalone-scripts/` comparison  
**Deliverable**: Detailed audit report in `/mnt/documents/` covering:
- Files added/removed/modified
- Key logic changes per file
- Likely breaking changes identified
- Recommended fixes  
**Approach**: Phase-by-phase diff using `diff -rq` for structure, then targeted file diffs for logic changes.

---

## Execution Order
Tasks will be executed **one at a time** as you say "next". I'll wait for your go-ahead before starting each task.
