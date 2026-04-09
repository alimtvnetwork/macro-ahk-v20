# Issue NN: {Title}

**Version**: vX.Y.Z
**Date**: YYYY-MM-DD
**Status**: Resolved | Open | In Progress

---

## Issue Summary

### What happened

{Brief description of the bug or incorrect behavior.}

### Where it happened

- **Feature**: {Feature or module name}
- **Files**: {File paths}
- **Functions**: {Function names if applicable}

### Symptoms and impact

{What the user saw. What broke. How severe.}

### How it was discovered

{User report, automated test, code review, etc.}

---

## Root Cause Analysis

### Direct cause

{The specific code/logic flaw.}

### Contributing factors

1. {Factor 1}
2. {Factor 2}

### Triggering conditions

{When/how the bug manifests.}

### Why the existing spec did not prevent it

{What was missing from the spec that allowed this.}

---

## Fix Description

### What was changed in the spec

{Spec file changes — no code.}

### The new rules or constraints added

{Explicit rules added to prevent recurrence.}

### Why the fix resolves the root cause

{Logical explanation.}

### Config changes or defaults affected

{Or "None."}

### Logging or diagnostics required

{New log messages or debug output added.}

---

## Iterations History

{Include only if multiple attempts occurred.}

**Iteration 1**: {What was tried and why it failed.}

**Iteration 2**: {What was tried and outcome.}

---

## Prevention and Non-Regression

### Prevention rule

> **RULE**: {One-sentence rule that prevents this from ever happening again.}

### Acceptance criteria / test scenarios

1. {Scenario 1}
2. {Scenario 2}

### Guardrails

{Linting, validation, or structural checks.}

### References to spec sections updated

- {File path} — "{Section name}"

---

## TODO and Follow-Ups

1. [ ] {Remaining task}

---

## Done Checklist

- [ ] Spec updated under `/spec/10-macro-controller/`
- [ ] Issue write-up created under `/spec/17-app-issues/`
- [ ] Memory updated with summary and prevention rule
- [ ] Acceptance criteria updated or added
- [ ] Iterations recorded if applicable
