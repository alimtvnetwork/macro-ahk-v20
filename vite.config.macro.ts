import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite build config for standalone macro-controller scripts.
 *
 * Compiles TypeScript source → single IIFE JS bundle for injection.
 * Output: standalone-scripts/macro-controller/dist/macro-looping.js
 *
 * Usage: npm run build:macro
 *
 * Always uses inline sourcemaps so injected code produces readable stack traces.
 * Scripts are injected as raw code strings — external .map files are never loaded.
 */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: 'standalone-scripts/macro-controller/dist',
    emptyOutDir: false,
    sourcemap: 'inline',
    minify: mode !== 'development' ? 'esbuild' : false,
    lib: {
      entry: resolve(__dirname, 'standalone-scripts/macro-controller/src/index.ts'),
      name: 'MacroLoopController',
      formats: ['iife'],
      fileName: () => 'macro-looping.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@macro': resolve(__dirname, 'standalone-scripts/macro-controller/src'),
    },
  },
}));
