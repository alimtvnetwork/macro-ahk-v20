import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite build config for standalone macro-controller scripts.
 *
 * Compiles TypeScript source → single IIFE JS bundle for injection.
 * Output: standalone-scripts/macro-controller/dist/macro-looping.js
 *
 * Usage: npm run build:macro-controller
 *        npm run build:macro-controller -- --mode development  (inline source maps)
 *
 * Dev mode (--mode development): inline sourcemaps for readable injected stack traces.
 * Prod mode (default): no sourcemaps for smaller bundles.
 */
export default defineConfig(({ mode }) => ({
  publicDir: false,
  build: {
    outDir: 'standalone-scripts/macro-controller/dist',
    emptyOutDir: false,
    sourcemap: mode === 'development' ? 'inline' : false,
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
