# Check Button Runtime Sync Rule

The extension runtime executes the seeded standalone script:

- `standalone-scripts/macro-controller/01-macro-looping.js`

Even when Check-button fixes are implemented in TypeScript source modules:

- `standalone-scripts/macro-controller/src/loop-engine.ts`
- `standalone-scripts/macro-controller/src/workspace-detection.ts`

they do **not** reach runtime until the standalone bundle is rebuilt.

## Mandatory step after Check-flow edits

Run:

```bash
npm run build:macro-controller
```

This regenerates and syncs `01-macro-looping.js` from `dist/macro-looping.js`.

## Related docs

- `spec/11-chrome-extension/60-check-button-spec.md`
- `spec/17-app-issues/check-button/10-runtime-seed-drift.md`