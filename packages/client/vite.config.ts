import { defineConfig } from 'vite';

export default defineConfig({
  worker: { format: 'es' },
  // three.js alone is about 500 kB minified.
  build: { target: 'es2022', chunkSizeWarningLimit: 1000 },
});
