// The sim's export list, made at build time by vite.config.ts (simExports).
declare module 'virtual:sim-exports' {
  import type { SimDocs } from '@blockyrts/balance';
  export const docs: SimDocs;
}
