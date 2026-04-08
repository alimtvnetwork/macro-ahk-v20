#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# Marco Extension — Download & Install Helper
#
# Usage:
#   curl -fsSL https://github.com/<OWNER>/<REPO>/releases/latest/download/install-extension.sh | bash
#   — or —
#   ./install-extension.sh [--version v2.112.0] [--dir ~/marco-extension/v2.112.0]
#
# Default install directory:
#   $HOME/marco-extension/<version>/
#
# What it does:
#   1. Detects the latest release (or uses --version)
#   2. Downloads the marco-extension-<version>.zip
#   3. Extracts to <dir>/<version>/ (versioned subdirectory)
#   4. Writes a VERSION marker file
#   5. Prints instructions to load as unpacked extension
# ──────────────────────────────────────────────────────────────

set -euo pipefail

# ── Defaults ──
REPO="riseup-asia/macro-ahk"
INSTALL_DIR=""
VERSION=""

# ── Parse args ──
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v) VERSION="$2"; shift 2 ;;
    --dir|-d)     INSTALL_DIR="$2"; shift 2 ;;
    --repo|-r)    REPO="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: install-extension.sh [--version vX.Y.Z] [--dir PATH] [--repo owner/repo]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Resolve version ──
if [ -z "$VERSION" ]; then
  echo "[INFO] Detecting latest release..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
  if [ -z "$VERSION" ]; then
    echo "[FAIL] Could not detect latest version. Use --version to specify."
    exit 1
  fi
fi

# ── Resolve install directory (default: $HOME/marco-extension/<version>) ──
if [ -z "$INSTALL_DIR" ]; then
  INSTALL_DIR="${HOME}/marco-extension/${VERSION}"
fi

echo ""
echo "[OK] Marco Extension ${VERSION}"
echo "     Repository : ${REPO}"
echo "     Install to : ${INSTALL_DIR}"
echo ""

# ── Download ──
ZIP_NAME="marco-extension-${VERSION}.zip"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${VERSION}/${ZIP_NAME}"
TMP_ZIP=$(mktemp /tmp/marco-extension-XXXXXX.zip)

echo "[INFO] Downloading ${ZIP_NAME}..."
if ! curl -fSL -o "$TMP_ZIP" "$DOWNLOAD_URL"; then
  echo "[FAIL] Download failed. Check version and repo."
  echo "       URL: ${DOWNLOAD_URL}"
  rm -f "$TMP_ZIP"
  exit 1
fi

# ── Extract ──
echo "[INFO] Extracting to ${INSTALL_DIR}..."
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
unzip -qo "$TMP_ZIP" -d "$INSTALL_DIR"
rm -f "$TMP_ZIP"

# ── Write version marker ──
echo "$VERSION" > "${INSTALL_DIR}/VERSION"

# ── Done ──
echo ""
echo "[OK] Marco Extension ${VERSION} installed to:"
echo "     ${INSTALL_DIR}"
echo ""
echo "------------------------------------------------------------"
echo "  To load in Chrome / Edge / Brave:"
echo ""
echo "  1. Open chrome://extensions (or edge://extensions)"
echo "  2. Enable 'Developer mode' (toggle in top-right)"
echo "  3. Click 'Load unpacked'"
echo "  4. Select: ${INSTALL_DIR}"
echo "------------------------------------------------------------"
echo ""
echo "  To update later, re-run this script -- it replaces the folder."
echo ""
echo "  Example with custom directory:"
echo "    ./install-extension.sh --dir ~/marco-extension/${VERSION}"
