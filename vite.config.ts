import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// Midnight's ledger/runtime ship as WASM with top-level await.
export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  resolve: {
    conditions: ['browser', 'import', 'module', 'default'],
  },
  define: {
    'process.env': {},
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/onchain-runtime-v3', '@midnight-ntwrk/ledger-v8'],
    esbuildOptions: { target: 'esnext' },
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 8000,
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
});
