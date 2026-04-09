# Memory: security/axios-version-control
Updated: 2026-04-01

Axios is pinned to exact version `1.14.0` in package.json (no `^` or `~`). Versions `1.14.1` and `0.30.4` are known-compromised supply-chain attacks and must never be used. Safe versions are `1.14.0` and `0.30.3`. A build guard (`scripts/check-axios-version.mjs`) runs as the first step of `build:extension`, `build:sdk`, `build:macro-controller`, and `build:xpath` — it exits with code 3 if a bad version is detected. Full policy spec at `spec/07-data-and-api/axios-version-control.md`. Developer advisory at `axios-security-note.md`. Never allow automated tools (Dependabot, npm audit fix) to upgrade axios without manual verification.
