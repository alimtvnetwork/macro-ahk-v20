# 04 — Unified AI Prompt — v4

**Sequence:** 04  
**Name:** Unified AI Prompt — v4

---

## Prompt Text

# Unified AI Prompt — v4

The following prompt merges all provided materials while preserving original wording and structured proofread instructions. It is organized into three clearly separated parts plus global rules and execution controls.

---

## Part 1 — Repository Analysis, Memory Reconstruction, and Implementation Readiness

### Original input (verbatim)

Can you please read the lovable memories, uh, folder, and expect the specification to redraw the old memory and try to understand the project requirements, and also just go over all the projects, and then I will give you the task, and just ask me what task that you should implement, because the specifications is there. So let's start implementing the specification. And before that, I want you to view the specification and tell me, if I give it to any AI, what are the failing chances? And create a detailed report first. Do you understand? Do you have any question, concern? Let me know.

Read what is done and what is pending in plan files (.lovable\memory\workflow), and always create files as 01-name-of-the-file.md and try to keep the folder to have smaller number of files, for plans and suggestions (.lovable/memory/suggestions) try to keep in one file and update in one file for tracking, update your memory accordingly now.

For all the suggestions that every time that Lovable has, try to write it in the .lovable, uh, memory/suggestions, and modify and remove when the suggestions are completed. And also, uh, make a plan.md file where all the things which should be done in the future, plan it, so that I could train it to another AI model.

Any changes to the code always bump at least minor version everywhere other than .release folder, keep out of reach and don't modify this

Do you have any question and concern? Uh, can you please write these, uh, memories and, um, histories, please?

### Proofread prompt

Read and synthesize existing repository context from the Lovable memory folder and the full specification set, then produce a reliability risk report before any implementation work begins. Do not implement anything. Only produce a report and specification-side artifacts for memory, suggestions, and planning.

### Mandatory pre-analysis steps

Before producing any report or analysis, the AI must:

1. **Scan the entire repository tree at the directory level** to understand project boundaries, folder structure, and dependencies. Do not read contents inside folders marked skipped, ignored, deprecated, generated, archived, or otherwise excluded.
2. **Read workflow memory** — specifically `.lovable/memory/workflow/01-plan.md` — to understand what has been done and what is pending. This avoids repeated work.
3. **Read all relevant memory files** under `.lovable/memory/`, including workflow, suggestions, rules, decisions, history, issue references, and any protocol or process files present.

### Goals

1. Reconstruct project requirements by reading:
   1. the .lovable memory content
   2. the existing spec files and idea files across all projects

2. Produce a detailed risk and failure-chance report for handing the current specs to another AI.

3. Establish a disciplined workflow for Lovable suggestions tracking and future planning so another AI can continue work reliably.

### Inputs to read

1. .lovable/
   1. memories/
   2. memory/
   3. memory/suggestions/
   4. any other Lovable state folders present
   5. What todo and what not to do remember.
   6. Folders marked skipped, ignored, deprecated, generated, or archived must not be read or modified — they may be listed structurally but their contents must not be opened.

2. Spec folder content for all projects:
   1. ideas
   2. backend and frontend specs
   3. specs
   4. instruction builder specs
   5. seeding and configuration specs
   6. data model specs
   7. acceptance criteria specs
   8. Read root `spec/` folder or get a general idea of files.

### Deliverable 1: Reliability and failure-chance report

Produce a report that includes:

1. **Success probability estimates**
   1. by module complexity tier (simple, medium, complex agentic workflows, end-to-end)
   2. explicit assumptions behind each estimate

2. **Failure map**
   1. where failures are likely (module and workflow)
   2. why failures occur (missing constraints, ambiguity, cross-file inconsistency)
   3. how failures would manifest (symptoms)

3. **Corrective actions**
   1. prioritized list of spec fixes to reduce failure chance
   2. for each fix: what to change, where to change it, and the expected reliability gain

4. **Readiness decision**
   1. classify each major area as:
      - ready
      - ready with assumptions
      - blocked by ambiguity
      - blocked by contradiction
      - blocked by missing acceptance criteria
   2. state what must be fixed before implementation
   3. state what can be deferred safely

### Deliverable 2: Lovable suggestions workflow (filesystem contract)

All suggestions must be tracked in a single file:

`.lovable/memory/suggestions/01-suggestions.md`

If the file grows beyond manageable size (50+ items), suggestions may be split per project.

**Suggestion entry fields:**

- suggestionId
- createdAt
- source (Lovable)
- affectedProject
- description
- rationale
- proposed change
- acceptance criteria
- status (open, inProgress, done)
- completion notes

**Completion handling** — When a suggestion is completed, update its status to done. Optionally move completed items to `completed/` subfolder.

### Deliverable 3: plan.md future work roadmap

`.lovable/memory/workflow/01-plan.md` is the **canonical workflow tracker**.

Root `plan.md` (if created) is a **summarized AI handoff roadmap** only. It must not contradict the canonical plan.

**plan.md requirements:**

1. A prioritized backlog of tasks
2. Grouping by phase and by project
3. For each task:
   - objective
   - dependencies
   - expected outputs (spec updates, UI changes, API changes)
   - acceptance criteria
4. A section titled **Next task selection** where the next implementable items are listed so I can pick what to implement next.

### Required Part 1 artifacts

After analysis, update or create:

- `.lovable/memory/workflow/01-plan.md`
- `.lovable/memory/suggestions/01-suggestions.md`
- `.lovable/memory/history/01-decisions.md` — create the `history/` folder if it does not exist
- `.lovable/memory/01-working-rules.md` — if new rules or constraints are discovered
- Root `plan.md` — only if a handoff roadmap is needed
- Update memory issue references if analysis uncovers prior unresolved issue patterns

### Interaction rule

After producing the report and creating the memory and plan artifacts, ask which specific task should be implemented next since the specs define what to build.

---

## Part 2 — Specification Fix Workflow and Issue Documentation

### Original input (verbatim)

update spec properly so that the mistake doesn't appear and update memory and also write the details how you fixed it, and every time we fix it, add to do /spec/02-app/issues/01-{issue slug name}.md explain the issue first, then root cause analysis, how you fixed and how not to repeat it again, and if iterations required, then write all the iterations And put all the spec files in 01-app Keep it in your memory to update all the time so that mistakes don't happen this is the most important part the many times i have remind the mistakes make sure to update in the

### Objectives

1. Update the relevant spec files so the mistake cannot happen again.
2. Update memory documentation to record the mistake, the fix, and the prevention rule.
3. Every time a fix is made, create a dedicated issue documentation file under the required path.
4. Consolidate all application spec files under a single folder.

### Required folder structure

- All application spec files: `/spec/10-macro-controller/`
- All issue write-ups: `/spec/02-app/issues/`
- File naming format: `{seq}-{issueSlugName}.md` (sequential numbering: 01, 02, 03…)

### issueSlugName rules

- lowercase only
- hyphen-separated
- short, descriptive, and stable
- no spaces or special characters

### Issue numbering

Issues use **sequential numbering** across the entire issues folder. Before creating a new issue, check the highest existing sequence number and increment by one.

Examples:

```
/spec/02-app/issues/01-auth-timeout.md
/spec/02-app/issues/02-cache-race-condition.md
/spec/02-app/issues/03-missing-default-config.md
```

### Issue write-up file requirements

Create an issue file at `/spec/02-app/issues/{seq}-{issueSlugName}.md`

The file must include these sections in this exact order:

**Issue summary**

1. What happened
2. Where it happened (feature or module plus file paths)
3. Symptoms and impact
4. How it was discovered

**Root cause analysis**

1. Direct cause
2. Contributing factors
3. Triggering conditions
4. Why the existing spec did not prevent it

**Fix description**

1. What was changed in the spec (no code)
2. The new rules or constraints added
3. Why the fix resolves the root cause
4. Any config changes or defaults affected
5. Any logging or diagnostics required

**Iterations history** (only if multiple attempts occurred)

1. Iteration 1: what was tried and why it failed
2. Iteration 2: what was tried and why it failed
3. Continue until final resolution

**Prevention and non-regression**

1. The prevention rule that stops recurrence
2. Acceptance criteria or test scenarios that detect regression early
3. Any guardrails or linting policies required
4. References to the exact spec sections updated (by file path)
5. Regression prevention rule (explicit, testable)

**TODO and follow-ups**

1. Any remaining tasks
2. Owners or roles if applicable

**Done checklist**

- [ ] Spec updated under /spec/10-macro-controller/
- [ ] Issue write-up created under /spec/02-app/issues/
- [ ] Memory updated with summary and prevention rule
- [ ] Acceptance criteria updated or added
- [ ] Iterations recorded if applicable
- [ ] Plan status updated in workflow tracker

### Spec update requirements

Update the relevant spec files under /spec/10-macro-controller/ to include:

1. Corrected behavior
2. Explicit constraints to prevent the old mistake
3. Failure modes and debugging guidance
4. Acceptance criteria updates that make regression testable
5. A **Known pitfalls and prevention** section that references the issue file path.

### Memory update requirements

Maintain a memory record that is updated every time a fix is made including:

1. Short description of the mistake
2. Prevention rule
3. Reference to the issue write-up file path

**Memory update is mandatory. If memory is not updated the fix is incomplete.**

### Decision logging

All important decisions must be written to `.lovable/memory/history/01-decisions.md`. If the `history/` folder does not exist, create it and use this file as the canonical decision log.

Required entries include:

- Architecture changes
- Spec interpretation decisions
- Rejected approaches and why
- Trade-off resolutions

This dramatically improves multi-AI handoff reliability.

### Output requirements

Return the following in this order:

1. A concise process checklist to follow after every fix.
2. A copy-paste template for `/spec/02-app/issues/{seq}-{issueSlugName}.md`
3. A brief note stating all specs live under `/spec/10-macro-controller/`

**Formatting rule:** ensure there is a blank line after every Markdown header.

---

## Part 3 — Unit Test Failure Investigation and Documentation

### Original input (verbatim)

Fix these and when fixing failing tests: 1. check code, 2. Method code actual one, 3. Logical implementation of the test, 4. Check Testcase, 5. Logically fix it either actual or the test depending on the logical discussion and write it.

### Unit Test Failure Logic

When fixing failing tests follow this investigation process:

1. **Check code** — read the production code under test.
2. **Method code actual implementation** — understand what the method actually does.
3. **Logical implementation of the test** — read the test and understand what it asserts.
4. **Check the testcase logic** — verify whether the test expectation is logically correct, including fixtures, mocks, seed data, and expected outputs.
5. **Decide** — fix either the implementation or the test depending on which is logically wrong.

### Documentation requirement for failing tests

Every failing test resolution must be documented at:

`/spec/05-failing-tests/{seq}-failing-test-name.md`

The markdown report must include:

1. Root cause analysis
2. Solution description
3. Explanation of whether the issue was caused by incorrect implementation or incorrect test logic
4. Any corrections made to test logic or implementation logic
5. Prevention guidance so similar failures do not occur again
6. **Reference to the relevant spec section** that governs the expected behavior

---

## Specification Authority

The specification is the source of truth for system behavior.

**Priority order (highest to lowest):**

1. Specification files under `/spec/10-macro-controller/`
2. Issue corrections under `/spec/02-app/issues/`
3. Failing test documentation under `/spec/05-failing-tests/`
4. Memory and decision logs
5. Existing implementation code

If implementation contradicts the specification, the specification takes precedence unless the spec is proven incorrect. If the spec is proven incorrect, document the correction as an issue before changing the spec.

---

## Required Execution Order

The AI must follow this sequence strictly. Steps must not be skipped or reordered.

1. Scan the entire repository tree.
2. Read Lovable memory folders.
3. Read workflow tracker `.lovable/memory/workflow/01-plan.md`.
4. Read specification folders.
5. Reconstruct project context.
6. Produce the reliability and failure-chance report.
7. Propose spec corrections if required.
8. Update memory artifacts.
9. Update workflow plan.
10. Ask the user which task to implement next.

The AI must not skip steps in this sequence.

---

## Context Preservation

After any significant analysis, correction, or decision:

The AI must summarize the key conclusions into Lovable memory files.

This prevents context loss across long sessions or across different AI models.

Summaries must include:

- What was learned
- What was decided
- What constraints now exist
- What must not be repeated

**If the AI does not persist conclusions to memory, the work is considered incomplete.**

---

## Task Selection Protocol

When asking for the next task, the AI must present:

1. The **top 3 next implementable tasks** from the plan
2. Their **dependencies** (what must be done first)
3. Their **estimated complexity** (simple / medium / complex)
4. The **spec files involved**

Then ask the user to select the task number.

---

## Blocker Handling

If a blocker prevents reliable implementation or specification updates, the AI must:

1. Record the blocker in `.lovable/memory/workflow/01-plan.md`
2. Document the blocker in the relevant spec or issue file
3. Explain the minimum information or change required to unblock progress
4. Avoid guessing past the blocker

The AI must not silently work around blockers. Blockers must be surfaced to the user.

---

## Allowed Actions Before Implementation

Analysis, reporting, memory updates, planning, spec corrections, issue documentation, and test diagnosis documentation are allowed before implementation.

Application code changes are **not allowed** until the user explicitly selects a task and authorizes implementation.

---

## Global Rules (apply to all parts)

### Spec before code

Always write or update specs before any implementation. Never implement until the user explicitly says to start a specific phase or task.

### Ambiguity handling

If the specification is ambiguous, the AI must **document the ambiguity** in the relevant spec file and in `.lovable/memory/history/01-decisions.md` before implementing a solution. Do not silently resolve ambiguity.

### Repository scan requirement

Before implementation analysis, the AI must scan the entire repository tree at the directory level to understand project boundaries and dependencies. Do not read contents inside folders marked excluded. Reading only the spec folder is insufficient.

### Skipped folders

Folders marked skipped, ignored, deprecated, generated, or archived must not be read or modified. They may be listed structurally but their contents must not be opened. This overrides any other instruction.

### Code style (GitMap enforced)

- All `if` conditions must be **positive** (no `!`, no negation).
- Functions: **8–15 lines**.
- Files: **100–200 lines max**.
- Small, focused packages — one responsibility per package.

### Version bumping

Any changes to code must bump at least the minor version. The `.release` folder is off-limits — do not read, modify, or reference it.

### File naming

- Use stable canonical filenames such as `01-plan.md`, `01-suggestions.md`, and `01-decisions.md` for singleton tracker files.
- Use `{seq}-{slug}.md` for repeating records such as issues and failing test write-ups.
- Keep folder file counts small.
- Plans and suggestions are tracked in single files and updated in place unless explicitly split by scale.

### Regression prevention

Every fix — whether to specs, code, or tests — must include an explicit, testable regression prevention rule. This applies globally across all three parts.

### Definition of Done

A task is considered done only when:

1. Spec updated (if applicable)
2. Issue documented (if applicable)
3. Memory updated
4. Acceptance criteria added or verified
5. Plan status updated in `.lovable/memory/workflow/01-plan.md`
6. Decision log updated (if a decision was made)

---

## Final Instruction

Implementation must not begin until readiness analysis and specification validation are completed and the user explicitly selects the next task.

Use:
1. **Required Execution Order** for sequencing
2. **Specification Authority** for conflict resolution
3. **Context Preservation** for memory persistence
4. **Blocker Handling** for unresolved situations
