# 05 — Issues Tracking

**Sequence:** 05  
**Name:** Issues Tracking

---

## Prompt Text

### Original input (verbatim)

update spec properly so that the mistake doesn't appear and update memory and also write the details how you fixed it, and every time we fix it, add to do /spec/02-app/issues/01-{issue slug name}.md explain the issue first, then root cause analysis, how you fixed and how not to repeat it again, and if iterations required, then write all the iterations And put all the spec files in 01-app Keep it in your memory to update all the time so that mistakes don't happen this is the most important part the many times i have remind the mistakes make sure to update in the

---

### Proofread prompt

Do not implement any code changes. Update specifications and documentation only. Enforce a strict workflow so the same mistakes do not repeat, and ensure every fix is recorded in a standardized issue write-up file and reflected in memory.

### Objectives

1. Update the relevant spec files so the mistake cannot happen again.
2. Update memory documentation to record the mistake, the fix, and the prevention rule.
3. Every time a fix is made, create a dedicated issue documentation file under the required path.
4. Consolidate all application spec files under a single folder.

### Required folder structure

1. All application spec files must be located under:
   1. /spec/10-macro-controller/

2. All issue write-ups must be located under:
   1. /spec/02-app/issues/
   2. File naming format: 01-{issueSlugName}.md

### issueSlugName rules

1. lowercase only
2. hyphen-separated
3. short, descriptive, and stable
4. no spaces or special characters

### Issue write-up file requirements

Create an issue file at:

/spec/02-app/issues/01-{issueSlugName}.md

The file must include these sections in this exact order.

#### Issue summary

1. What happened
2. Where it happened (feature or module plus file paths)
3. Symptoms and impact
4. How it was discovered

#### Root cause analysis

1. Direct cause
2. Contributing factors
3. Triggering conditions
4. Why the existing spec did not prevent it

#### Fix description

1. What was changed in the spec (no code)
2. The new rules or constraints added
3. Why the fix resolves the root cause
4. Any config changes or defaults affected
5. Any logging or diagnostics required

#### Iterations history

Include this section only if multiple attempts occurred.

1. Iteration 1: what was tried and why it failed
2. Iteration 2: what was tried and why it failed
3. Continue until final resolution

#### Prevention and non-regression

1. The prevention rule that stops recurrence
2. Acceptance criteria or test scenarios that detect regression early
3. Any guardrails or linting policies required
4. References to the exact spec sections updated (by file path)

#### TODO and follow-ups

1. Any remaining tasks
2. Owners or roles if applicable

#### Done checklist

1. [ ] Spec updated under /spec/10-macro-controller/
2. [ ] Issue write-up created under /spec/02-app/issues/
3. [ ] Memory updated with summary and prevention rule
4. [ ] Acceptance criteria updated or added
5. [ ] Iterations recorded if applicable

### Spec update requirements

1. Update the relevant spec file(s) under /spec/10-macro-controller/ to include:
   1. Corrected behavior
   2. Explicit constraints to prevent the old mistake
   3. Failure modes and debugging guidance
   4. Acceptance criteria updates that make regression testable

2. Add a Known pitfalls and prevention section that references the issue file path.

### Memory update requirements

1. Maintain a memory record that is updated every time a fix is made, including:
   1. Short description of the mistake
   2. Prevention rule
   3. Reference to the issue write-up file path

2. Memory update is mandatory. If memory is not updated, the fix is incomplete.

### Output requirements

Return the following, in this order:

1. A concise process checklist to follow after every fix.
2. A copy-paste template for /spec/02-app/issues/01-{issueSlugName}.md
3. A brief note stating all specs live under /spec/10-macro-controller/

Formatting rule: ensure there is a blank line after every Markdown header.
