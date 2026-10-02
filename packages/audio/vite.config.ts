import { defineConfig } from 'vite';

// The audition page: `pnpm --filter @blockyrts/audio dev`, then open http://localhost:5174.
export default defineConfig({
  server: { port: 5174 },
  preview: { port: 5174 },
  worker: { format: 'es' },
  base: './',
  build: { target: 'es2022' },
});
