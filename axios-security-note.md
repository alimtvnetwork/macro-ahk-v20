# ⚠️ Axios Version — Security Notice

**DO NOT UPDATE AXIOS** without reading this first.

## Pinned Version

This project pins `axios` to **exactly `1.14.0`** (no caret, no tilde).

## Known Compromised Versions

The following versions were involved in a supply-chain compromise and **must never be used**:

| Version   | Status        |
|-----------|---------------|
| `1.14.1`  | ❌ COMPROMISED |
| `0.30.4`  | ❌ COMPROMISED |

## Safe Versions (for reference)

| Version   | Status |
|-----------|--------|
| `1.14.0`  | ✅ SAFE |
| `0.30.3`  | ✅ SAFE |

## Rules

1. **Never** use `^` or `~` prefix for axios in `package.json` — exact pin only.
2. **Never** upgrade to `1.14.1` or `0.30.4`.
3. Before any future axios update, verify the release is legitimate and not compromised.
