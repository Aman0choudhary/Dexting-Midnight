import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

// Vite's esnext target preserves native top-level await. The Midnight ledger
// runtime is loaded through vite-plugin-wasm without the incompatible SWC
// top-level-await transform.
export default defineConfig({
  plugins: [react(), wasm()],
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
    plugins: () => [wasm()],
  },
});
