import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { generateAutoAliases } from './scripts/vite-plugin-auto-alias';

/**
 * Custom plugin that copies manifest.json to dist/ and rewrites
 * source paths (src/...) to their built equivalents.
 */
function copyManifest(): Plugin {
  return {
    name: 'copy-manifest',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      const manifest = JSON.parse(
        readFileSync(
          resolve(__dirname, 'manifest.json'),
          'utf-8',
        ),
      );

      // Rewrite paths from src/ references to dist/ output paths
      // NOTE: Vite preserves directory structure for HTML entries, so HTML
      // files end up at dist/src/popup/popup.html (not dist/popup/popup.html).
      // JS entry points use the rollup input key as their path.
      manifest.background.service_worker = 'background/index.js';

      manifest.action.default_popup = 'src/popup/popup.html';
      manifest.action.default_icon = {
        '16': 'assets/icons/icon-16.png',
        '48': 'assets/icons/icon-48.png',
        '128': 'assets/icons/icon-128.png',
      };

      manifest.options_page = 'src/options/options.html';

      manifest.icons = {
        '16': 'assets/icons/icon-16.png',
        '48': 'assets/icons/icon-48.png',
        '128': 'assets/icons/icon-128.png',
      };

      // Rewrite content_scripts paths from src/ to built output
      if (manifest.content_scripts) {
        for (const cs of manifest.content_scripts) {
          cs.js = cs.js.map((f: string) =>
            f.replace(/^src\/content-scripts\/(.+)\.ts$/, 'content-scripts/$1.js'),
          );
        }
      }

      manifest.web_accessible_resources = [
        {
          resources: ['wasm/sql-wasm.wasm', 'build-meta.json', 'prompts/macro-prompts.json', 'projects/scripts/*/*'],
          matches: ['<all_urls>'],
        },
      ];

      writeFileSync(
        resolve(distDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );
    },
  };
}

/**
 * Custom plugin that copies icon assets to dist/assets/icons/.
 */
function copyIcons(): Plugin {
  return {
    name: 'copy-icons',
    writeBundle() {
      const destDir = resolve(__dirname, 'dist', 'assets', 'icons');
      const srcDir = resolve(__dirname, 'src', 'assets', 'icons');

      mkdirSync(destDir, { recursive: true });

      for (const size of ['16', '48', '128']) {
        const filename = `icon-${size}.png`;
        const srcPath = resolve(srcDir, filename);

        if (existsSync(srcPath)) {
          copyFileSync(srcPath, resolve(destDir, filename));
        }
      }
    },
  };
}

/**
 * Post-build validation plugin that scans the background bundle
 * for dynamic import() calls. Service workers cannot use import(),
 * so the build MUST fail if any are found.
 *
 * @see .lovable/memory/development/error-rca-sw-boot-chain.md
 */
function validateNoBackgroundDynamicImport(): Plugin {
  return {
    name: 'validate-no-bg-dynamic-import',
    writeBundle() {
      const bgDir = resolve(__dirname, 'dist', 'background');

      if (!existsSync(bgDir)) {
        return;
      }

      const jsFiles = readdirSync(bgDir).filter((f) => f.endsWith('.js'));
      const violations: string[] = [];

      for (const file of jsFiles) {
        const filePath = resolve(bgDir, file);
        const content = readFileSync(filePath, 'utf-8');

        // Match dynamic import() but not static import declarations.
        // Dynamic import() appears as a function call: import("...") or import('...')
        // Static imports are statements: import { x } from '...' or import x from '...'
        // We look for import( preceded by non-word chars (operators, assignment, return, etc.)
        const dynamicImportPattern = /(?<!\w)import\s*\(/g;
        const matches = [...content.matchAll(dynamicImportPattern)];

        if (matches.length > 0) {
          violations.push(`  ✗ background/${file}: ${matches.length} dynamic import() call(s) found`);
        }
      }

      if (violations.length > 0) {
        const message = [
          '',
          '╔══════════════════════════════════════════════════════════════╗',
          '║  BUILD FAILED: Dynamic import() in background bundle       ║',
          '╚══════════════════════════════════════════════════════════════╝',
          '',
          'Service workers cannot use dynamic import().',
          'Ensure all shared modules are covered by manualChunks().',
          '',
          ...violations,
          '',
          'See: .lovable/memory/development/error-rca-sw-boot-chain.md',
          '',
        ].join('\n');

        throw new Error(message);
      }
    },
  };
}

/**
 * Generates build-meta.json in dist/ with a unique buildId.
 * Used by the service worker's hot-reload module to detect
 * when a new build has been deployed.
 */
function generateBuildMeta(): Plugin {
  return {
    name: 'generate-build-meta',
    writeBundle() {
      const distDir = resolve(__dirname, 'dist');

      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }

      const buildId = Math.random().toString(36).slice(2, 10);
      const meta = {
        buildId,
        timestamp: new Date().toISOString(),
      };

      writeFileSync(
        resolve(distDir, 'build-meta.json'),
        JSON.stringify(meta, null, 2),
      );
    },
  };
}

/**
 * Copies compiled standalone scripts into dist/projects/scripts/.
 * Scans standalone-scripts/{name}/script-manifest.json for output metadata.
 */
function copyProjectScripts(): Plugin {
  return {
    name: 'copy-project-scripts',
    writeBundle() {
      const buildDistDir = resolve(__dirname, 'dist');
      const projectsBaseDir = resolve(buildDistDir, 'projects', 'scripts');
      mkdirSync(projectsBaseDir, { recursive: true });

      const standaloneDir = resolve(__dirname, '..', 'standalone-scripts');
      if (!existsSync(standaloneDir)) return;

      const scriptFolders = readdirSync(standaloneDir, { withFileTypes: true })
        .filter(d => d.isDirectory());

      let copiedCount = 0;

      for (const folder of scriptFolders) {
        const manifestPath = resolve(standaloneDir, folder.name, 'script-manifest.json');
        if (!existsSync(manifestPath)) continue;

        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
          const outputFile = manifest.outputFile;
          if (!outputFile) continue;

          // Per-project subfolder
          const projectDir = resolve(projectsBaseDir, folder.name);
          mkdirSync(projectDir, { recursive: true });

          // Copy main JS bundle from dist/
          const srcFile = resolve(standaloneDir, folder.name, 'dist', outputFile);
          if (!existsSync(srcFile)) {
            console.warn(`[copy-project-scripts] dist/${outputFile} not found for ${folder.name}, skipping`);
            continue;
          }

          copyFileSync(srcFile, resolve(projectDir, outputFile));
          copiedCount++;

          // Copy ALL dist/ artifacts into the project subfolder
          const scriptDistDir = resolve(standaloneDir, folder.name, 'dist');
          if (existsSync(scriptDistDir)) {
            const distFiles = readdirSync(scriptDistDir).filter(
              (f) => !f.startsWith('.'),
            );
            for (const distFile of distFiles) {
              if (distFile === outputFile) continue;
              const src = resolve(scriptDistDir, distFile);
              const dest = resolve(projectDir, distFile);
              copyFileSync(src, dest);
              console.log(`[copy-project-scripts]   + ${folder.name}/${distFile}`);
            }
          }

          // Copy manifest itself for runtime reference
          copyFileSync(manifestPath, resolve(projectDir, 'script-manifest.json'));
        } catch (e) {
          console.warn(`[copy-project-scripts] Failed to process ${folder.name}: ${e}`);
        }
      }

      if (copiedCount > 0) {
        console.log(`[copy-project-scripts] Copied ${copiedCount} project(s) to dist/projects/scripts/`);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development';

  // Pre-build check: ensure standalone xpath.js is compiled
  const xpathDistPath = resolve(__dirname, '..', 'standalone-scripts', 'xpath', 'dist', 'xpath.js');
  if (!existsSync(xpathDistPath)) {
    throw new Error(
      [
        '',
        'BUILD ABORTED: standalone-scripts/xpath/dist/xpath.js not found.',
        '',
        'The XPath standalone script must be compiled before the extension build.',
        'Run: npm run build:xpath   (from repo root)',
        'Or:  .\\run.ps1 -d         (full pipeline)',
        '',
      ].join('\n'),
    );
  }

  // Pre-build check: ensure SDK IIFE bundle is compiled
  const sdkDistPath = resolve(__dirname, '..', 'standalone-scripts', 'marco-sdk', 'dist', 'marco-sdk.js');
  if (!existsSync(sdkDistPath)) {
    throw new Error(
      [
        '',
        'BUILD ABORTED: standalone-scripts/marco-sdk/dist/marco-sdk.js not found.',
        '',
        'The Riseup Macro SDK must be compiled before the extension build.',
        'Run: npm run build:sdk   (from repo root)',
        'Or:  .\\run.ps1 -d       (full pipeline)',
        '',
      ].join('\n'),
    );
  }

  return {
    plugins: [
      react(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/sql.js/dist/sql-wasm.wasm',
            dest: 'wasm',
          },
          {
            src: '../dist/prompts/macro-prompts.json',
            dest: 'prompts',
          },
        ],
      }),
      copyManifest(),
      copyIcons(),
      validateNoBackgroundDynamicImport(),
      generateBuildMeta(),
      copyProjectScripts(),
    ],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
      minify: false,
      modulePreload: false,
      rollupOptions: {
        input: {
          'background/index': resolve(__dirname, 'src/background/index.ts'),
          'popup/popup': resolve(__dirname, 'src/popup/popup.html'),
          'options/options': resolve(__dirname, 'src/options/options.html'),
          'content-scripts/xpath-recorder': resolve(__dirname, 'src/content-scripts/xpath-recorder.ts'),
          'content-scripts/network-reporter': resolve(__dirname, 'src/content-scripts/network-reporter.ts'),
          'content-scripts/message-relay': resolve(__dirname, 'src/content-scripts/message-relay.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          /**
           * CRITICAL: Service workers cannot use dynamic import().
           * Force all background dependencies into the background bundle
           * to prevent Vite from code-splitting shared modules into
           * separate chunks loaded via import().
           * See: https://github.com/nicedoc/nicedoc/issues/1356
           */
          manualChunks(id) {
            // Keep everything imported by the background entry inline
            // to avoid dynamic import() in the service worker context.
            if (id.includes('src/background/') || id.includes('src/shared/')) {
              return 'background/index';
            }
          },
        },
      },
    },
    resolve: {
      alias: [
        // Auto-generated aliases from chrome-extension/package.json deps
        // (skips shimmed packages like sonner, @monaco-editor/react)
        ...generateAutoAliases(__dirname),

        // Manual shims — override auto aliases
        { find: 'sonner', replacement: resolve(__dirname, 'src/shims/sonner.tsx') },
        { find: '@monaco-editor/react', replacement: resolve(__dirname, 'src/shims/monaco-react.tsx') },

        // Project path aliases
        { find: '@', replacement: resolve(__dirname, '..', 'src') },
        { find: '@ext', replacement: resolve(__dirname, 'src') },
        { find: '@standalone', replacement: resolve(__dirname, '..', 'standalone-scripts') },
      ],
    },
  };
});
