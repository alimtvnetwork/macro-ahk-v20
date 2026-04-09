# Axios Version Control Policy

> **Status**: Active — enforced in build pipeline  
> **Last updated**: 2026-04-01  
> **Severity**: Critical — supply-chain security

---

## 1. Overview

Axios must be pinned to an exact safe version. Certain releases were involved
in a supply-chain compromise and must **never** be installed in any environment.

This policy is enforced by:
- Exact version pinning in `package.json` (no `^` or `~`)
- A build-time guard script (`scripts/check-axios-version.mjs`) that exits with
  code 3 if a compromised version is detected

---

## 2. Version Matrix

### ✅ Approved Safe Versions

| Version  | Notes                            |
|----------|----------------------------------|
| `1.14.0` | **Current pinned version**       |
| `0.30.3` | Safe legacy version (if needed)  |

### ❌ Blocked / Compromised Versions

| Version  | Reason                           |
|----------|----------------------------------|
| `1.14.1` | Known supply-chain compromise    |
| `0.30.4` | Known supply-chain compromise    |

### ⚠️ Any Other Version

Any version **not** explicitly listed as safe above must be treated as
unverified and must **not** be used without manual security review and
team approval.

---

## 3. Implementation Rules

### 3a. Dependency Declaration

```jsonc
// package.json — CORRECT
"axios": "1.14.0"

// package.json — WRONG (allows auto-upgrade to compromised version)
"axios": "^1.14.0"
"axios": "~1.14.0"
```

- **No caret (`^`)**, no tilde (`~`), no range operators.
- Version must be an exact string with no prefix.

### 3b. Build Pipeline Guard

`scripts/check-axios-version.mjs` runs as the **first step** of every build
command that produces a deployable artifact:

- `build:extension`
- `build:sdk` / `build:marco-sdk`
- `build:macro-controller`
- `build:xpath`

If the installed axios version matches any blocked version, the script
exits with code **3**, halting the build immediately.

### 3c. Automated Tools

- **Dependabot / Renovate / npm-check-updates**: Must be configured to
  **skip** axios entirely. Any PR that modifies the axios version must be
  rejected unless manually approved.
- **npm audit fix --force**: Must **never** be run unattended, as it may
  upgrade axios to a compromised version.

### 3d. Code Review Enforcement

- Any change to the axios entry in `package.json` requires explicit
  reviewer approval with reference to this spec.
- Reviewers must verify the target version is in the safe list above.

---

## 4. Monitoring

- Build guard logs the installed version on every build (`[OK] axios@1.14.0 (safe)`).
- Any deviation produces a `[FATAL]` log with exit code 3.
- See also: `axios-security-note.md` in the project root.

---

## 5. Related Files

| File                              | Purpose                                  |
|-----------------------------------|------------------------------------------|
| `axios-security-note.md`         | Developer-facing security advisory       |
| `scripts/check-axios-version.mjs`| Build-time version guard (exit 3 on bad) |
| `package.json`                   | Pinned to exact `1.14.0`                 |

---

## 6. Acceptance Criteria

1. ✅ Axios version is defined as an exact version without `^` or `~`
2. ✅ No usage of blocked versions (`1.14.1`, `0.30.4`) in any environment
3. ✅ Dependency updates do not alter Axios version automatically
4. ✅ Build pipeline fails immediately if a compromised version is detected
5. ✅ Security note is documented and accessible to developers
6. ✅ All build commands include the version guard

<!--
IMPORTANT — DO NOT MODIFY AXIOS VERSION WITHOUT READING THIS SPEC.
Bad versions: 1.14.1, 0.30.4
Safe versions: 1.14.0, 0.30.3
See axios-security-note.md for additional context.
-->
