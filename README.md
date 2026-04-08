# Marco Chrome Extension

Browser automation for workspace and credit management.

## Quick Install

### Windows (PowerShell)

**One-liner (latest version):**

```powershell
irm https://github.com/riseup-asia/macro-ahk/releases/latest/download/install-extension.ps1 | iex
```

**Custom directory:**

```powershell
.\install-extension.ps1 -InstallDir "D:\marco-extension\v2.112.0"
```

**Specific version:**

```powershell
.\install-extension.ps1 -Version v2.112.0 -InstallDir "D:\marco-extension\v2.112.0"
```

### Linux / macOS (Bash)

**One-liner (latest version):**

```bash
curl -fsSL https://github.com/riseup-asia/macro-ahk/releases/latest/download/install-extension.sh | bash
```

**Custom directory:**

```bash
./install-extension.sh --dir ~/marco-extension/v2.112.0
```

**Specific version:**

```bash
./install-extension.sh --version v2.112.0 --dir ~/marco-extension/v2.112.0
```

### Manual Install

1. Download `marco-extension-v{VERSION}.zip` from [Releases](https://github.com/riseup-asia/macro-ahk/releases)
2. Extract to a folder (e.g., `D:\marco-extension\v2.112.0`)
3. Open `chrome://extensions` (or `edge://extensions`)
4. Enable **Developer mode** (toggle in top-right)
5. Click **Load unpacked** and select the extracted folder

Works in Chrome, Edge, Brave, Arc, and other Chromium browsers.

## CI/CD Release Pipeline

Pushing to a `release/*` branch (e.g., `release/v2.113.0`) automatically:

1. Installs dependencies and runs the test suite
2. Builds standalone scripts (SDK, XPath, Macro Controller)
3. Builds the Chrome extension
4. Zips `chrome-extension/dist/` into `marco-extension-v{VERSION}.zip`
5. Creates a GitHub Release with all assets attached
6. Includes install scripts (`.ps1` and `.sh`) as release assets

No email or notification is sent — check the [Releases page](https://github.com/riseup-asia/macro-ahk/releases) for status.

## Development

```bash
pnpm install
pnpm run dev
```

Load the `chrome-extension/dist/` folder as an unpacked extension in `chrome://extensions` (Developer mode).

## Production Build

```bash
pnpm run build:sdk
pnpm run build:xpath
pnpm run build:macro-controller
pnpm run build:extension
```

## Project Structure

```
├── chrome-extension/       Chrome extension source + dist
├── standalone-scripts/     SDK, XPath, Macro Controller
│   ├── marco-sdk/
│   ├── xpath/
│   └── macro-controller/
├── scripts/                Build helpers & install scripts
│   ├── install-extension.ps1
│   └── install-extension.sh
├── spec/                   Specifications & developer guides
└── .github/workflows/      CI/CD pipelines
    └── release.yml
```
