import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite build config for Riseup Macro SDK.
 * See: spec/05-chrome-extension/63-rise-up-macro-sdk.md
 *
 * Compiles TypeScript source → single IIFE JS bundle for MAIN world injection.
 * Output: standalone-scripts/marco-sdk/dist/marco-sdk.js
 *
 * Usage: npm run build:sdk
 *        npm run build:sdk -- --mode development  (inline source maps)
 *
 * Dev mode (--mode development): inline sourcemaps for readable injected stack traces.
 * Prod mode (default): no sourcemaps for smaller bundles.
 */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: 'standalone-scripts/marco-sdk/dist',
    emptyOutDir: false,
    sourcemap: mode === 'development' ? 'inline' : false,
    minify: mode !== 'development' ? 'esbuild' : false,
    lib: {
      entry: resolve(__dirname, 'standalone-scripts/marco-sdk/src/index.ts'),
      name: 'MarcoSDK',
      formats: ['iife'],
      fileName: () => 'marco-sdk.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@sdk': resolve(__dirname, 'standalone-scripts/marco-sdk/src'),
    },
  },
}));
