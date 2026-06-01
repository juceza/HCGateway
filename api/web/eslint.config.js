// ESLint (flat config) for the HCGateway web SPA (Vite + React + TypeScript).
// Recommended base (@eslint/js + typescript-eslint + react-hooks/react-refresh)
// plus the company-wide standard: deterministic import ordering
// (simple-import-sort), removal of unused imports (unused-imports) and the
// recommended eslint-plugin-react rules. eslint-config-prettier comes last,
// disabling rules that conflict with formatting.
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config([
  // Ignore build artifacts and auto-generated route tree.
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '**/routeTree.gen.ts',
      '**/*.gen.ts',
      '*.config.js',
      '*.config.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    plugins: {
      react,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,

      'no-console': 'warn',

      // Unused imports become a warning with autofix; names prefixed with `_`
      // are intentionally ignored.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],

      // Deterministic ordering of imports/exports, with groups adapted to this
      // project's structure (alias `@/` → `src/`).
      'sort-imports': 'off',
      'simple-import-sort/exports': 'warn',
      'simple-import-sort/imports': [
        'warn',
        {
          groups: [
            ['^node:'],
            ['^react', '^react-dom'],
            ['^@tanstack'],
            ['^@?\\w'],
            ['^vite'],
            ['^.+\\.s?css$'],
            ['^@/lib'],
            ['^@/components/ui'],
            ['^@/components'],
            ['^@/'],
            [
              '^\\./?$',
              '^\\.(?!/?$)',
              '^\\.\\./?$',
              '^\\.\\.(?!/?$)',
              '^\\.\\./\\.\\./?$',
              '^\\.\\./\\.\\.(?!/?$)',
            ],
          ],
        },
      ],

      // TypeScript handles prop typing; prop-types is redundant.
      'react/prop-types': 'off',
      'react/jsx-curly-brace-presence': [
        'warn',
        { props: 'never', children: 'never' },
      ],
    },
  },
  // shadcn/ui components export variants (e.g. `buttonVariants`) alongside the
  // component; the fast-refresh warning does not apply to that generated pattern.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Tests may use intentional constant expressions to exercise behaviour, and
  // define inline wrapper components (e.g. QueryClientProvider) that don't need
  // a display name.
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-constant-binary-expression': 'off',
      'react/display-name': 'off',
    },
  },
  // Disable rules that conflict with Prettier (must come last).
  eslintConfigPrettier,
]);
