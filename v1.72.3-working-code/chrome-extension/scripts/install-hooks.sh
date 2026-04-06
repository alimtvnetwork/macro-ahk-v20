#!/usr/bin/env bash
# Installs the pre-commit hook for chrome-extension linting.
set -euo pipefail

HOOK_SRC="chrome-extension/scripts/pre-commit"
HOOK_DST=".git/hooks/pre-commit"

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"

echo "✅ Pre-commit hook installed at $HOOK_DST"
