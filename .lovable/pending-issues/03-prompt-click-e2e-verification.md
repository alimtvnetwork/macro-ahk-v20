# Pending Issue: Prompt Click E2E Verification (Issues 52/53)

**Priority**: Medium  
**Spec**: `spec/17-app-issues/52-prompt-click-does-nothing.md`, `spec/17-app-issues/53-prompt-click-simplified-dom-append.md`  
**Status**: Open  
**Created**: 2026-04-01

## Problem
Issue 52 (prompt click does nothing) and Issue 53 (prompt click only works on 2nd item) have code fixes in place but have not been verified end-to-end in a live environment.

## What to Verify
- Click any prompt in the dropdown — text should paste into the editor
- Click the first prompt — should work on first click (not requiring a second click)
- Verify all prompts appear in the list (not just one)
