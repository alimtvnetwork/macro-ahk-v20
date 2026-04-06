#!/usr/bin/env node
/**
 * sync-shared-deps.mjs
 *
 * Scans all external (bare-specifier) imports used by files under root `src/`
 * and ensures they appear in `chrome-extension/package.json` dependencies.
 * Missing packages are copied from the root `package.json` with their version.
 *
 * Usage:
 *   node chrome-extension/scripts/sync-shared-deps.mjs          # dry-run (report only)
 *   node chrome-extension/scripts/sync-shared-deps.mjs --write  # write changes
 *
 * Exit codes:
 *   0 — in sync (or --write succeeded)
 *   1 — out of sync (dry-run) or error
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, extname, join } from 'path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const EXT_DIR = resolve(import.meta.dirname, '..');
const SRC_DIR = resolve(ROOT, 'src');

const SHIM_MAP_FILE = resolve(EXT_DIR, 'src', 'shims');

/* ------------------------------------------------------------------ */
/*  1. Discover which packages have local shims                       */
/* ------------------------------------------------------------------ */

function getShimmedPackages() {
  /** Packages that are aliased to local shims (don't need real deps). */
  const shimmed = new Set();
  try {
    for (const f of readdirSync(SHIM_MAP_FILE)) {
      // e.g. "monaco-react.tsx" → handled via manual alias, skip
      // "sonner.tsx" → package "sonner" is shimmed
      const base = f.replace(/\.(tsx?|jsx?)$/, '');
      // Only add simple names (not things like "monaco-react")
      if (!base.includes('-') || base === 'sonner') {
        shimmed.add(base);
      }
    }
  } catch {
    // shims dir may not exist
  }
  return shimmed;
}

/* ------------------------------------------------------------------ */
/*  2. Scan src/ for bare-specifier imports                           */
/* ------------------------------------------------------------------ */

const IMPORT_RE = /(?:from\s+|import\s*\(?\s*)['"]([^./'"@][^'"]*|@[^/'"]+\/[^'"]+)['"]/g;

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      results.push(...walk(full));
    } else if (['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name))) {
      results.push(full);
    }
  }
  return results;
}

function scanImports() {
  const packages = new Set();
  for (const file of walk(SRC_DIR)) {
    const content = readFileSync(file, 'utf-8');
    for (const match of content.matchAll(IMPORT_RE)) {
      let spec = match[1];
      // Normalise to package name (strip deep paths)
      if (spec.startsWith('@')) {
        // @scope/pkg/deep → @scope/pkg
        const parts = spec.split('/');
        spec = parts.slice(0, 2).join('/');
      } else {
        spec = spec.split('/')[0];
      }
      packages.add(spec);
    }
  }
  return packages;
}

/* ------------------------------------------------------------------ */
/*  3. Diff against chrome-extension/package.json                     */
/* ------------------------------------------------------------------ */

/** Packages we never need to sync (dev-only, or handled by aliases). */
const IGNORE = new Set([
  // Always aliased in vite.config.ts
  '@monaco-editor/react',
  // Dev/test only
  '@testing-library/react',
  '@testing-library/dom',
  '@testing-library/jest-dom',
  'vitest',
]);

function run() {
  const write = process.argv.includes('--write');
  const shimmed = getShimmedPackages();

  const rootPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
  const extPkgPath = resolve(EXT_DIR, 'package.json');
  const extPkg = JSON.parse(readFileSync(extPkgPath, 'utf-8'));

  const rootDeps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
  const extDeps = { ...extPkg.dependencies, ...extPkg.devDependencies };

  const needed = scanImports();
  const missing = [];

  for (const pkg of [...needed].sort()) {
    if (IGNORE.has(pkg)) continue;
    if (shimmed.has(pkg)) continue;
    if (extDeps[pkg]) continue;

    const version = rootDeps[pkg];
    if (version) {
      missing.push({ pkg, version });
    }
    // If not in root either, it's likely a transitive dep — skip
  }

  if (missing.length === 0) {
    console.log('[OK] chrome-extension/package.json is in sync with src/ imports');
    process.exit(0);
  }

  console.log(`\n  Found ${missing.length} missing package(s):\n`);
  for (const { pkg, version } of missing) {
    console.log(`    + ${pkg}: ${version}`);
  }

  if (!write) {
    console.log('\n  Run with --write to update chrome-extension/package.json\n');
    process.exit(1);
  }

  // Add to dependencies
  extPkg.dependencies = extPkg.dependencies || {};
  for (const { pkg, version } of missing) {
    extPkg.dependencies[pkg] = version;
  }

  // Sort dependencies alphabetically
  extPkg.dependencies = Object.fromEntries(
    Object.entries(extPkg.dependencies).sort(([a], [b]) => a.localeCompare(b)),
  );

  writeFileSync(extPkgPath, JSON.stringify(extPkg, null, 2) + '\n');
  console.log(`\n  [OK] Updated chrome-extension/package.json (${missing.length} added)\n`);
  console.log('  Run pnpm install to fetch them.\n');
  process.exit(0);
}

run();
