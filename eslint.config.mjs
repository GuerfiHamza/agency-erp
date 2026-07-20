import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

/**
 * Flat config — the format `@next/eslint-plugin-next` defaults to in Next 16.
 * `next lint` was removed in Next 16, so ESLint runs via the `lint` script.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      // "Avoid any" from the project code standards, enforced rather than asked for.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Dead code is a review target, so make it a build failure instead.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  {
    // Clean-architecture boundary: UI renders, it does not reach the database.
    // Data access belongs in a repository, orchestration in a service.
    files: ['src/components/**/*.{ts,tsx}', 'src/app/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/db',
              message: 'UI must not query the database directly. Call a service, which calls a repository.',
            },
            {
              name: 'drizzle-orm',
              message: 'Keep Drizzle inside the repository layer.',
            },
            {
              name: 'pg',
              message: 'Keep the Postgres driver inside src/db.',
            },
          ],
          patterns: [
            {
              group: ['@/db/*'],
              message: 'UI must not import database internals. Call a service instead.',
            },
          ],
        },
      ],
    },
  },

  {
    // The logger is the intended console boundary.
    files: ['src/lib/logger.ts'],
    rules: { 'no-console': 'off' },
  },

  // Must stay last: switches off stylistic rules that would fight Prettier.
  prettier,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'drizzle/**',
    'graphify-out/**',
    'coverage/**',
  ]),
]);

export default eslintConfig;
