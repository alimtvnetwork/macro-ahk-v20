# Memory: features/macro-controller/dialog-interaction-policy
Updated: 2026-03-26

**CRITICAL NON-REGRESSION RULE**: The project dialog (opened via PROJECT_BUTTON_XPATH click) MUST NEVER be opened automatically when the loop is stopped (`state.running === false`). Dialog interaction is ONLY permitted in these cases:

1. **Loop is running** — `runCycle()` and `refreshStatus()` may open the dialog for credit checks
2. **User clicks Check button** — `runCheck()` explicitly opens the dialog
3. **User clicks Credits button** — triggers API fetch (no dialog needed)
4. **User manually invokes via console** — explicit API calls

`refreshStatus()` when loop is stopped ONLY performs passive checks: reading workspace name from the nav element and updating UI. See: `spec/17-app-issues/82-project-dialog-auto-click-when-stopped.md`
