// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// The only Math members the simulation may use (docs/technical-decisions.md, decision 2).
const ALLOWED_MATH = 'imul|floor|trunc|min|max|abs';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/.vite/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['packages/client/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  {
    // Determinism rules for the simulation source. Tests may use anything.
    files: ['packages/sim/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-globals': [
        'error',
        ...['Date', 'setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval', 'queueMicrotask',
          'requestAnimationFrame', 'performance', 'window', 'document', 'self', 'globalThis', 'process', 'crypto',
          'structuredClone', 'Float32Array', 'Float64Array'].map((name) => ({
          name,
          message: 'The simulation must be deterministic: no clocks, timers, host objects or float arrays.',
        })),
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `MemberExpression[object.name='Math'][property.name!=/^(${ALLOWED_MATH})$/]`,
          message: `Only Math.${ALLOWED_MATH.split('|').join(', Math.')} are allowed in the sim; use fixed.ts helpers.`,
        },
        {
          selector: "BinaryExpression[operator='/'], AssignmentExpression[operator='/=']",
          message: 'Use floorDiv from fixed.ts: the sim divides integers only.',
        },
        {
          selector: 'Literal[raw=/^[0-9]*\\.[0-9]+(e[+-]?[0-9]+)?$|^[0-9]+e-/i]',
          message: 'No fractional literals in the sim; use integer world units.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'The sim never imports three.js.' },
            { group: ['@blockyrts/client', '@blockyrts/client/*', '@blockyrts/server', '@blockyrts/server/*', '@blockyrts/tools', '@blockyrts/tools/*'], message: 'The sim never imports client, server or tools.' },
            { group: ['node:*', 'fs', 'path', 'os', 'crypto', 'worker_threads', 'perf_hooks'], message: 'The sim runs in browsers too: no Node built-ins.' },
            { group: ['**/client/**', '**/server/**', '**/tools/**'], message: 'The sim never imports client, server or tools.' },
          ],
        },
      ],
    },
  },
);
