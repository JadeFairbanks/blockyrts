declare module 'virtual:sim-docs' {
  import type { SimDocs } from '../core/docs.ts';
  export const docs: SimDocs;
  export const commit: string;
  export const builtAt: string;
}
