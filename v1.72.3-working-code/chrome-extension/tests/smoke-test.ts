/**
 * Chrome Extension Smoke Test
 *
 * Validates the built extension by:
 *   1. Checking dist/ folder exists with required files
 *   2. Validating manifest.json structure and MV3 compliance
 *   3. Loading the extension in headless Chrome via Playwright
 *   4. Checking for console errors in the service worker and popup
 *
 * Usage:
 *   cd chrome-extension
 *   npm run build
 *   npx playwright test smoke-test.ts
 *
 * Requires: @playwright/test (devDependency)
 */

import { chromium, type BrowserContext } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DIST_DIR = path.resolve(__dirname, '..', 'dist');

interface ManifestJson {
  manifest_version: number;
  name: string;
  version: string;
  permissions: string[];
  host_permissions: string[];
  background: {
    service_worker: string;
    type: string;
  };
  action: {
    default_popup: string;
    default_icon: Record<string, string>;
  };
  options_page: string;
  icons: Record<string, string>;
  web_accessible_resources: Array<{
    resources: string[];
    matches: string[];
  }>;
  content_security_policy?: {
    extension_pages?: string;
  };
}

/* ------------------------------------------------------------------ */
/*  Step 1 — Validate dist/ structure                                 */
/* ------------------------------------------------------------------ */

function validateDistStructure(): void {
  console.log('\n🔍  Step 1: Validating dist/ structure...');

  const requiredFiles = [
    'manifest.json',
    'background/index.js',
    'popup/popup.html',
    'options/options.html',
  ];

  const missingFiles: string[] = [];

  for (const file of requiredFiles) {
    const fullPath = path.join(DIST_DIR, file);
    const isFilePresent = fs.existsSync(fullPath);

    if (!isFilePresent) {
      missingFiles.push(file);
    }
  }

  const hasMissingFiles = missingFiles.length > 0;

  if (hasMissingFiles) {
    throw new Error(
      `Missing required files in dist/:\n  - ${missingFiles.join('\n  - ')}`,
    );
  }

  console.log('  ✅ All required files present in dist/');
}

/* ------------------------------------------------------------------ */
/*  Step 2 — Validate manifest.json                                   */
/* ------------------------------------------------------------------ */

function validateManifest(): ManifestJson {
  console.log('\n🔍  Step 2: Validating manifest.json...');

  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  const rawContent = fs.readFileSync(manifestPath, 'utf-8');

  let manifest: ManifestJson;

  try {
    manifest = JSON.parse(rawContent) as ManifestJson;
  } catch (parseError) {
    const errorMessage = parseError instanceof Error
      ? parseError.message
      : String(parseError);

    throw new Error(`manifest.json is not valid JSON: ${errorMessage}`);
  }

  // MV3 check
  const isManifestV3 = manifest.manifest_version === 3;

  if (!isManifestV3) {
    throw new Error(
      `Expected manifest_version 3, got ${String(manifest.manifest_version)}`,
    );
  }

  // Required permissions
  const requiredPermissions = [
    'storage',
    'cookies',
    'scripting',
    'activeTab',
    'alarms',
    'webNavigation',
    'userScripts',
  ];

  const manifestPermissions = manifest.permissions ?? [];

  for (const permission of requiredPermissions) {
    const hasPermission = manifestPermissions.includes(permission);

    if (!hasPermission) {
      throw new Error(`Missing required permission: ${permission}`);
    }
  }

  // Service worker entry
  const hasServiceWorker =
    manifest.background?.service_worker !== undefined &&
    manifest.background.service_worker.length > 0;

  if (!hasServiceWorker) {
    throw new Error('manifest.background.service_worker is missing');
  }

  const serviceWorkerPath = path.join(
    DIST_DIR,
    manifest.background.service_worker,
  );
  const isServiceWorkerPresent = fs.existsSync(serviceWorkerPath);

  if (!isServiceWorkerPresent) {
    throw new Error(
      `Service worker file not found: ${manifest.background.service_worker}`,
    );
  }

  // Module type
  const isModuleType = manifest.background.type === 'module';

  if (!isModuleType) {
    throw new Error(
      `Expected background.type "module", got "${String(manifest.background.type)}"`,
    );
  }

  // CSP check for WebAssembly in MV3
  const extensionPagesCsp =
    manifest.content_security_policy?.extension_pages ?? '';
  const hasWasmUnsafeEval = /wasm-unsafe-eval/.test(extensionPagesCsp);

  if (!hasWasmUnsafeEval) {
    throw new Error(
      "Missing required CSP token 'wasm-unsafe-eval' in content_security_policy.extension_pages",
    );
  }

  // Phase 0 guard: 'unsafe-eval' is forbidden in MV3 extension_pages
  const hasForbiddenUnsafeEval = /(?<!'wasm-)'unsafe-eval'/.test(extensionPagesCsp);
  if (hasForbiddenUnsafeEval) {
    throw new Error(
      "BLOCKED: 'unsafe-eval' found in extension_pages CSP. " +
      "MV3 forbids this — Chrome will reject the extension at install time. " +
      "Use Blob URLs or chrome.userScripts instead of eval(). " +
      "See .lovable/memory/development/issue-mv3-csp-osano-regression-2026-03-19.md",
    );
  }

  // Popup exists
  const popupPath = path.join(DIST_DIR, manifest.action.default_popup);
  const isPopupPresent = fs.existsSync(popupPath);

  if (!isPopupPresent) {
    throw new Error(
      `Popup HTML not found: ${manifest.action.default_popup}`,
    );
  }

  // Options page exists
  const optionsPath = path.join(DIST_DIR, manifest.options_page);
  const isOptionsPresent = fs.existsSync(optionsPath);

  if (!isOptionsPresent) {
    throw new Error(
      `Options page not found: ${manifest.options_page}`,
    );
  }

  console.log('  ✅ manifest.json is valid MV3 with all required permissions');
  console.log(`     Name: ${manifest.name}`);
  console.log(`     Version: ${manifest.version}`);
  console.log(`     Permissions: ${manifestPermissions.join(', ')}`);

  return manifest;
}

/* ------------------------------------------------------------------ */
/*  Step 3 — Load extension in Chrome and check console               */
/* ------------------------------------------------------------------ */

async function loadExtensionAndCheck(): Promise<void> {
  console.log('\n🔍  Step 3: Loading extension in Chrome...');

  let context: BrowserContext | null = null;

  try {
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST_DIR}`,
        `--load-extension=${DIST_DIR}`,
        '--no-first-run',
        '--disable-gpu',
        '--disable-dev-shm-usage',
      ],
    });

    const consoleErrors: string[] = [];
    const consoleWarnings: string[] = [];

    // Get the extension ID from the service worker
    let extensionId = '';

    const serviceWorkers = context.serviceWorkers();
    const backgroundPages = context.backgroundPages();

    // Wait a moment for the service worker to initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const allWorkers = context.serviceWorkers();
    const hasWorkers = allWorkers.length > 0;

    if (hasWorkers) {
      const workerUrl = allWorkers[0].url();
      const idMatch = workerUrl.match(/chrome-extension:\/\/([a-z]+)\//);
      const hasIdMatch = idMatch !== null;

      if (hasIdMatch) {
        extensionId = idMatch[1];
        console.log(`  ✅ Extension loaded with ID: ${extensionId}`);
      }
    }

    const hasExtensionId = extensionId.length > 0;

    if (!hasExtensionId) {
      throw new Error(
        'Failed to detect extension ID. Service worker may not have started.',
      );
    }

    // Listen for service worker console messages
    for (const worker of context.serviceWorkers()) {
      worker.on('console', (msg) => {
        const msgType = msg.type();
        const isError = msgType === 'error';
        const isWarning = msgType === 'warning';

        if (isError) {
          consoleErrors.push(`[SW] ${msg.text()}`);
        }

        if (isWarning) {
          consoleWarnings.push(`[SW] ${msg.text()}`);
        }
      });
    }

    // Open the popup
    console.log('\n  📄 Opening popup...');
    const popupPage = await context.newPage();
    
    popupPage.on('console', (msg) => {
      const msgType = msg.type();
      const isError = msgType === 'error';
      const isWarning = msgType === 'warning';

      if (isError) {
        consoleErrors.push(`[Popup] ${msg.text()}`);
      }

      if (isWarning) {
        consoleWarnings.push(`[Popup] ${msg.text()}`);
      }
    });

    popupPage.on('pageerror', (error) => {
      consoleErrors.push(`[Popup:PageError] ${error.message}`);
    });

    await popupPage.goto(
      `chrome-extension://${extensionId}/popup/popup.html`,
    );
    await popupPage.waitForLoadState('domcontentloaded');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('  ✅ Popup loaded successfully');

    // Open the options page
    console.log('\n  📄 Opening options page...');
    const optionsPage = await context.newPage();

    optionsPage.on('console', (msg) => {
      const msgType = msg.type();
      const isError = msgType === 'error';
      const isWarning = msgType === 'warning';

      if (isError) {
        consoleErrors.push(`[Options] ${msg.text()}`);
      }

      if (isWarning) {
        consoleWarnings.push(`[Options] ${msg.text()}`);
      }
    });

    optionsPage.on('pageerror', (error) => {
      consoleErrors.push(`[Options:PageError] ${error.message}`);
    });

    await optionsPage.goto(
      `chrome-extension://${extensionId}/options/options.html`,
    );
    await optionsPage.waitForLoadState('domcontentloaded');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('  ✅ Options page loaded successfully');

    // Report results
    console.log('\n' + '='.repeat(60));
    console.log('  SMOKE TEST RESULTS');
    console.log('='.repeat(60));

    const hasErrors = consoleErrors.length > 0;
    const hasWarnings = consoleWarnings.length > 0;

    if (hasWarnings) {
      console.log(`\n  ⚠️  Warnings (${String(consoleWarnings.length)}):`);
      for (const warning of consoleWarnings) {
        console.log(`     ${warning}`);
      }
    }

    if (hasErrors) {
      console.log(`\n  ❌ Errors (${String(consoleErrors.length)}):`);
      for (const error of consoleErrors) {
        console.log(`     ${error}`);
      }
      throw new Error(
        `Smoke test failed with ${String(consoleErrors.length)} console error(s)`,
      );
    }

    console.log('\n  ✅ No console errors detected');
    console.log('  ✅ All pages loaded without crashes');
    console.log('\n  🎉 SMOKE TEST PASSED\n');

  } finally {
    const hasContext = context !== null;

    if (hasContext) {
      await context.close();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Main                                                              */
/* ------------------------------------------------------------------ */

async function runSmokeTest(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('  Marco Extension — Smoke Test');
  console.log('═'.repeat(60));

  try {
    validateDistStructure();
    validateManifest();
    await loadExtensionAndCheck();
    process.exit(0);
  } catch (testError) {
    const errorMessage = testError instanceof Error
      ? testError.message
      : String(testError);

    console.error(`\n  ❌ SMOKE TEST FAILED: ${errorMessage}\n`);
    process.exit(1);
  }
}

void runSmokeTest();
